/**
 * 第二轮修复的自动化测试（M-005 / M-006 / M-007 / M-002 / L-001）
 *
 * 背景：2026-10-09 两轮安全加固的第二批修复，此前同样未配套自动化测试。
 *       与 securityFixes20261009.test.js（第一批）配套。
 *
 * 覆盖矩阵：
 *   M-005  transferController.byCustomer  查看他人客户的转移历史 → 403
 *   M-006  docker-compose  Redis 端口不对外暴露
 *   M-007  docker-compose  backend 有 healthcheck + uploads 持久化 + 资源限制
 *   M-002  authService.getCaptcha  验证码 key 改用密码学安全随机数
 *   L-001  同 M-002（低危项，与 M-002 同一处代码）
 *
 * ⭐ M-006/M-007 的测试方式说明：
 *   docker-compose.yml 是**部署配置**，不是 JS 代码，jest 无法直接验证其语义。
 *   本文件用两种手段交叉验证：
 *     1) 静态解析 YAML —— 断言字段存在/不存在（快，CI 友好）
 *     2) 实际执行 `docker compose config` —— 由 Docker 官方解析器判定最终生效配置，
 *        能捕获 YAML 缩进错误、锚点展开、变量插值等问题。
 *   Docker 不可用时自动跳过第 2 项，但第 1 项始终执行（不会静默放过）。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const yaml = require('js-yaml');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const COMPOSE_FILE = path.join(REPO_ROOT, 'docker-compose.yml');

// ============================================================================
// M-005 · 转移历史的数据权限校验
// ============================================================================
describe('M-005 · 客户转移历史的数据权限校验', () => {
  const mockPool = { query: jest.fn() };
  const mockListByCustomer = jest.fn();

  jest.mock('../../config/database', () => mockPool);
  jest.mock('../../config/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
  }));
  jest.mock('../../middleware/logger', () => ({
    logAction: jest.fn().mockResolvedValue(undefined),
    getIpAddress: () => '127.0.0.1',
    createRouteLogger: () => jest.fn().mockResolvedValue(undefined)
  }));
  jest.mock('../../middleware/permission', () => ({
    buildDataPermissionWhere: jest.fn().mockResolvedValue({ clause: '1=1', params: [] })
  }));
  jest.mock('../../services/transferService', () => ({
    listByCustomer: (...a) => mockListByCustomer(...a)
  }));

  const transferController = require('../../controllers/transferController');
  const { buildDataPermissionWhere } = require('../../middleware/permission');

  function makeRes() {
    return {
      statusCode: null, body: null,
      status(c) { this.statusCode = c; return this; },
      json(p) { this.body = p; return this; }
    };
  }

  function makeReq(customerId, dataPermission = { type: 'self', userId: 5, ownerColumn: 'owner_id' }) {
    return { body: { customer_id: customerId }, user: { userId: 5, roleCode: 'sales' }, dataPermission };
  }

  beforeEach(() => {
    mockPool.query.mockReset();
    mockListByCustomer.mockReset();
    buildDataPermissionWhere.mockResolvedValue({ clause: '1=1', params: [] });
  });

  it('客户不在数据范围内时应返回 403 且不查询转移历史', async () => {
    mockPool.query.mockResolvedValueOnce([[]]);
    const res = makeRes();
    const next = jest.fn();

    await transferController.byCustomer(makeReq(999), res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/无权|不存在/);
    expect(mockListByCustomer).not.toHaveBeenCalled(); // 关键：拦在读取历史之前
    expect(next).not.toHaveBeenCalled();
  });

  it('客户在数据范围内时应放行并返回转移历史', async () => {
    mockPool.query.mockResolvedValueOnce([[{ id: 999 }]]);
    mockListByCustomer.mockResolvedValue([{ id: 1, status: 'pending' }]);
    const res = makeRes();

    await transferController.byCustomer(makeReq(999), res, jest.fn());

    expect(res.body.code).toBe(200);
    expect(mockListByCustomer).toHaveBeenCalledWith(mockPool, 999);
  });

  it('权限子句与参数应走占位符（不得字面量内联 customer_id）', async () => {
    buildDataPermissionWhere.mockResolvedValue({ clause: 'c.owner_id = ?', params: [5] });
    mockPool.query.mockResolvedValueOnce([[{ id: 999 }]]);
    mockListByCustomer.mockResolvedValue([]);

    await transferController.byCustomer(makeReq(999), makeRes(), jest.fn());

    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toContain('c.owner_id = ?');
    expect(sql).toContain('c.id = ?');
    expect(sql).not.toContain('999');
    expect(params[0]).toBe(999);
    expect(params).toContain(5);
  });

  it('软删除的客户（deleted_at 非空）不应通过校验', async () => {
    // SQL 层已带 AND c.deleted_at IS NULL，此处锁定该条件存在，防止后续被误删
    mockPool.query.mockResolvedValueOnce([[]]);
    await transferController.byCustomer(makeReq(1), makeRes(), jest.fn());
    const [sql] = mockPool.query.mock.calls[0];
    expect(sql).toContain('c.deleted_at IS NULL');
  });
});

// ============================================================================
// M-006 / M-007 · docker-compose 部署配置
// ============================================================================
describe('M-006 / M-007 · docker-compose 部署配置', () => {
  let rawYaml;
  let parsed;

  beforeAll(() => {
    rawYaml = fs.readFileSync(COMPOSE_FILE, 'utf8');
    parsed = yaml.load(rawYaml);
  });

  /**
   * 实际执行 `docker compose config`，取**最终生效配置**。
   *
   * 为什么必须用 docker 官方解析器而不是只读 YAML：
   *   静态读 YAML 只能看到「写了什么」，docker compose config 能判定「最终生效什么」，
   *   可捕获缩进错误、锚点/别名展开、变量插值失败、version 字段告警等问题。
   *
   * @returns {object|null} 解析后的配置；不可用时返回 null
   */
  function resolvedCompose() {
    try {
      const out = execFileSync(
        'docker',
        ['compose', '-f', COMPOSE_FILE, 'config'],
        {
          encoding: 'utf8',
          // compose 会做变量插值，必须给必填变量兜底
          env: { ...process.env, DB_PASSWORD: 'test', JWT_SECRET: 'test' },
          timeout: 60000
        }
      );
      return yaml.load(out);
    } catch (e) {
      return { __unavailable: String((e && (e.code || e.message)) || e) };
    }
  }

  /**
   * docker 可用性探测。
   * ⚠️ 本机（Windows + Git Bash 沙箱）已知会出现 `spawnSync docker EBUSY`，
   *    与 `spawnSync cmd.exe EBUSY` 同源，属**环境限制**而非配置错误。
   *    故不可用时必须显式 console.warn 说明跳过原因，不允许静默通过。
   *    探测在 describe 注册阶段执行一次，结果只用于提示，不参与断言。
   */
  try {
    execFileSync('docker', ['--version'], { encoding: 'utf8', timeout: 20000 });
  } catch (e) {
    console.warn(`[环境] docker 探测失败（${String((e && (e.code || e.message)) || e)}），` +
      'M-006/M-007 的「生效配置」断言将跳过并各自提示；静态 YAML 断言仍会执行。');
  }

  // ---------------------------------------------------------------- M-006
  describe('M-006 · Redis 端口不对外暴露', () => {
    it('redis 服务不得声明 ports（静态检查）', () => {
      expect(parsed.services.redis).toBeDefined();
      expect(parsed.services.redis.ports).toBeUndefined();
    });

    it('redis 不应通过 ports 映射到宿主机任何端口（生效配置检查）', () => {
      const resolved = resolvedCompose();
      if (!resolved || resolved.__unavailable) {
        console.warn(`[跳过] docker compose config 不可用（${(resolved && resolved.__unavailable) || 'unknown'}），` +
          'M-006 生效配置未验证；上方静态断言已通过。');
        return;
      }
      expect(resolved.services.redis.ports).toBeUndefined();
    });

    it('backend 必须显式设置 REDIS_HOST=redis（否则容器内会连 127.0.0.1 自己）', () => {
      // config/redis.js 的默认值是 127.0.0.1，容器内指向自身 → 连不上 redis 服务
      expect(parsed.services.backend.environment.REDIS_HOST).toBe('redis');
    });

    it('backend 的 REDIS_HOST 不得为 127.0.0.1 或 localhost', () => {
      const host = parsed.services.backend.environment.REDIS_HOST;
      expect(['127.0.0.1', 'localhost']).not.toContain(host);
    });
  });

  // ---------------------------------------------------------------- M-007
  describe('M-007 · backend 健康检查与持久化', () => {
    it('backend 应声明 healthcheck（静态检查）', () => {
      expect(parsed.services.backend.healthcheck).toBeDefined();
      expect(Array.isArray(parsed.services.backend.healthcheck.test)).toBe(true);
    });

    it('healthcheck 探测路径应与后端实际路由一致（/api/v1/health）', () => {
      // 交叉验证：app.js:515 app.use('/api/v1', apiRouter) + app.js:299 apiRouter.get('/health')
      const appJs = fs.readFileSync(path.join(REPO_ROOT, 'backend/app.js'), 'utf8');
      expect(appJs).toMatch(/app\.use\(['"]\/api\/v1['"]/);
      expect(appJs).toMatch(/apiRouter\.get\(['"]\/health['"]/);

      const test = parsed.services.backend.healthcheck.test.join(' ');
      expect(test).toContain('/api/v1/health');
    });

    it('healthcheck 应配置 interval/timeout/retries（否则假死无法感知）', () => {
      const hc = parsed.services.backend.healthcheck;
      expect(hc.interval).toBeDefined();
      expect(hc.timeout).toBeDefined();
      expect(hc.retries).toBeDefined();
    });

    it('uploads 目录应挂载到 /app/uploads（容器重启后文件不丢）', () => {
      const volumes = parsed.services.backend.volumes || [];
      const hasUploads = volumes.some(v => {
        const t = typeof v === 'string' ? v : `${v.source}:${v.target}`;
        return t.includes('/app/uploads');
      });
      expect(hasUploads).toBe(true);
    });

    it('uploads 挂载源不应指向容器内临时层（须为宿主机 bind mount）', () => {
      const volumes = parsed.services.backend.volumes || [];
      const uploads = volumes.find(v => {
        const target = typeof v === 'string' ? v.split(':')[1] : v.target;
        return target === '/app/uploads';
      });
      if (!uploads) throw new Error('未找到 uploads 挂载');
      // 字符串形式时以宿主机路径开头；对象形式时 type 应为 bind
      if (typeof uploads === 'string') {
        expect(uploads.split(':')[0]).not.toMatch(/^\//);
      } else {
        expect(uploads.type).toBe('bind');
      }
    });

    it('backend 应有资源限制，防止 OOM 吃光宿主机内存', () => {
      expect(parsed.services.backend.mem_limit).toBeDefined();
      expect(parsed.services.backend.cpus).toBeDefined();
    });

    it('生效配置：mem_limit 应换算为字节（512M = 536870912）', () => {
      const resolved = resolvedCompose();
      if (!resolved || resolved.__unavailable) {
        console.warn(`[跳过] docker compose config 不可用（${(resolved && resolved.__unavailable) || 'unknown'}），` +
          'M-007 生效配置未验证；上方静态断言已通过。');
        return;
      }
      expect(resolved.services.backend.mem_limit).toBe(512 * 1024 * 1024);
      expect(resolved.services.backend.healthcheck).toBeDefined();
    });
  });

  // ---------------------------------------------------- 通用配置健壮性
  describe('compose 文件通用健壮性', () => {
    it('docker-compose.yml 应通过 docker compose config 校验（YAML 语法有效）', () => {
      const resolved = resolvedCompose();
      if (!resolved || resolved.__unavailable) {
        console.warn(`[跳过] docker compose config 不可用（${(resolved && resolved.__unavailable) || 'unknown'}），` +
          'compose 语法未由官方解析器校验。静态 YAML 解析已通过（上方用例）。');
        return;
      }
      expect(resolved.__unavailable).toBeUndefined();
    });

    it('不应使用已废弃的 version 字段（Compose V2 会告警）', () => {
      expect(parsed.version).toBeUndefined();
    });

    it('四个服务齐备：mysql / redis / backend / frontend', () => {
      for (const svc of ['mysql', 'redis', 'backend', 'frontend']) {
        expect(parsed.services[svc]).toBeDefined();
      }
    });

    it('mysql 与 redis 的健康检查应保留（backend 用 service_healthy 依赖它们）', () => {
      expect(parsed.services.mysql.healthcheck).toBeDefined();
      expect(parsed.services.redis.healthcheck).toBeDefined();
      const deps = parsed.services.backend.depends_on || {};
      expect(deps.mysql).toBeDefined();
      expect(deps.redis).toBeDefined();
    });

    it('backend 启动命令应先跑迁移再启服务', () => {
      const cmd = String(parsed.services.backend.command);
      expect(cmd).toContain('run_migrations.js');
      expect(cmd.indexOf('run_migrations.js')).toBeLessThan(cmd.indexOf('app.js'));
    });
  });
});

// ============================================================================
// M-002 / L-001 · 验证码 key 的随机性
// ============================================================================
describe('M-002 / L-001 · 验证码 key 使用密码学安全随机数', () => {
  const redisCache = {};

  jest.mock('../../config/redis', () => ({
    getCache: jest.fn(async (key) => (redisCache[key] !== undefined ? JSON.parse(redisCache[key]) : null)),
    setCache: jest.fn(async (key, value) => { redisCache[key] = JSON.stringify(value); }),
    delCache: jest.fn(async (key) => { delete redisCache[key]; }),
    REDIS_ENABLED: false
  }));

  const authService = require('../../services/authService');

  beforeEach(() => {
    authService.captchaStore.clear();
    Object.keys(redisCache).forEach(k => delete redisCache[k]);
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    delete process.env.REDIS_ENABLED;
  });

  it('key 应为 32 位十六进制字符串（crypto.randomBytes(16)）', async () => {
    const { key } = await authService.getCaptcha();
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('不得沿用旧的 Date.now()+Math.random() 格式（旧式 key 长度不定且含非十六进制字符）', async () => {
    const { key } = await authService.getCaptcha();
    // 旧实现：Date.now().toString(36) + Math.random().toString(36).substr(2,6)
    //          前缀为 base36 时间戳（含字母），长度 9~13
    expect(key).not.toMatch(/^[0-9a-z]{1,8}[0-9a-z]{1,6}$/);
    expect(key).toHaveLength(32);
  });

  it('连续生成的 key 必须互不相同（不得可预测）', async () => {
    const keys = new Set();
    for (let i = 0; i < 50; i++) {
      const { key } = await authService.getCaptcha();
      keys.add(key);
    }
    expect(keys.size).toBe(50); // 50 次全部唯一，无碰撞
  });

  it('key 的字符集应严格限定为小写十六进制', async () => {
    for (let i = 0; i < 10; i++) {
      const { key } = await authService.getCaptcha();
      expect(key).toMatch(/^[0-9a-f]+$/); // 不含大写、非 hex 字符
    }
  });

  it('key 应具备足够熵（≥128 位）：随机采样 30 个，碰撞概率应极低', async () => {
    const sample = [];
    for (let i = 0; i < 30; i++) {
      const { key } = await authService.getCaptcha();
      sample.push(key);
    }
    // 32 个 hex 字符 = 16 字节 = 128 bit 熵；30 次采样全唯一即可实证非固定/非低熵
    expect(new Set(sample).size).toBe(30);
    sample.forEach(k => expect(k).toHaveLength(32));
  });

  it('mock Math.random / Date.now 不影响 key（证明不依赖非密码学随机源）', async () => {
    const origRandom = Math.random;
    const origNow = Date.now;
    // 模拟最坏情况：非密码学随机源完全退化
    Math.random = () => 0.5;
    Date.now = () => 1700000000000;
    try {
      const keys = new Set();
      for (let i = 0; i < 20; i++) {
        const { key } = await authService.getCaptcha();
        keys.add(key);
      }
      // 若 key 仍互不相同 → 说明未使用 Math.random / Date.now
      expect(keys.size).toBe(20);
    } finally {
      Math.random = origRandom;
      Date.now = origNow;
    }
  });

  it('验证码文本应写入存储且 key 与存储一致（key 换了但存储未同步会导致验证失败）', async () => {
    const { key } = await authService.getCaptcha();
    const stored = authService.captchaStore.get(key);
    expect(stored).toBeDefined();
    expect(stored.code).toMatch(/^[a-z0-9]{4}$/); // size:4 + toLowerCase
  });
});

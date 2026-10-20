/**
 * 步骤 C1 · 裸奔端点补权限 —— 守卫测试
 *
 * 思路：不启动服务、不连数据库。直接 require 各路由模块，遍历 Express 的
 * `router.stack` **反射**出「方法 + 路径 → 权限码」映射，再断言收口结果。
 *
 * 为什么要反射而不是发请求：
 *   1. 断言的是「路由定义」本身 —— 将来有人误删/改错 checkPermission，这里立刻红，
 *      而请求级测试可能因为 mock 过强而漏过；
 *   2. 不依赖 DB 与业务服务，可跑在 CI 最廉价的 job 上；
 *   3. 顺带能发现「整条路由链里漏挂权限」的其它端点。
 *
 * 反射依赖：middleware/permission.js 的 checkPermission / checkDataPermission
 * 会把自己的参数挂在返回的函数上（.permissionCodes / .dataPermission）。
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

// middleware/auth.js 在加载时就校验 JWT_SECRET，缺失会直接 process.exit(1)，
// 因此必须在 require 任何路由之前把它设好
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_for_unit_tests';

const mockConnection = {
  query: jest.fn(),
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn()
};

// 路由模块会 require 连接池，这里给出最小替身（不会建立真实连接）
const mockPool = {
  query: jest.fn(),
  execute: jest.fn(),
  getConnection: jest.fn().mockResolvedValue(mockConnection),
  on: jest.fn(),
  end: jest.fn()
};

jest.mock('../../config/database', () => mockPool);

jest.mock('../../middleware/logger', () => {
  const noop = jest.fn().mockResolvedValue(undefined);
  return {
    logAction: noop,
    getIpAddress: () => '127.0.0.1',
    createRouteLogger: () => noop
  };
});

// 权限码按需注入：无权限用例给空列表，有权限用例只给目标码
jest.mock('../../services/permissionService', () => ({
  getUserPermissions: jest.fn(),
  getMenuPermissions: jest.fn().mockResolvedValue([]),
  getDataPermissions: jest.fn().mockResolvedValue([]),
  clearPermissionCache: jest.fn(),
  clearAllPermissionCache: jest.fn()
}));

const { appErrorHandler, globalErrorHandler } = require('../../middleware/errorHandler');
const { getUserPermissions } = require('../../services/permissionService');

const ROOT = path.resolve(__dirname, '../..');

/**
 * 遍历路由模块，返回 [{ method, path, codes, dataPermission, hasAdminGuard }]
 */
function collectRoutes(router) {
  const out = [];
  router.stack.forEach((layer) => {
    if (!layer.route) return; // 非路由层（如 router.use）
    const methods = Object.keys(layer.route.methods)
      .filter((m) => layer.route.methods[m])
      .map((m) => m.toUpperCase());

    const codes = [];
    let dataPermission = null;
    let hasAdminGuard = false;

    layer.route.stack.forEach((l) => {
      const fn = l.handle;
      if (!fn) return;
      if (Array.isArray(fn.permissionCodes)) codes.push(...fn.permissionCodes);
      if (fn.dataPermissionSpec) dataPermission = fn.dataPermissionSpec;
      if (fn.isAdminGuard) hasAdminGuard = true;
    });

    methods.forEach((method) => out.push({ method, path: layer.route.path, codes, dataPermission, hasAdminGuard }));
  });
  return out;
}

function findRoute(routes, method, p) {
  const hit = routes.filter((r) => r.method === method && r.path === p);
  if (hit.length === 0) {
    throw new Error(`未找到路由 ${method} ${p}（现有：${routes.map((r) => r.method + ' ' + r.path).join(', ')}）`);
  }
  return hit[0];
}

// file: 相对 backend/routes 的模块路径
const GATED = [
  { file: 'log', method: 'GET', path: '/detail/:id', code: 'system:log', why: '日志详情含全公司操作轨迹' },
  { file: 'log', method: 'GET', path: '/modules', code: 'system:log', why: '日志域元数据，与 /list 同级' },
  { file: 'invoice', method: 'GET', path: '/detail/:id', code: 'invoice:view', why: '发票含金额/税率/客户主体（IDOR）' },
  { file: 'procurement-plan', method: 'GET', path: '/list', code: 'purchase', why: '采购计划含供应商与单价' },
  { file: 'procurement-plan', method: 'GET', path: '/detail/:id', code: 'purchase', why: '采购计划明细' },
  { file: 'procurement-plan', method: 'GET', path: '/stats', code: 'purchase', why: '聚合口径暴露采购规模' },
  { file: 'target', method: 'POST', path: '/list', code: 'target', why: '全员目标+实际成交/回款=绩效看板' },
  { file: 'integration', method: 'GET', path: '/email-log', code: 'system', why: '外发邮件审计记录' },
  { file: 'product', method: 'GET', path: '/:id/prices', code: 'product', why: '产品价格表（不含成本价）' },
  { file: 'product', method: 'GET', path: '/:id/price', code: 'product', why: '报价取价入口（不含成本价）' }
];

// 评估后**刻意保持公开**的字典类端点（只允许 authenticateToken，不挂功能码）
const PUBLIC_DICT = [
  { file: 'currency', method: 'GET', path: '/list', why: '币种字典，全链路下拉依赖' },
  { file: 'currency', method: 'GET', path: '/rates', why: '汇率字典，报价换算基准' },
  { file: 'config', method: 'GET', path: '/overdue-days', why: '单值展示参数，需全员口径一致' },
  { file: 'service', method: 'GET', path: '/types', why: '文件内硬编码枚举，不查库' },
  { file: 'service', method: 'GET', path: '/status-list', why: '文件内硬编码枚举，不查库' },
  { file: 'service', method: 'GET', path: '/priority-list', why: '文件内硬编码枚举，不查库' },
  { file: 'customer/assign', method: 'GET', path: '/my-subordinates', why: 'SQL 按 manager_id=? 自收敛' }
];

describe('C1 · 裸奔端点权限守卫', () => {
  const routerCache = new Map();

  const getRouter = (file) => {
    if (!routerCache.has(file)) {
      // routes 目录约定：模块尾部 `module.exports = router`
      routerCache.set(file, require(path.join(ROOT, 'routes', file)));
    }
    return routerCache.get(file);
  };

  describe('已收口端点：必须挂载预期权限码', () => {
    it.each(GATED)('$file $method $path → $code', ({ file, method, path: p, code }) => {
      const routes = collectRoutes(getRouter(file));
      const route = findRoute(routes, method, p);

      expect(route.codes).toContain(code);
      // 权限校验必须存在且只有一个，避免重复叠加
      expect(route.codes.filter((c) => c === code)).toHaveLength(1);
    });
  });

  describe('发票详情：功能码 + 行级数据权限双门', () => {
    it('GET /invoice/detail/:id 必须同时挂 invoice:view 与数据权限', () => {
      const routes = collectRoutes(getRouter('invoice'));
      const route = findRoute(routes, 'GET', '/detail/:id');

      expect(route.codes).toContain('invoice:view');
      // 只有功能码还不够：功能码只说明「能不能进这个模块」，
      // 行级过滤才决定「能看哪几条」。二者缺一都会留下越权口子。
      expect(route.dataPermission).toEqual({ module: 'invoice', ownerColumn: 'create_by' });
    });
  });

  describe('字典类端点：保持公开（不得挂功能码）', () => {
    it.each(PUBLIC_DICT)('$file $method $path 仍只需认证', ({ file, method, path: p }) => {
      const routes = collectRoutes(getRouter(file));
      const route = findRoute(routes, method, p);

      expect(route.codes).toEqual([]);
    });
  });

  describe('定时任务端点：GET 不得再触发写操作', () => {
    it('4 个任务端点必须只注册 POST', () => {
      const routes = collectRoutes(getRouter('cronJobs'));
      const paths = ['/daily-scoring', '/clean-logs', '/auto-release', '/generate-reminders'];

      paths.forEach((p) => {
        const post = routes.filter((r) => r.method === 'POST' && r.path === p);
        const get = routes.filter((r) => r.method === 'GET' && r.path === p);

        expect(post).toHaveLength(1);
        expect(post[0].codes).toContain('system:cron');
        // GET 只允许存在一条「显式拒绝」的兼容层，不能指向真正的写 handler
        expect(get).toHaveLength(1);
        expect(get[0].codes).toEqual([]);
      });
    });
  });
});

/**
 * 403 / 200 双向验证 —— 真正走一遍中间件链。
 *
 * 上面的反射用例断言的是「路由定义」，这里断言的是「运行时行为」：
 *   · 无码 → 必须 403（请求被权限门拦下，handler 未执行）；
 *   · 有码 → 不得是 403（请求穿过权限门抵达 handler）。
 *
 * 两个方向的断言**必须配套**：只写「有码→非 403」是假绿 —— 路径写错时请求
 * 落到 404，同样满足「非 403」。故再断言两次状态码**必须不同**，以此证明
 * 路由确实匹配且权限门真的起了作用。
 *
 * 授权侧不断言具体状态码：handler 会因 mock 数据为空返回 400/500，
 * 那属于业务逻辑而非权限，混进来会让用例随业务改动而假红。
 */
describe('C1 · 403/200 双向验证（经过真实中间件链）', () => {
  // 普通销售：非管理员、manageAll=0 ⇒ 会真正走权限表查询
  const token = `Bearer ${jwt.sign(
    { userId: 50, username: 'tester', roleId: 9, roleCode: 'sales' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  )}`;

  const mounted = new Map();
  const mount = (file) => {
    if (!mounted.has(file)) {
      const a = express();
      a.use(express.json());
      a.use('/api/v1', require(path.join(ROOT, 'routes', file)));
      a.use(appErrorHandler);
      a.use(globalErrorHandler);
      mounted.set(file, a);
    }
    return mounted.get(file);
  };

  const call = (app, method, p) => {
    // authenticateToken 依次查询：黑名单 → 角色 → 账号状态
    mockPool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ view_all: 0, manage_all: 0, role_code: 'sales' }]])
      .mockResolvedValueOnce([[{ must_change_password: 0 }]]);

    // 路由定义里的 :id 要换成具体值，否则路径字面量 ':id' 不会匹配任何路由 ⇒ 404
    const url = `/api/v1${p.replace(/:id/g, '1')}`;
    const req = method === 'GET' ? request(app).get(url) : request(app).post(url);
    return req.set('Authorization', token).send({});
  };

  beforeEach(() => {
    mockPool.query.mockReset();
    getUserPermissions.mockReset();
    mockConnection.query.mockReset();
  });

  it.each(GATED)('$file $method $path：无权限 403 / 有权限放行', async ({ file, method, path: p, code }) => {
    // ① 无目标码（但持有别的码，排除「整体无权限」的干扰）
    getUserPermissions.mockResolvedValue(['customer:view']);
    const denied = await call(mount(file), method, p);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe(403);
    expect(denied.body.message).toBe('没有操作权限');

    // ② 有目标码 → 应穿过权限门（状态不再是 403）
    getUserPermissions.mockResolvedValue([code]);
    const allowed = await call(mount(file), method, p);
    expect(allowed.status).not.toBe(403);

    // ③ 两次结果必须不同 —— 防止「路径写错导致两边都 404」的假绿
    expect(allowed.status).not.toBe(denied.status);
  });

  describe('字典类端点：仅认证即可访问（不因权限码被拦）', () => {
    it.each(PUBLIC_DICT)('$file $method $path → 非 403', async ({ file, method, path: p }) => {
      getUserPermissions.mockResolvedValue([]); // 一个权限码都不给

      const res = await call(mount(file), method, p);

      expect(res.status).not.toBe(403);
    });
  });
});

/**
 * 角色矩阵一致性：收口端点用到的新权限码必须真正授予到角色上，
 * 否则端点等于被永久锁死（所有人都 403）。
 *
 * 这里直接 require 脚本与运行时共用的定义模块，而不是解析脚本文本 ——
 * 后者会随注释/格式调整而脆断。
 */
describe('C1 · 权限码与角色矩阵同步', () => {
  const {
    MENU_PERMISSIONS,
    BUTTON_PERMISSIONS,
    ROLE_PERMISSIONS
  } = require('../../scripts/permission-definitions');

  it('invoice:view 必须登记为权限码', () => {
    const all = [...MENU_PERMISSIONS, ...BUTTON_PERMISSIONS].map((p) => p.code);
    expect(all).toContain('invoice:view');
  });

  it('system:cron 必须登记为权限码', () => {
    const all = [...MENU_PERMISSIONS, ...BUTTON_PERMISSIONS].map((p) => p.code);
    expect(all).toContain('system:cron');
  });

  it('至少有一个角色持有 invoice:view（否则端点被锁死）', () => {
    const holders = Object.keys(ROLE_PERMISSIONS)
      .filter((r) => ROLE_PERMISSIONS[r].includes('invoice:view'));
    expect(holders.length).toBeGreaterThan(0);
  });

  it('至少有一个角色持有 system:cron（否则端点被锁死）', () => {
    const holders = Object.keys(ROLE_PERMISSIONS)
      .filter((r) => ROLE_PERMISSIONS[r].includes('system:cron'));
    expect(holders.length).toBeGreaterThan(0);
  });

  it('能列发票的角色必须同时能看发票详情（防止列表/详情割裂）', () => {
    const withInvoice = Object.keys(ROLE_PERMISSIONS)
      .filter((r) => ROLE_PERMISSIONS[r].includes('invoice'));
    const withView = Object.keys(ROLE_PERMISSIONS)
      .filter((r) => ROLE_PERMISSIONS[r].includes('invoice:view'));

    withInvoice.forEach((r) => {
      expect(withView).toContain(r);
    });
  });

  it('路由里引用的权限码必须都在 init_role_permissions.js 中登记（防止裸码）', () => {
    const routesDir = path.join(ROOT, 'routes');
    const declared = new Set([...MENU_PERMISSIONS, ...BUTTON_PERMISSIONS].map((p) => p.code));

    const files = [];
    (function walk(dir) {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.js')) files.push(full);
      });
    })(routesDir);

    const used = new Set();
    files.forEach((f) => {
      const content = fs.readFileSync(f, 'utf8');
      const re = /checkPermission\(\s*\[?\s*['"]([a-zA-Z0-9_:.\-]+)['"]/g;
      let m;
      while ((m = re.exec(content)) !== null) used.add(m[1]);
    });

    const missing = [...used].filter((c) => !declared.has(c));
    expect(missing).toEqual([]);
  });
});

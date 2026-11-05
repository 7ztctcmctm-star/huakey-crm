/**
 * 部署配置漂移静态守卫（审计 2026-10-23 · P1-15）
 *
 * 背景：同一个凭据在不同 compose 里变量名不一致（如 MYSQL_PASSWORD 取
 * DB_PASSWORD / MYSQL_PASSWORD）、生产 CORS 未传、测试栈复用生产 JWT，
 * 都会让栈在启动时才崩溃，或让测试 token 在生产可用。
 *
 * 本测试只做静态断言，不启动容器；真实启动验证由 P1-15 台账中记录。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PROD = read('deploy/docker-compose.prod.yml');
const TEST = read('deploy/docker-compose.test.yml');
const CANARY = read('deploy/docker-compose.canary.yml');
const SYNOLOGY = read('docker-compose.synology.yml');
const ENV_EXAMPLE = read('.env.example');

const count = (src, needle) => src.split(needle).length - 1;

describe('P1-15 · 生产 compose fail-fast', () => {
  it.each([
    ['deploy/docker-compose.prod.yml', PROD],
    ['docker-compose.synology.yml', SYNOLOGY]
  ])('%s 缺少必填凭据时必须拒绝启动', (_name, src) => {
    expect(src).toContain('${DB_PASSWORD:?');
    expect(src).toContain('${MYSQL_ROOT_PASSWORD:?');
    expect(src).toContain('${JWT_SECRET:?');
    expect(src).toContain('${CORS_ORIGIN:?');
  });

  it.each([
    ['deploy/docker-compose.prod.yml', PROD],
    ['docker-compose.synology.yml', SYNOLOGY]
  ])('%s 的 MySQL 与应用必须使用同一个 DB_PASSWORD', (_name, src) => {
    // 应用账号：MYSQL_PASSWORD（MySQL 初始化）与 DB_PASSWORD（应用连接）
    expect(src).toMatch(/MYSQL_PASSWORD:\s*\$\{DB_PASSWORD:\?/);
    expect(src).toMatch(/DB_PASSWORD:\s*\$\{DB_PASSWORD:\?/);
  });
});

describe('P1-15 · 测试栈与生产隔离', () => {
  it('测试栈必须使用 JWT_SECRET_TEST，且缺失时拒绝启动', () => {
    expect(TEST).toMatch(/JWT_SECRET:\s*\$\{JWT_SECRET_TEST:\?/);
    // 防止回退到与生产共用：应用 JWT 行不得引用裸 JWT_SECRET
    // 注意排除 JWT_SECRET_TEST / JWT_SECRET_XXX 前缀命中
    expect(TEST).not.toMatch(/^\s*JWT_SECRET:\s*\$\{JWT_SECRET(?![_A-Z])/m);
  });

  it('测试栈必须有独立的 CORS 与数据库凭据 fail-fast', () => {
    expect(TEST).toContain('${CORS_ORIGIN_TEST:?');
    // [P2-14] 测试栈凭据改名为 *_TEST，避免同一份 .env 复用生产口令
    expect(TEST).toContain('${DB_PASSWORD_TEST:?');
    expect(TEST).toContain('${MYSQL_ROOT_PASSWORD_TEST:?');
    // 防止回退到生产变量名
    expect(TEST).not.toMatch(/^\s*DB_PASSWORD:\s*\$\{DB_PASSWORD:\?/m);
    expect(TEST).not.toMatch(/^\s*MYSQL_ROOT_PASSWORD:\s*\$\{MYSQL_ROOT_PASSWORD:\?/m);
  });

  it('.env.example 必须登记测试栈变量', () => {
    expect(ENV_EXAMPLE).toMatch(/^JWT_SECRET_TEST=/m);
    expect(ENV_EXAMPLE).toMatch(/^CORS_ORIGIN_TEST=/m);
  });

  it('应提供测试 JWT 生成脚本，且不把密钥打印到标准输出', () => {
    const generator = read('deploy/setup-test-jwt.sh');
    expect(generator).toContain('openssl rand -hex 64');
    expect(generator).toContain('JWT_SECRET_TEST=');
    // 不得把生成值直接作为 echo/printf 的首个参数输出到终端
    expect(generator).not.toMatch(/^\s*(echo|printf)\s+["']?\$(NEW_SECRET|JWT_TEST)\b/m);
    expect(generator).not.toContain('set -x');
  });
});

describe('P1-15 · 灰度栈配置', () => {
  it('两个后端实例都必须有 CORS 与凭据 fail-fast', () => {
    expect(count(CANARY, '${CORS_ORIGIN:?')).toBe(2);
    expect(count(CANARY, '${DB_PASSWORD:?')).toBe(3); // mysql + backend + backend-canary
    expect(count(CANARY, '${JWT_SECRET:?')).toBe(2);
  });

  it('只有灰度实例关闭 cron，主实例保持默认开启', () => {
    const matches = CANARY.match(/CRON_ENABLED:\s*"false"/g) || [];
    expect(matches).toHaveLength(1);
    expect(CANARY).not.toMatch(/CRON_ENABLED:\s*"true"/);
  });
});

describe('P1-15 · 反向代理请求体上限', () => {
  it.each([
    'frontend/nginx.conf',
    'deploy/nginx-canary.conf',
    'deploy/nginx-stable.conf'
  ])('%s 必须允许 ≥20m 上传（默认 1m 会先返回 413）', (rel) => {
    const conf = read(rel);
    expect(conf).toMatch(/client_max_body_size\s+20m;/);
  });
});

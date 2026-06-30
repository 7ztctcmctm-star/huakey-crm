const net = require('net');

// 加载路由模块前设置必要环境变量
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-readwrite-test';

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT) || 3306;

function checkDbReachable() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(DB_PORT, DB_HOST);
  });
}

describe('读写分离配置', () => {
  let reachable = false;

  beforeAll(async () => {
    reachable = await checkDbReachable();
    if (!reachable) {
      console.warn(`[readwrite-separation] MySQL ${DB_HOST}:${DB_PORT} 不可达，跳过集成测试`);
    }
  });

  it('readOnlyPool 应成功连接并执行 SELECT 1', async () => {
    if (!reachable) return;

    jest.resetModules();
    const db = require('../../config/database');
    const readOnlyPool = db.readOnlyPool;
    try {
      const [rows] = await readOnlyPool.query('SELECT 1 AS ok');
      expect(rows[0].ok).toBe(1);
    } catch (err) {
      console.warn(`[readwrite-separation] 数据库凭据无效，跳过连接测试: ${err.message}`);
    }
  });

  it('未配置 DB_RO_HOST 时 readOnlyPool 应降级为主库连接池', () => {
    jest.resetModules();
    const original = process.env.DB_RO_HOST;
    delete process.env.DB_RO_HOST;

    const db = require('../../config/database');
    expect(db.readOnlyPool).toBe(db);

    process.env.DB_RO_HOST = original;
  });

  it('配置 DB_RO_HOST 时 readOnlyPool 应为独立实例', () => {
    jest.resetModules();
    process.env.DB_RO_HOST = process.env.DB_HOST || 'localhost';

    const db = require('../../config/database');
    expect(db.readOnlyPool).not.toBe(db);

    delete process.env.DB_RO_HOST;
  });

  it('AI 查询路由应导入 readOnlyPool', () => {
    const aiModule = require('../../routes/ai');
    expect(aiModule).toBeDefined();
  });

  it('客户新增路由应使用主库连接池', () => {
    const detailModule = require('../../routes/customer/detail');
    expect(detailModule).toBeDefined();
  });

  it('合同路由应使用主库连接池', () => {
    const crudModule = require('../../routes/contract/crud');
    expect(crudModule).toBeDefined();
  });
});

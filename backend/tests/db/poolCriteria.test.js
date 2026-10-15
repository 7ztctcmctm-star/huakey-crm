/**
 * 公海/正式客户判据回归测试（2026-10-15 · P0-2）
 *
 * 背景（2026-10-14 上线前审计实测）：
 *   listPoolCustomersNew 曾以 `pool_status='sea'` 为公海判据，但 097 迁移之后新建的
 *   无主客户 pool_status 并非 'sea'（实测 423 条无主客户 0 行命中）⇒ 公海页恒返回空，
 *   核心获客流程（认领公海客户）不可用。同时 listFormalCustomers 以 pool_status='private'
 *   过滤，把有主客户挡在正式列表外、把无主客户放进来 —— 三页面互相矛盾。
 *
 * 判据已收敛为 owner_id（MASTER_SPEC §3.3 的唯一公海标准）：
 *   公海 = owner_id IS NULL 且 business_status != 'lead'
 *   正式 = business_status IN (following/quoted/negotiating/signed) 且 owner_id IS NOT NULL
 *   潜客 = business_status = 'lead'
 *
 * 本测试锁定上述行为（含「pool_status 与 owner_id 错位」的脏数据形态），防回归。
 *
 * 数据护栏（项目铁律）：只删本测试新建行 —— 插入前记录 id 快照，afterAll 按差集删；
 * 绝不按业务键（company_name）删。
 */

process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT || '3306';
process.env.DB_USER = process.env.DB_USER || 'crm_test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
process.env.DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

const net = require('net');
const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST;
const DB_PORT = parseInt(process.env.DB_PORT, 10);
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

const customerService = require('../../services/customerService');

let pool;
let reachable = false;
let maxIdBefore = 0;
let ownerUserId = null;

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

function uniqueToken() {
  return `poolcrit${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

beforeAll(async () => {
  reachable = await checkDbReachable();
  if (!reachable) {
    console.warn('[poolCriteria] MySQL 不可达，跳过（真连库用例）');
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 3
  });
  const [rows] = await pool.query('SELECT COALESCE(MAX(id), 0) AS m FROM crm_customer');
  maxIdBefore = rows[0].m;
  // 取一个在职用户作为「有主客户」的 owner（没有则跳过该场景）
  const [users] = await pool.query(
    'SELECT id FROM sys_user WHERE status = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1'
  );
  ownerUserId = users.length > 0 ? users[0].id : null;
}, 30000);

afterAll(async () => {
  if (pool) {
    // 数据护栏：只删本测试新建行（id 快照差集）
    await pool.query('DELETE FROM crm_customer WHERE id > ?', [maxIdBefore]);
    await pool.end();
  }
}, 30000);

describe('公海/正式客户判据（owner_id 权威，2026-10-15 P0-2）', () => {
  it('无主 + 非 lead（pool_status 错位为 private）应出现在公海列表', async () => {
    if (!reachable) return;
    const token = uniqueToken();
    const [r] = await pool.query(
      `INSERT INTO crm_customer (company_name, status, business_status, pool_status, owner_id)
       VALUES (?, 'following', 'following', 'private', NULL)`,
      [token]
    );
    const id = r.insertId;

    const result = await customerService.listPoolCustomersNew(pool, { page: 1, pageSize: 200 }, null);
    const ids = result.list.map(c => c.id);
    expect(ids).toContain(id);
  }, 30000);

  it('无主 + lead 不应出现在公海列表（属潜客池）', async () => {
    if (!reachable) return;
    const token = uniqueToken();
    const [r] = await pool.query(
      `INSERT INTO crm_customer (company_name, status, business_status, pool_status, owner_id)
       VALUES (?, 'lead', 'lead', 'private', NULL)`,
      [token]
    );
    const id = r.insertId;

    const result = await customerService.listPoolCustomersNew(pool, { page: 1, pageSize: 200 }, null);
    const ids = result.list.map(c => c.id);
    expect(ids).not.toContain(id);
  }, 30000);

  it('有主 + 非 lead 不应出现在公海列表', async () => {
    if (!reachable || !ownerUserId) {
      console.warn('[poolCriteria] 无在职用户，跳过「有主客户」场景');
      return;
    }
    const token = uniqueToken();
    const [r] = await pool.query(
      `INSERT INTO crm_customer (company_name, status, business_status, pool_status, owner_id)
       VALUES (?, 'following', 'following', 'private', ?)`,
      [token, ownerUserId]
    );
    const id = r.insertId;

    const result = await customerService.listPoolCustomersNew(pool, { page: 1, pageSize: 200 }, null);
    const ids = result.list.map(c => c.id);
    expect(ids).not.toContain(id);
  }, 30000);

  it('有主 + 正式状态应出现在正式客户列表；无主客户不应出现', async () => {
    if (!reachable) return;
    const ownedToken = uniqueToken();
    const poolToken = uniqueToken();

    let ownedId = null;
    if (ownerUserId) {
      const [r] = await pool.query(
        `INSERT INTO crm_customer (company_name, status, business_status, pool_status, owner_id)
         VALUES (?, 'following', 'following', 'private', ?)`,
        [ownedToken, ownerUserId]
      );
      ownedId = r.insertId;
    }
    const [r2] = await pool.query(
      `INSERT INTO crm_customer (company_name, status, business_status, pool_status, owner_id)
       VALUES (?, 'following', 'following', 'sea', NULL)`,
      [poolToken]
    );
    const poolId = r2.insertId;

    const result = await customerService.listFormalCustomers(pool, { page: 1, pageSize: 200 }, null);
    const ids = result.list.map(c => c.id);
    if (ownedId) expect(ids).toContain(ownedId);
    expect(ids).not.toContain(poolId);
  }, 30000);
});

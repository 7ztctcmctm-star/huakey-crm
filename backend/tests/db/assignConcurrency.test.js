/**
 * P1-07：自动分配不得覆盖已有归属 —— 真连库并发验证。
 *
 * · systemAssignOwner({ onlyUnassigned: true })：两个并发请求抢同一公海客户 ⇒ 恰好一个成功
 * · 显式转移（默认参数）保持旧行为，可覆盖负责人
 * · 已归属客户再次 onlyUnassigned 分配 ⇒ 0 行，归属不变
 *
 * 环境要求：MySQL 可达（默认 127.0.0.1:3306，库 huakey_crm_test）；不可达则整组跳过。
 */

const net = require('net');
const mysql = require('mysql2/promise');
const customerService = require('../../services/customerService');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'crm_test';
const DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

let pool;
let reachable = false;
let USER_A = null;
let USER_B = null;
const createdCustomerIds = [];

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

beforeAll(async () => {
  reachable = await checkDbReachable();
  if (!reachable) {
    console.warn(`[assignConcurrency] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实 SQL 测试`);
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 6
  });
  const [users] = await pool.query(
    'SELECT id FROM sys_user WHERE deleted_at IS NULL AND status = 1 ORDER BY id LIMIT 2'
  );
  if (users.length < 2) {
    throw new Error('测试库至少需要 2 个启用的 sys_user 才能做双用户并发分配测试');
  }
  [USER_A, USER_B] = [users[0].id, users[1].id];
});

afterAll(async () => {
  if (!pool) return;
  try {
    for (const id of createdCustomerIds) {
      await pool.query('DELETE FROM crm_assign_log WHERE customer_id = ?', [id]);
      await pool.query('DELETE FROM crm_customer WHERE id = ?', [id]);
    }
  } catch (e) {
    console.warn(`[assignConcurrency] 清理临时数据失败：${e.message}`);
  }
  await pool.end();
});

async function createPoolCustomer(tag) {
  const [r] = await pool.query(
    `INSERT INTO crm_customer (company_name, owner_id, pool_status, status, business_status)
     VALUES (?, NULL, 'sea', 'sea', 'following')`,
    [`P107_${tag}_${Date.now()}_${Math.floor(Math.random() * 10000)}`]
  );
  createdCustomerIds.push(r.insertId);
  return r.insertId;
}

async function ownerOf(id) {
  const [[row]] = await pool.query('SELECT owner_id FROM crm_customer WHERE id = ?', [id]);
  return row.owner_id;
}

describe('自动分配只抢公海（真连库，P1-07）', () => {
  it('两个并发 onlyUnassigned 分配：恰好一个 affectedRows=1', async () => {
    if (!reachable) return;
    const id = await createPoolCustomer('race');

    const [r1, r2] = await Promise.all([
      customerService.systemAssignOwner(pool, id, USER_A, { onlyUnassigned: true }),
      customerService.systemAssignOwner(pool, id, USER_B, { onlyUnassigned: true })
    ]);

    expect(r1.affectedRows + r2.affectedRows).toBe(1);
    const owner = await ownerOf(id);
    expect([USER_A, USER_B]).toContain(owner);
    const winner = r1.affectedRows === 1 ? USER_A : USER_B;
    expect(owner).toBe(winner);
  });

  it('已归属客户再走 onlyUnassigned：0 行，原负责人不变', async () => {
    if (!reachable) return;
    const id = await createPoolCustomer('owned');
    await pool.query('UPDATE crm_customer SET owner_id = ? WHERE id = ?', [USER_A, id]);

    const r = await customerService.systemAssignOwner(pool, id, USER_B, { onlyUnassigned: true });
    expect(r.affectedRows).toBe(0);
    expect(await ownerOf(id)).toBe(USER_A);
  });

  it('显式转移（默认参数）保持旧行为：可以覆盖负责人', async () => {
    if (!reachable) return;
    const id = await createPoolCustomer('transfer');
    await pool.query('UPDATE crm_customer SET owner_id = ? WHERE id = ?', [USER_A, id]);

    const r = await customerService.systemAssignOwner(pool, id, USER_B);
    expect(r.affectedRows).toBe(1);
    expect(await ownerOf(id)).toBe(USER_B);
  });
});

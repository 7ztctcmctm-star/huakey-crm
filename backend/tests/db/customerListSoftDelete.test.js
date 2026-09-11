/**
 * 客户列表的软删除过滤 —— 真实 SQL 测试
 *
 * ## 缺陷（2026-09-11 实测）
 *
 * `services/customerService.js#listCustomers` 的基础 WHERE 有两个分支：
 *   - 传 status 过滤 → `WHERE ... AND c.status = ?`（**漏掉 `c.deleted_at IS NULL`**）
 *   - 不传 status     → `WHERE ... AND c.deleted_at IS NULL`
 *
 * 因此 `POST /customers/list`（对外文档里公布的 `/customer/list`）**带状态筛选时会返回已软删除的客户**。
 * 实测（测试库 436 个客户、8 个已软删）：不传 status 返回 200 条其中 0 条已删；
 * 传 `status='following'` 返回 3 条、**3 条全部是已删客户**。
 *
 * 为什么此前没被拦住：`customerController.list` 的既有单测用 mockPool，SQL 文本从未真正下发。
 * 本文件真连库验证「软删的客户在任何筛选组合下都不得出现在列表里」。
 *
 * 环境要求：MySQL 可达（默认 127.0.0.1:3306，库 huakey_crm_test）；不可达则整组跳过（同 tests/db 其它用例）。
 */

const net = require('net');
const mysql = require('mysql2/promise');
const customerService = require('../../services/customerService');
const customerDetailService = require('../../services/customerDetailService');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

let pool;
let reachable = false;
const tempCustomerIds = [];

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
    console.warn(`[customerListSoftDelete] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实 SQL 测试`);
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 2
  });
});

afterAll(async () => {
  if (!pool) return;
  for (const id of tempCustomerIds) {
    try { await pool.query('DELETE FROM crm_customer WHERE id = ?', [id]); } catch (e) {
      console.warn(`[customerListSoftDelete] 清理临时客户 ${id} 失败：${e.message}`);
    }
  }
  await pool.end();
});

/** 造一条临时客户（只给必填字段，其余走库默认值），登记待清理 */
async function insertCustomer(companyName, status = 'following') {
  const [r] = await pool.query(
    'INSERT INTO crm_customer (company_name, status) VALUES (?, ?)',
    [companyName, status]
  );
  tempCustomerIds.push(r.insertId);
  return r.insertId;
}

const listIds = async (params) => {
  const res = await customerService.listCustomers(pool, params, null);
  return (res.list || res.rows || []).map((c) => c.id);
};

describe('客户列表软删除过滤（真连库）', () => {
  it('软删除后：不带 status 的列表不应再出现该客户（既有行为，作对照）', async () => {
    if (!reachable) return;

    const liveId = await insertCustomer(`软删对照_存活_${Date.now()}`);
    const deadId = await insertCustomer(`软删对照_已删_${Date.now()}`);
    await customerDetailService.deleteCustomer(pool, deadId, { userId: 1, manageAll: true });

    // 先确认删除确实是软删除（写 deleted_at），而不是物理删除
    const [rows] = await pool.query('SELECT deleted_at FROM crm_customer WHERE id = ?', [deadId]);
    expect(rows.length).toBe(1);
    expect(rows[0].deleted_at).not.toBeNull();

    const ids = await listIds({ page: 1, pageSize: 200 });
    expect(ids).toContain(liveId);
    expect(ids).not.toContain(deadId);
  });

  it('软删除后：带 status 筛选的列表同样不得出现该客户（本次修复点）', async () => {
    if (!reachable) return;

    const liveId = await insertCustomer(`软删状态_存活_${Date.now()}`);
    const deadId = await insertCustomer(`软删状态_已删_${Date.now()}`);
    await customerDetailService.deleteCustomer(pool, deadId, { userId: 1, manageAll: true });

    const ids = await listIds({ page: 1, pageSize: 200, status: 'following' });
    // 对照项必须先出现，否则「没泄漏」可能只是因为查询本身返回空
    expect(ids).toContain(liveId);
    expect(ids).not.toContain(deadId);
  });

  it('带 status 且叠加其它筛选（company_name）时也不得泄漏', async () => {
    if (!reachable) return;

    const tag = `${Date.now()}`;
    const deadId = await insertCustomer(`软删组合_已删_${tag}`);
    await customerDetailService.deleteCustomer(pool, deadId, { userId: 1, manageAll: true });

    const ids = await listIds({ page: 1, pageSize: 200, status: 'following', company_name: `软删组合_已删_${tag}` });
    expect(ids).not.toContain(deadId);
  });
});

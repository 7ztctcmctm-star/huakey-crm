/**
 * [P1-27] 正式客户列表筛选 —— 真实 MySQL 端到端测试
 *
 * 单元测试只能证明 SQL 里带了条件；本文件以数据库最终结果为准，验证：
 *   · lost / paused 客户确实出现在正式列表，且「已流失 / 暂停跟进」tab 不再为空；
 *   · 状态下拉按 status 过滤时 paused 不会混进 following；
 *   · lifecycle_status / tag_id / overdue_follow / overdue 都真正改变结果集；
 *   · 返回行包含 status / lifecycle_status，前端状态列可正确渲染。
 *
 * MySQL 不可达时整组跳过（与 tests/db 其它用例同策略）。
 */

const net = require('net');
const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'crm_test';
const DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

// listFormalCustomers 的 overdue 分支通过 utils/config → config/database 读取
// sys_config，必须在 require service 之前把连接参数指向测试库。
process.env.DB_HOST = DB_HOST;
process.env.DB_PORT = String(DB_PORT);
process.env.DB_USER = DB_USER;
process.env.DB_PASSWORD = DB_PASSWORD;
process.env.DB_NAME = DB_NAME;
process.env.NODE_ENV = 'test';

const customerService = require('../../services/customerService');

let pool;
let reachable = false;
let USER_ID = null;
const createdCustomerIds = [];
const createdTagIds = [];

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
  return `p127${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function insertCustomer({
  prefix,
  status,
  businessStatus,
  lifecycle = 'active',
  lastFollowTime = null,
  createTime = null
}) {
  const [r] = await pool.query(
    `INSERT INTO crm_customer
      (company_name, status, business_status, lifecycle_status, pool_status, owner_id, last_follow_time, create_time)
     VALUES (?, ?, ?, ?, 'private', ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
    [`${prefix}_${status}_${Math.floor(Math.random() * 10000)}`, status, businessStatus, lifecycle,
      USER_ID, lastFollowTime, createTime]
  );
  createdCustomerIds.push(r.insertId);
  return r.insertId;
}

async function listIds(prefix, params = {}) {
  const res = await customerService.listFormalCustomers(pool, {
    page: 1,
    pageSize: 100,
    company_name: prefix,
    ...params
  }, null);
  return res.list.map((row) => row.id);
}

beforeAll(async () => {
  reachable = await checkDbReachable();
  if (!reachable) {
    console.warn(`[formalCustomerFilters] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实库测试`);
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 4
  });
  const [users] = await pool.query(
    'SELECT id FROM sys_user WHERE deleted_at IS NULL AND status = 1 ORDER BY id LIMIT 1'
  );
  if (!users.length) throw new Error('测试库缺少启用的 sys_user');
  USER_ID = users[0].id;
});

afterEach(async () => {
  if (!reachable || !pool) return;
  for (const id of createdCustomerIds) {
    try { await pool.query('DELETE FROM crm_customer_tag WHERE customer_id = ?', [id]); } catch { /* ignore */ }
    try { await pool.query('DELETE FROM crm_contact WHERE customer_id = ?', [id]); } catch { /* ignore */ }
    try { await pool.query('DELETE FROM crm_customer WHERE id = ?', [id]); } catch { /* ignore */ }
  }
  createdCustomerIds.length = 0;
  for (const id of createdTagIds) {
    try { await pool.query('DELETE FROM crm_customer_tag WHERE tag_id = ?', [id]); } catch { /* ignore */ }
    try { await pool.query('DELETE FROM crm_tag WHERE id = ?', [id]); } catch { /* ignore */ }
  }
  createdTagIds.length = 0;
});

afterAll(async () => { if (pool) await pool.end(); });

describe('[P1-27] 正式客户列表筛选（真实 MySQL）', () => {
  it('lost / paused 都出现在正式列表，且状态 tab 精确命中', async () => {
    if (!reachable) return;
    const prefix = uniqueToken();
    const followingId = await insertCustomer({ prefix, status: 'following', businessStatus: 'following' });
    const lostId = await insertCustomer({ prefix, status: 'lost', businessStatus: 'lost' });
    // paused 在 business_status 枚举中不存在；真实数据里保留原业务阶段（迁移 110）
    const pausedId = await insertCustomer({ prefix, status: 'paused', businessStatus: 'following' });

    const all = await listIds(prefix);
    expect(all).toEqual(expect.arrayContaining([followingId, lostId, pausedId]));

    expect(await listIds(prefix, { business_status: 'lost' })).toEqual([lostId]);
    expect(await listIds(prefix, { business_status: 'paused' })).toEqual([pausedId]);

    // 状态下拉按 status：paused 不得混进 following
    expect(await listIds(prefix, { status: 'following' })).toEqual([followingId]);
    expect(await listIds(prefix, { status: 'sea' })).toEqual([]);
  }, 30000);

  it('返回行包含 status / lifecycle_status（前端状态列不再显示“未知”）', async () => {
    if (!reachable) return;
    const prefix = uniqueToken();
    const id = await insertCustomer({
      prefix, status: 'lost', businessStatus: 'lost', lifecycle: 'inactive'
    });

    const res = await customerService.listFormalCustomers(pool, {
      page: 1, pageSize: 10, company_name: prefix
    }, null);
    const row = res.list.find((r) => r.id === id);

    expect(row).toBeTruthy();
    expect(row.status).toBe('lost');
    expect(row.lifecycle_status).toBe('inactive');
    expect(row.business_status).toBe('lost');
  }, 30000);

  it('lifecycle_status 过滤生效', async () => {
    if (!reachable) return;
    const prefix = uniqueToken();
    const activeId = await insertCustomer({
      prefix, status: 'following', businessStatus: 'following', lifecycle: 'active'
    });
    const nurturingId = await insertCustomer({
      prefix, status: 'following', businessStatus: 'following', lifecycle: 'nurturing'
    });

    expect(await listIds(prefix, { lifecycle_status: 'active' })).toEqual([activeId]);
    expect(await listIds(prefix, { lifecycle_status: 'nurturing' })).toEqual([nurturingId]);
  }, 30000);

  it('tag_id 过滤生效', async () => {
    if (!reachable) return;
    const prefix = uniqueToken();
    const taggedId = await insertCustomer({ prefix, status: 'following', businessStatus: 'following' });
    await insertCustomer({ prefix, status: 'following', businessStatus: 'following' });

    const [tagResult] = await pool.query(
      'INSERT INTO crm_tag (name, color, sort) VALUES (?, ?, 0)',
      [`${prefix}_tag`, '#123456']
    );
    createdTagIds.push(tagResult.insertId);
    await pool.query('INSERT INTO crm_customer_tag (customer_id, tag_id) VALUES (?, ?)',
      [taggedId, tagResult.insertId]);

    expect(await listIds(prefix, { tag_id: tagResult.insertId })).toEqual([taggedId]);
  }, 30000);

  it('overdue_follow 只返回超过 7 天未跟进的客户', async () => {
    if (!reachable) return;
    const prefix = uniqueToken();
    const staleId = await insertCustomer({
      prefix, status: 'following', businessStatus: 'following', lastFollowTime: daysAgo(30)
    });
    const freshId = await insertCustomer({
      prefix, status: 'following', businessStatus: 'following', lastFollowTime: new Date()
    });
    const neverId = await insertCustomer({
      prefix, status: 'following', businessStatus: 'following', lastFollowTime: null
    });

    const ids = await listIds(prefix, { overdue_follow: true });
    expect(ids).toContain(staleId);
    expect(ids).not.toContain(freshId);
    expect(ids).not.toContain(neverId);
  }, 30000);

  it('overdue 按配置阈值判断（优先 last_follow_time，缺失时回退 create_time）', async () => {
    if (!reachable) return;
    const prefix = uniqueToken();
    const neverFollowedId = await insertCustomer({
      prefix, status: 'following', businessStatus: 'following',
      lastFollowTime: null, createTime: daysAgo(100)
    });
    const recentlyFollowedId = await insertCustomer({
      prefix, status: 'following', businessStatus: 'following',
      lastFollowTime: new Date(), createTime: daysAgo(100)
    });
    const newCustomerId = await insertCustomer({
      prefix, status: 'following', businessStatus: 'following',
      lastFollowTime: null, createTime: new Date()
    });

    const ids = await listIds(prefix, { overdue: true });
    expect(ids).toContain(neverFollowedId);
    expect(ids).not.toContain(recentlyFollowedId);
    expect(ids).not.toContain(newCustomerId);
  }, 30000);
});

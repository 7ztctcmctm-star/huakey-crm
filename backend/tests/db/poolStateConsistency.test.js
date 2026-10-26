/**
 * P1-03：公海认领/释放必须统一写 status / business_status / pool_status / owner_id。
 *
 * 真连库验证四条生产路径 + 离职交接：
 *   ① poolService.claimCustomer          owner=NULL → user：private/following/following
 *   ② poolService.releaseCustomer        owner → NULL：sea/sea/following
 *   ③ customerService.claimPoolCustomer  owner=NULL → user：private/following/following
 *   ④ customerService.releaseCustomerToPool owner → NULL：sea/sea/following
 *   ⑤ 线索不得释放（两条路径均拒绝，且数据不变）
 *   ⑥ systemReleaseOwnedCustomersOnLeave：非线索转公海态，线索保持 lead
 *
 * 环境要求：MySQL 可达（默认 127.0.0.1:3306，库 huakey_crm_test）；不可达则整组跳过。
 */

const net = require('net');
const mysql = require('mysql2/promise');
const poolService = require('../../services/poolService');
const customerService = require('../../services/customerService');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'crm_test';
const DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

let pool;
let reachable = false;
let userId = null;
const createdCustomerIds = [];
const createdUserIds = [];

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
    console.warn(`[poolStateConsistency] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实 SQL 测试`);
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 4
  });
  const [users] = await pool.query('SELECT id FROM sys_user WHERE deleted_at IS NULL ORDER BY id LIMIT 1');
  userId = users.length ? users[0].id : null;
});

afterAll(async () => {
  if (!pool) return;
  try {
    for (const id of createdCustomerIds) {
      await pool.query('DELETE FROM crm_pool_log WHERE customer_id = ?', [id]);
      await pool.query('DELETE FROM crm_assign_log WHERE customer_id = ?', [id]);
      await pool.query('DELETE FROM crm_customer WHERE id = ?', [id]);
    }
    // 临时用户必须在客户之后删除（owner_id 外键）
    for (const id of createdUserIds) {
      await pool.query('DELETE FROM sys_user WHERE id = ?', [id]);
    }
  } catch (e) {
    console.warn(`[poolStateConsistency] 清理临时客户失败：${e.message}`);
  }
  await pool.end();
});

function token() {
  return `p103${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

async function createCustomer(fields) {
  const [r] = await pool.query(
    `INSERT INTO crm_customer (company_name, owner_id, pool_status, status, business_status)
     VALUES (?, ?, ?, ?, ?)`,
    [fields.company_name, fields.owner_id, fields.pool_status, fields.status, fields.business_status]
  );
  createdCustomerIds.push(r.insertId);
  return r.insertId;
}

async function rowOf(id) {
  const [rows] = await pool.query(
    'SELECT owner_id, pool_status, status, business_status FROM crm_customer WHERE id = ?',
    [id]
  );
  return rows[0];
}

const ALL = { type: 'all' };

describe('公海状态写入一致性（真连库，P1-03）', () => {
  it('poolService.claimCustomer：owner/status/business_status/pool_status 同步', async () => {
    if (!reachable || !userId) return;
    const id = await createCustomer({
      company_name: `${token()}_claim_pool`, owner_id: null,
      pool_status: 'sea', status: 'sea', business_status: 'following'
    });

    await poolService.claimCustomer(pool, id, userId, { roleId: 3, manageAll: false }, null);

    const row = await rowOf(id);
    expect(row.owner_id).toBe(userId);
    expect(row.pool_status).toBe('private');
    expect(row.status).toBe('following');
    expect(row.business_status).toBe('following');
  });

  it('poolService.releaseCustomer：business_status 一并回落到 following', async () => {
    if (!reachable || !userId) return;
    const id = await createCustomer({
      company_name: `${token()}_release_pool`, owner_id: userId,
      pool_status: 'private', status: 'quoted', business_status: 'quoted'
    });

    await poolService.releaseCustomer(pool, id, userId, ALL);

    const row = await rowOf(id);
    expect(row.owner_id).toBeNull();
    expect(row.pool_status).toBe('sea');
    expect(row.status).toBe('sea');
    expect(row.business_status).toBe('following');
  });

  it('customerService.claimPoolCustomer：认领后不再残留 sea', async () => {
    if (!reachable || !userId) return;
    const id = await createCustomer({
      company_name: `${token()}_claim_cs`, owner_id: null,
      pool_status: 'sea', status: 'sea', business_status: 'following'
    });

    await customerService.claimPoolCustomer(pool, id, userId, null);

    const row = await rowOf(id);
    expect(row.owner_id).toBe(userId);
    expect(row.pool_status).toBe('private');
    expect(row.status).toBe('following');
    expect(row.business_status).toBe('following');
  });

  it('customerService.releaseCustomerToPool：status/business_status 同步为公海态', async () => {
    if (!reachable || !userId) return;
    const id = await createCustomer({
      company_name: `${token()}_release_cs`, owner_id: userId,
      pool_status: 'private', status: 'quoted', business_status: 'quoted'
    });

    await customerService.releaseCustomerToPool(pool, id, userId, '测试释放', ALL);

    const row = await rowOf(id);
    expect(row.owner_id).toBeNull();
    expect(row.pool_status).toBe('sea');
    expect(row.status).toBe('sea');
    expect(row.business_status).toBe('following');
  });

  it('线索不得释放到公海：两条路径均拒绝且数据不变', async () => {
    if (!reachable || !userId) return;
    const id = await createCustomer({
      company_name: `${token()}_lead`, owner_id: userId,
      pool_status: 'private', status: 'lead', business_status: 'lead'
    });

    await expect(poolService.releaseCustomer(pool, id, userId, ALL)).rejects.toMatchObject({ code: 400005 });
    await expect(
      customerService.releaseCustomerToPool(pool, id, userId, '测试释放', ALL)
    ).rejects.toMatchObject({ code: 400005 });

    const row = await rowOf(id);
    expect(row.owner_id).toBe(userId);
    expect(row.status).toBe('lead');
    expect(row.business_status).toBe('lead');
  });

  it('离职交接：非线索转公海态，线索继续留在线索池', async () => {
    if (!reachable || !userId) return;
    const t = token();
    // 用临时用户承载，避免把测试库里既有客户的归属整体释放
    const [u] = await pool.query(
      'INSERT INTO sys_user (username, password, real_name, role_id, status) VALUES (?, ?, ?, 3, 1)',
      [`tmp_${t}`, 'x', `tmp_${t}`]
    );
    createdUserIds.push(u.insertId);
    const leaveUserId = u.insertId;

    const leadId = await createCustomer({
      company_name: `${t}_leave_lead`, owner_id: leaveUserId,
      pool_status: 'private', status: 'lead', business_status: 'lead'
    });
    const formalId = await createCustomer({
      company_name: `${t}_leave_formal`, owner_id: leaveUserId,
      pool_status: 'private', status: 'following', business_status: 'following'
    });

    const { affectedRows } = await customerService.systemReleaseOwnedCustomersOnLeave(pool, leaveUserId);
    expect(affectedRows).toBe(2);

    const lead = await rowOf(leadId);
    expect(lead.owner_id).toBeNull();
    expect(lead.status).toBe('lead');
    expect(lead.business_status).toBe('lead');
    // [P2-07] 线索池的 pool_status 兼容值恒为 private（原实现误写 sea）
    expect(lead.pool_status).toBe('private');

    const formal = await rowOf(formalId);
    expect(formal.owner_id).toBeNull();
    expect(formal.pool_status).toBe('sea');
    expect(formal.status).toBe('sea');
    expect(formal.business_status).toBe('following');
  });
});

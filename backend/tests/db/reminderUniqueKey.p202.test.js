/**
 * [P2-02] 跟进提醒唯一键按类型区分 —— 真实 MySQL 约束测试
 *
 * 修复前 `uk_customer_date(customer_id, reminder_date)` 使同一客户同一天只能有
 * 一条提醒：逾期提醒先插入后，今日提醒插入失败，generate_reminders.js 的通知
 * 逻辑位于插入之后，异常被吞 ⇒ 企业微信/SSE 静默不发送。
 *
 * 本测试以数据库最终状态为准，验证迁移 128 后：
 *   · 唯一键为 (customer_id, reminder_type, reminder_date)；
 *   · 同客户同日四种类型（overdue/today/upcoming/pre_release）可共存；
 *   · 同客户同类型同日仍被唯一键拒绝（重跑幂等，不重复通知）。
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

let pool;
let reachable = false;
let USER_ID = null;
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

async function insertCustomer() {
  const [r] = await pool.query(
    `INSERT INTO crm_customer
      (company_name, status, business_status, pool_status, owner_id)
     VALUES (?, 'following', 'following', 'private', ?)`,
    [`p202_${Date.now()}_${Math.floor(Math.random() * 10000)}`, USER_ID]
  );
  createdCustomerIds.push(r.insertId);
  return r.insertId;
}

function insertReminder(customerId, type, date) {
  return pool.query(
    `INSERT INTO crm_follow_up_reminder (customer_id, owner_id, reminder_type, reminder_date)
     VALUES (?, ?, ?, ?)`,
    [customerId, USER_ID, type, date]
  );
}

beforeAll(async () => {
  reachable = await checkDbReachable();
  if (!reachable) {
    console.warn(`[reminderUniqueKey] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实库测试`);
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 2
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
    try { await pool.query('DELETE FROM crm_follow_up_reminder WHERE customer_id = ?', [id]); } catch { /* ignore */ }
    try { await pool.query('DELETE FROM crm_customer WHERE id = ?', [id]); } catch { /* ignore */ }
  }
  createdCustomerIds.length = 0;
});

afterAll(async () => { if (pool) await pool.end(); });

describe('[P2-02] 提醒唯一键（真实 MySQL）', () => {
  it('唯一键为 (customer_id, reminder_type, reminder_date)，旧键已移除', async () => {
    if (!reachable) return;
    const [rows] = await pool.query(
      `SELECT INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'crm_follow_up_reminder'
          AND INDEX_NAME IN ('uk_customer_date', 'uk_customer_type_date')
        ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [DB_NAME]
    );

    expect(rows.some((r) => r.INDEX_NAME === 'uk_customer_date')).toBe(false);
    expect(rows.map((r) => `${r.INDEX_NAME}:${r.COLUMN_NAME}`)).toEqual([
      'uk_customer_type_date:customer_id',
      'uk_customer_type_date:reminder_type',
      'uk_customer_type_date:reminder_date'
    ]);
  }, 30000);

  it('同一客户同一天可共存 overdue / today / upcoming / pre_release 四种提醒', async () => {
    if (!reachable) return;
    const customerId = await insertCustomer();
    const today = '2026-10-26';

    for (const type of ['overdue', 'today', 'upcoming', 'pre_release']) {
      // eslint-disable-next-line no-await-in-loop
      await insertReminder(customerId, type, today);
    }

    const [rows] = await pool.query(
      `SELECT reminder_type FROM crm_follow_up_reminder
        WHERE customer_id = ? AND reminder_date = ? ORDER BY reminder_type`,
      [customerId, today]
    );
    expect(rows.map((r) => r.reminder_type)).toEqual(
      ['overdue', 'pre_release', 'today', 'upcoming']
    );
  }, 30000);

  it('同客户同类型同日重复插入仍被唯一键拒绝（重跑幂等）', async () => {
    if (!reachable) return;
    const customerId = await insertCustomer();
    const today = '2026-10-26';

    await insertReminder(customerId, 'today', today);
    await expect(insertReminder(customerId, 'today', today))
      .rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  }, 30000);
});

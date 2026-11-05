/**
 * [P1-26] 报价编辑后回读一致 —— 真实 MySQL 端到端测试
 *
 * mock 只能证明“SQL 带上了字段”，不能证明库里的值真的被改写、也没有被后续
 * 默认值覆盖。本测试以数据库最终状态 + getQuote 回读为准：
 *   · 编辑外币报价后 currency/exchange_rate/opportunity_id 全部保留；
 *   · CNY 汇率被强制为 1.0000；
 *   · 非法币种/跨客户商机被拒绝且原值不变。
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

const quoteService = require('../../services/quoteService');

let pool;
let reachable = false;
let USER_ID = null;
const createdQuoteIds = [];
const createdOppIds = [];
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

async function createCustomer(tag) {
  const [r] = await pool.query(
    `INSERT INTO crm_customer (company_name, owner_id, pool_status, status, business_status)
     VALUES (?, ?, 'private', 'following', 'following')`,
    [`P126报价客户_${tag}_${Date.now()}_${Math.floor(Math.random() * 10000)}`, USER_ID]
  );
  createdCustomerIds.push(r.insertId);
  return r.insertId;
}

async function createOpportunity(customerId, tag) {
  const [r] = await pool.query(
    `INSERT INTO crm_opportunity (customer_id, name, stage, owner_id)
     VALUES (?, ?, 3, ?)`,
    [customerId, `P126商机_${tag}_${Date.now()}`, USER_ID]
  );
  createdOppIds.push(r.insertId);
  return r.insertId;
}

async function createQuote({ customerId, opportunityId = null, currency = 'USD', rate = '7.2500' }) {
  const [r] = await pool.query(
    `INSERT INTO crm_quote
      (quote_no, customer_id, opportunity_id, amount, discount, final_amount, currency, exchange_rate,
       valid_days, remark, status, approval_status, create_by)
     VALUES (?, ?, ?, 100.00, 0, 100.00, ?, ?, 30, '', 1, 2, ?)`,
    [`P126-${Date.now()}-${Math.floor(Math.random() * 100000)}`, customerId, opportunityId, currency, rate, USER_ID]
  );
  createdQuoteIds.push(r.insertId);
  return r.insertId;
}

async function readRaw(quoteId) {
  const [[row]] = await pool.query(
    'SELECT currency, exchange_rate, opportunity_id FROM crm_quote WHERE id = ?',
    [quoteId]
  );
  return row;
}

beforeAll(async () => {
  reachable = await checkDbReachable();
  if (!reachable) {
    console.warn(`[quoteCurrencyUpdate] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实库测试`);
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 4,
    enableKeepAlive: true
  });
  const [users] = await pool.query(
    'SELECT id FROM sys_user WHERE deleted_at IS NULL AND status = 1 ORDER BY id LIMIT 1'
  );
  if (!users.length) throw new Error('测试库缺少启用的 sys_user');
  USER_ID = users[0].id;

  const [currencies] = await pool.query(
    "SELECT code FROM crm_currency WHERE code = 'USD' AND status = 1 AND deleted_at IS NULL"
  );
  if (currencies.length === 0) {
    throw new Error('测试库缺少 USD 币种字典（迁移 054），无法验证外币编辑');
  }
});

afterEach(async () => {
  if (!reachable || !pool) return;
  for (const id of createdQuoteIds) {
    try { await pool.query('DELETE FROM crm_quote_item WHERE quote_id = ?', [id]); } catch { /* ignore */ }
    try { await pool.query('DELETE FROM crm_quote WHERE id = ?', [id]); } catch { /* ignore */ }
  }
  createdQuoteIds.length = 0;
  for (const id of createdOppIds) {
    try { await pool.query('DELETE FROM crm_opportunity WHERE id = ?', [id]); } catch { /* ignore */ }
  }
  createdOppIds.length = 0;
  for (const id of createdCustomerIds) {
    try { await pool.query('DELETE FROM crm_customer WHERE id = ?', [id]); } catch { /* ignore */ }
  }
  createdCustomerIds.length = 0;
});

afterAll(async () => { if (pool) await pool.end(); });

describe('[P1-26] 报价编辑后回读一致（真实 MySQL）', () => {
  it('编辑外币报价：币种/汇率/商机写入并在 getQuote 回读一致', async () => {
    if (!reachable) return;
    const customerId = await createCustomer('edit');
    const oppId = await createOpportunity(customerId, 'edit');
    const quoteId = await createQuote({ customerId, currency: 'CNY', rate: '1.0000' });

    await quoteService.updateQuote(pool, {
      id: quoteId,
      opportunity_id: oppId,
      currency: 'USD',
      exchange_rate: 7.9,
      remark: '外币改价'
    });

    const raw = await readRaw(quoteId);
    expect(raw.currency).toBe('USD');
    expect(Number(raw.exchange_rate)).toBe(7.9);
    expect(Number(raw.opportunity_id)).toBe(oppId);

    const detail = await quoteService.getQuote(pool, quoteId);
    expect(detail.currency).toBe('USD');
    expect(Number(detail.exchange_rate)).toBe(7.9);
    expect(Number(detail.opportunity_id)).toBe(oppId);
  });

  it('CNY 汇率强制为 1.0000', async () => {
    if (!reachable) return;
    const customerId = await createCustomer('cny');
    const quoteId = await createQuote({ customerId, currency: 'USD', rate: '7.2500' });

    await quoteService.updateQuote(pool, { id: quoteId, currency: 'CNY', exchange_rate: 9.9 });

    const raw = await readRaw(quoteId);
    expect(raw.currency).toBe('CNY');
    expect(Number(raw.exchange_rate)).toBe(1);
  });

  it('非法币种被拒绝，原值保持不变', async () => {
    if (!reachable) return;
    const customerId = await createCustomer('badcur');
    const quoteId = await createQuote({ customerId, currency: 'USD', rate: '7.2500' });

    await expect(quoteService.updateQuote(pool, { id: quoteId, currency: 'XYZ' }))
      .rejects.toMatchObject({ code: 400005 });

    const raw = await readRaw(quoteId);
    expect(raw.currency).toBe('USD');
    expect(Number(raw.exchange_rate)).toBe(7.25);
  });

  it('商机不属于目标客户时被拒绝，原值保持不变', async () => {
    if (!reachable) return;
    const customerId = await createCustomer('own');
    const otherCustomerId = await createCustomer('other');
    const foreignOppId = await createOpportunity(otherCustomerId, 'foreign');
    const quoteId = await createQuote({ customerId, currency: 'USD', rate: '7.2500' });

    await expect(quoteService.updateQuote(pool, { id: quoteId, opportunity_id: foreignOppId }))
      .rejects.toMatchObject({ code: 400005 });

    const raw = await readRaw(quoteId);
    expect(raw.opportunity_id).toBeNull();
  });
});

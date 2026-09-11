/**
 * 客户列表按 business_status 筛选 —— 真实 SQL 测试
 *
 * ## 缺陷（2026-09-11 实测）
 *
 * 前端「客户总览 / 公海」页（`views/pool/List.vue:21-26, 250`）的下拉「客户状态」把值作为
 * `business_status` 发给 `POST /customers/list`，但：
 *   ① `routes/customers.js` 的 `customerListSchema`（第 49-64 行）**没有该字段**，
 *      配合 validate 中间件的 `stripUnknown: true` 会被直接丢弃；
 *   ② `customerService.listCustomers` 的解构列表里**也没有** `business_status`。
 * ⇒ 用户选了状态，列表却完全不过滤：典型「UI 有、后端不生效」的假功能。
 *
 * 对照组（同一个库、同一份数据）证明这不是「本来就没有数据」：
 * `listFormalCustomers`（`/customers` 正式客户列表）**实现了**该过滤（customerService.js:932-935）。
 *
 * 本文件真连库验证 `listCustomers` 收到 business_status 时必须过滤。
 * 环境要求：MySQL 可达（默认 127.0.0.1:3306，库 huakey_crm_test）；不可达则整组跳过。
 */

const net = require('net');
const mysql = require('mysql2/promise');
const customerService = require('../../services/customerService');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

let pool;
let reachable = false;
const tempIds = [];

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
    console.warn(`[customerListBusinessStatus] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实 SQL 测试`);
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 2
  });
});

afterAll(async () => {
  if (!pool) return;
  for (const id of tempIds) {
    try { await pool.query('DELETE FROM crm_customer WHERE id = ?', [id]); } catch (e) {
      console.warn(`[customerListBusinessStatus] 清理临时客户 ${id} 失败：${e.message}`);
    }
  }
  await pool.end();
});

async function insertCustomer(companyName, businessStatus) {
  const [r] = await pool.query(
    'INSERT INTO crm_customer (company_name, status, business_status) VALUES (?, ?, ?)',
    [companyName, businessStatus, businessStatus]
  );
  tempIds.push(r.insertId);
  return r.insertId;
}

/** 纯字母数字 token：避免下划线（LIKE 里 _ 是单字符通配）与中文字符带来的匹配歧义 */
function uniqueToken() {
  return `bsfilt${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

const listIds = async (params) => {
  const res = await customerService.listCustomers(pool, params, null);
  return (res.list || res.rows || []).map((c) => c.id);
};

describe('客户列表 business_status 筛选（真连库）', () => {
  it('传 business_status 时只返回该状态的客户', async () => {
    if (!reachable) return;

    const token = uniqueToken();
    const negotiatingId = await insertCustomer(`${token}谈判`, 'negotiating');
    const quotedId = await insertCustomer(`${token}报价`, 'quoted');

    const ids = await listIds({ page: 1, pageSize: 200, business_status: 'negotiating' });

    expect(ids).toContain(negotiatingId);
    expect(ids).not.toContain(quotedId);
  });

  it('business_status 与其它筛选叠加时同样生效（company_name）', async () => {
    if (!reachable) return;

    const token = uniqueToken();
    const signedId = await insertCustomer(`${token}签约`, 'signed');
    await insertCustomer(`${token}跟进`, 'following');

    const ids = await listIds({ page: 1, pageSize: 200, business_status: 'signed', company_name: token });
    expect([...new Set(ids)]).toEqual([signedId]);
  });

  it('未传 business_status 时不应过滤（回归保护）', async () => {
    if (!reachable) return;

    const token = uniqueToken();
    const a = await insertCustomer(`${token}不过滤A`, 'quoted');
    const b = await insertCustomer(`${token}不过滤B`, 'signed');

    const ids = await listIds({ page: 1, pageSize: 200, company_name: token });
    expect([...new Set(ids)]).toEqual(expect.arrayContaining([a, b]));
  });
});

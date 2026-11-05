/**
 * P1-05：合同删除必须事务化 —— 合同 / 回款 / 回款计划同生共死。
 *
 * 真连库验证：
 *   ① 正常删除：三张表 deleted_at 同时非空
 *   ② 已完成合同（status=3）：拒绝删除，三张表数据原样保留
 *
 * 环境要求：MySQL 可达（默认 127.0.0.1:3306，库 huakey_crm_test）；不可达则整组跳过。
 */

const net = require('net');
const mysql = require('mysql2/promise');
const contractCrudService = require('../../services/contractCrudService');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'crm_test';
const DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

let pool;
let reachable = false;
const createdCustomerIds = [];
const createdContractIds = [];

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
    console.warn(`[contractDeleteTransaction] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实 SQL 测试`);
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 4
  });
});

afterAll(async () => {
  if (!pool) return;
  try {
    for (const id of createdContractIds) {
      await pool.query('DELETE FROM crm_payment WHERE contract_id = ?', [id]);
      await pool.query('DELETE FROM crm_payment_plan WHERE contract_id = ?', [id]);
      await pool.query('DELETE FROM crm_contract WHERE id = ?', [id]);
    }
    for (const id of createdCustomerIds) {
      await pool.query('DELETE FROM crm_customer WHERE id = ?', [id]);
    }
  } catch (e) {
    console.warn(`[contractDeleteTransaction] 清理临时数据失败：${e.message}`);
  }
  await pool.end();
});

function token() {
  return `p105${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

async function createContractFixture(status = 1) {
  const t = token();
  const [c] = await pool.query(
    'INSERT INTO crm_customer (company_name) VALUES (?)',
    [`${t}_customer`]
  );
  createdCustomerIds.push(c.insertId);
  const [ct] = await pool.query(
    'INSERT INTO crm_contract (contract_no, customer_id, status) VALUES (?, ?, ?)',
    [`${t}_no`, c.insertId, status]
  );
  createdContractIds.push(ct.insertId);
  await pool.query('INSERT INTO crm_payment (contract_id, pay_date) VALUES (?, CURDATE())', [ct.insertId]);
  await pool.query('INSERT INTO crm_payment_plan (contract_id, plan_date) VALUES (?, CURDATE())', [ct.insertId]);
  return ct.insertId;
}

async function deletedAtOf(contractId) {
  const [[contract]] = await pool.query('SELECT deleted_at FROM crm_contract WHERE id = ?', [contractId]);
  const [payments] = await pool.query('SELECT deleted_at FROM crm_payment WHERE contract_id = ?', [contractId]);
  const [plans] = await pool.query('SELECT deleted_at FROM crm_payment_plan WHERE contract_id = ?', [contractId]);
  return { contract: contract.deleted_at, payments, plans };
}

const ADMIN = { manageAll: true, roleId: 'super_admin', userId: 1 };

describe('合同删除事务（真连库，P1-05）', () => {
  it('正常删除：合同/回款/回款计划三表 deleted_at 同时置位', async () => {
    if (!reachable) return;
    const id = await createContractFixture(1);

    const result = await contractCrudService.deleteContract(pool, id, ADMIN);
    expect(result.message).toBe('删除合同成功');

    const row = await deletedAtOf(id);
    expect(row.contract).not.toBeNull();
    expect(row.payments).toHaveLength(1);
    expect(row.payments[0].deleted_at).not.toBeNull();
    expect(row.plans).toHaveLength(1);
    expect(row.plans[0].deleted_at).not.toBeNull();
  });

  it('已完成合同（status=3）：拒绝删除，三表数据原样保留', async () => {
    if (!reachable) return;
    const id = await createContractFixture(3);

    await expect(contractCrudService.deleteContract(pool, id, ADMIN))
      .rejects.toMatchObject({ code: 400005 });

    const row = await deletedAtOf(id);
    expect(row.contract).toBeNull();
    expect(row.payments[0].deleted_at).toBeNull();
    expect(row.plans[0].deleted_at).toBeNull();
  });
});

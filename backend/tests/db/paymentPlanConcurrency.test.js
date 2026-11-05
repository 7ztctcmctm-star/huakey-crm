/**
 * [P0-08] 回款计划并发 —— 真实 MySQL 端到端测试
 *
 * 验证目标（mock 无法证明的部分）：
 *   · 同一计划并发登记两笔回款后，paid_amount = 两笔之和（不丢更新）
 *   · 登记与删除并发时，计划金额始终等于「未删除回款之和」
 *   · 计划不属于目标合同时拒绝，且不产生回款记录
 *
 * 判据以数据库最终状态为准，不以返回值推断。
 * MySQL 不可达时整组跳过（与 tests/db 其它用例同策略）。
 */

const net = require('net');
const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'crm_test';
const DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

const paymentService = require('../../services/paymentService');
const { buildStorageKey } = require('../../utils/idempotency');

let pool;
let reachable = false;
let USER_ID = null;
const createdCustomerIds = [];
const createdContractIds = [];
const idemKeys = [];

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

const nextKey = (label) => {
  const k = `__p008__${label}__${Date.now()}__${Math.floor(Math.random() * 10000)}`.slice(0, 64);
  idemKeys.push(k);
  return k;
};

async function createCustomer(tag) {
  const [r] = await pool.query(
    `INSERT INTO crm_customer (company_name, owner_id, pool_status, status, business_status)
     VALUES (?, ?, 'private', 'following', 'following')`,
    [`P008并发客户_${tag}_${Date.now()}_${Math.floor(Math.random() * 10000)}`, USER_ID]
  );
  createdCustomerIds.push(r.insertId);
  return r.insertId;
}

async function createContract(customerId) {
  const no = `P008-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const [r] = await pool.query(
    `INSERT INTO crm_contract (contract_no, customer_id, amount, status, create_by)
     VALUES (?, ?, 200.00, 1, ?)`,
    [no, customerId, USER_ID]
  );
  createdContractIds.push(r.insertId);
  return r.insertId;
}

async function createPlan(contractId, amount = '200.00') {
  const [r] = await pool.query(
    `INSERT INTO crm_payment_plan (contract_id, plan_date, plan_amount)
     VALUES (?, DATE_ADD(CURDATE(), INTERVAL 30 DAY), ?)`,
    [contractId, amount]
  );
  return r.insertId;
}

const planState = async (planId) => {
  const [[row]] = await pool.query(
    'SELECT paid_amount, status FROM crm_payment_plan WHERE id = ?',
    [planId]
  );
  return row;
};

const livePaidSum = async (planId) => {
  const [[row]] = await pool.query(
    'SELECT COALESCE(SUM(pay_amount), 0) AS total FROM crm_payment WHERE plan_id = ? AND deleted_at IS NULL',
    [planId]
  );
  return String(row.total);
};

beforeAll(async () => {
  reachable = await checkDbReachable();
  if (!reachable) {
    console.warn(`[paymentPlanConcurrency] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实并发测试`);
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 8,
    enableKeepAlive: true
  });
  const [users] = await pool.query(
    'SELECT id FROM sys_user WHERE deleted_at IS NULL AND status = 1 ORDER BY id LIMIT 1'
  );
  if (!users.length) throw new Error('测试库缺少启用的 sys_user');
  USER_ID = users[0].id;
});

afterEach(async () => {
  if (!reachable || !pool) return;
  for (const contractId of createdContractIds) {
    try {
      await pool.query('DELETE FROM crm_payment WHERE contract_id = ?', [contractId]);
      await pool.query('DELETE FROM crm_payment_plan WHERE contract_id = ?', [contractId]);
      await pool.query('DELETE FROM crm_contract WHERE id = ?', [contractId]);
    } catch { /* 清理失败不掩盖用例结论 */ }
  }
  createdContractIds.length = 0;
  for (const customerId of createdCustomerIds) {
    try { await pool.query('DELETE FROM crm_customer WHERE id = ?', [customerId]); } catch { /* ignore */ }
  }
  createdCustomerIds.length = 0;

  const storageKeys = [];
  for (const k of idemKeys) {
    storageKeys.push(buildStorageKey('payment', USER_ID, k));
  }
  if (storageKeys.length > 0) {
    try {
      await pool.query('DELETE FROM crm_idempotency WHERE idempotency_key IN (?)', [storageKeys]);
    } catch { /* ignore */ }
  }
  idemKeys.length = 0;
});

afterAll(async () => { if (pool) await pool.end(); });

describe('[P0-08] 回款计划并发（真实 MySQL）', () => {
  it('同一计划并发登记两笔回款：paid_amount = 两笔之和，状态 completed', async () => {
    if (!reachable) return;
    const customerId = await createCustomer('sum');
    const contractId = await createContract(customerId);
    const planId = await createPlan(contractId, '200.00');

    const base = {
      contract_id: contractId,
      plan_id: planId,
      pay_date: '2026-10-23',
      pay_amount: 100,
      pay_method: '银行转账'
    };

    const results = await Promise.allSettled([
      paymentService.recordPayment(pool, base, nextKey('a'), USER_ID),
      paymentService.recordPayment(pool, base, nextKey('b'), USER_ID)
    ]);

    expect(results.every(r => r.status === 'fulfilled')).toBe(true);

    const state = await planState(planId);
    expect(String(state.paid_amount)).toBe('200.00'); // 丢更新时会是 100.00
    expect(state.status).toBe('completed');

    const [[countRow]] = await pool.query(
      'SELECT COUNT(*) AS n FROM crm_payment WHERE plan_id = ? AND deleted_at IS NULL',
      [planId]
    );
    expect(countRow.n).toBe(2);
  }, 60000);

  it('登记与删除并发：计划金额始终等于未删除回款之和', async () => {
    if (!reachable) return;
    const customerId = await createCustomer('race');
    const contractId = await createContract(customerId);
    const planId = await createPlan(contractId, '200.00');

    const first = await paymentService.recordPayment(pool, {
      contract_id: contractId, plan_id: planId, pay_date: '2026-10-23',
      pay_amount: 50, pay_method: '现金'
    }, nextKey('first'), USER_ID);

    const results = await Promise.allSettled([
      paymentService.recordPayment(pool, {
        contract_id: contractId, plan_id: planId, pay_date: '2026-10-23',
        pay_amount: 70, pay_method: '现金'
      }, nextKey('second'), USER_ID),
      paymentService.deletePayment(pool, first.id)
    ]);

    expect(results.every(r => r.status === 'fulfilled')).toBe(true);

    // 最终状态必须与实际存活记录一致（无论两个操作的先后顺序）
    const expected = await livePaidSum(planId);
    const state = await planState(planId);
    expect(String(state.paid_amount)).toBe(expected);

    // 若删除先执行：只剩 70 → partial；若登记先执行：50+70 后删除 50 → 仍 70
    expect(expected).toBe('70.00');
    expect(state.status).toBe('partial');
  }, 60000);

  it('计划不属于目标合同：拒绝登记，且不产生回款记录', async () => {
    if (!reachable) return;
    const customerId = await createCustomer('mismatch');
    const contractA = await createContract(customerId);
    const contractB = await createContract(customerId);
    const planOfB = await createPlan(contractB, '100.00');

    await expect(paymentService.recordPayment(pool, {
      contract_id: contractA,
      plan_id: planOfB,
      pay_date: '2026-10-23',
      pay_amount: 100,
      pay_method: '银行转账'
    }, nextKey('mismatch'), USER_ID)).rejects.toThrow('回款计划不属于该合同');

    const [[row]] = await pool.query(
      'SELECT COUNT(*) AS n FROM crm_payment WHERE contract_id = ?',
      [contractA]
    );
    expect(row.n).toBe(0);
    // 目标计划不得被重算/污染
    expect(String((await planState(planOfB)).paid_amount)).toBe('0.00');
  }, 60000);
});

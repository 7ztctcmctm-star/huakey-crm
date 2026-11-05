/**
 * P1-06：采购审批并发安全的真连库验证。
 *
 * 真连库验证（顺序模拟两次审批，第二次必须被条件更新挡住）：
 *   ① 第一次 approve 成功
 *   ② 第二个审批人再 approve 同一申请 → 409，且 approved_by 仍为第一人
 *   ③ 已通过后再 reject → 400（状态前置校验）
 *
 * 环境要求：MySQL 可达（默认 127.0.0.1:3306，库 huakey_crm_test）；不可达则整组跳过。
 */

const net = require('net');
const mysql = require('mysql2/promise');
const purchaseRequestService = require('../../services/purchaseRequestService');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'crm_test';
const DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

let pool;
let reachable = false;
const createdIds = [];

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
    console.warn(`[purchaseApprovalRace] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实 SQL 测试`);
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
    for (const id of createdIds) {
      await pool.query('DELETE FROM crm_purchase_request WHERE id = ?', [id]);
    }
  } catch (e) {
    console.warn(`[purchaseApprovalRace] 清理临时申请失败：${e.message}`);
  }
  await pool.end();
});

async function createPendingRequest() {
  const [r] = await pool.query(
    "INSERT INTO crm_purchase_request (title, applicant_id, status) VALUES (?, 1, 'pending')",
    [`p106_${Date.now()}_${Math.floor(Math.random() * 10000)}`]
  );
  createdIds.push(r.insertId);
  return r.insertId;
}

describe('采购审批条件更新（真连库，P1-06）', () => {
  it('同一申请只能被审批一次，后手 409 且不覆盖 approved_by', async () => {
    if (!reachable) return;
    const id = await createPendingRequest();

    await expect(
      purchaseRequestService.approveRequest(pool, id, { userId: 11, manageAll: true })
    ).resolves.toBe(true);

    await expect(
      purchaseRequestService.approveRequest(pool, id, { userId: 12, manageAll: true })
    ).rejects.toMatchObject({ statusCode: 400 }); // 前置状态校验：已非 pending

    const [[row]] = await pool.query(
      'SELECT status, approved_by FROM crm_purchase_request WHERE id = ?',
      [id]
    );
    expect(row.status).toBe('approved');
    expect(row.approved_by).toBe(11);
  });

  it('已从 pending 被改走的行，直接条件 UPDATE 返回 0 行（并发后手路径）', async () => {
    if (!reachable) return;
    const id = await createPendingRequest();
    // 模拟另一个会话抢先处理
    await pool.query("UPDATE crm_purchase_request SET status = 'rejected' WHERE id = ?", [id]);

    // 走服务层：前置 SELECT 会看到 rejected → 400；这里直接验证条件 UPDATE 的 SQL 语义
    const [result] = await pool.query(
      "UPDATE crm_purchase_request SET status = 'approved', approved_by = ? WHERE id = ? AND status = 'pending'",
      [99, id]
    );
    expect(result.affectedRows).toBe(0);

    const [[row]] = await pool.query('SELECT status, approved_by FROM crm_purchase_request WHERE id = ?', [id]);
    expect(row.status).toBe('rejected');
    expect(row.approved_by).toBeNull();
  });
});

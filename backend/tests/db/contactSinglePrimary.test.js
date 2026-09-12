/**
 * 联系人「每个客户最多一个主联系人」不变量 —— 真实 SQL 测试
 *
 * ## 背景（2026-09-11）
 *
 * 历史迁移为每个客户插入一条 is_primary=1 的联系人却未先降级既有主联系人，
 * 导致 428 个未删客户中 417 个（97%）各有 2 条主联系人；而全仓 10 个服务 20 处查询用
 * `LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 ...` → 扇出重复行。
 *
 * 修复方式：迁移 113 去重 + 加唯一索引 `uk_contact_primary_per_customer`
 * （函数式索引，表达式 IF(is_primary=1 AND deleted_at IS NULL, customer_id, NULL)）。
 * 本文件验证：
 *   ① 不变量真的被数据库强制（直接插第二条主联系人必须被拒）；
 *   ② 写路径在「客户已有主联系人」时改为先降级再升级/插入，不得撞唯一键，且最终恰好一条；
 *   ③ 存量数据已清理。
 *
 * 环境要求：MySQL 可达且**已应用迁移 113**（E2E 自举会跑迁移链；CI 由 deploy/ci-missing-tables.sql 建同款索引）。
 * 不可达则整组跳过（同 tests/db 其它用例）。
 */

const net = require('net');
const mysql = require('mysql2/promise');
const contactRouteService = require('../../services/contactRouteService');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

const INDEX_NAME = 'uk_contact_primary_per_customer';
const canManage = async () => true; // 权限判定不是本用例的关注点
const user = { userId: 1, manageAll: true };

let pool;
let reachable = false;
let customerId = null;
let contactIds = [];

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
    console.warn(`[contactSinglePrimary] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过真实 SQL 测试`);
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 2
  });
});

// 每个用例一个独立临时客户：避免上一个用例残留的主联系人把下一个用例的建数据步骤撞上唯一键
// （这曾让首版测试在自己身上失败，掩盖了产品侧结论）
beforeEach(async () => {
  if (!reachable) return;
  contactIds = [];
  const [r] = await pool.query(
    'INSERT INTO crm_customer (company_name, status, business_status) VALUES (?, ?, ?)',
    [`联系人主键约束测试_${Date.now()}_${Math.floor(Math.random() * 1000)}`, 'following', 'following']
  );
  customerId = r.insertId;
});

afterEach(async () => {
  if (!reachable || !pool) return;
  for (const id of contactIds) {
    try { await pool.query('DELETE FROM crm_contact WHERE id = ?', [id]); } catch { /* ignore */ }
  }
  if (customerId) {
    try { await pool.query('DELETE FROM crm_customer WHERE id = ?', [customerId]); } catch { /* ignore */ }
    customerId = null;
  }
});

afterAll(async () => {
  if (pool) await pool.end();
});

async function insertContact(name, isPrimary) {
  const [r] = await pool.query(
    'INSERT INTO crm_contact (customer_id, name, is_primary) VALUES (?, ?, ?)',
    [customerId, name, isPrimary]
  );
  contactIds.push(r.insertId);
  return r.insertId;
}

async function primaryContacts() {
  const [rows] = await pool.query(
    'SELECT id FROM crm_contact WHERE customer_id = ? AND is_primary = 1 AND deleted_at IS NULL ORDER BY id',
    [customerId]
  );
  return rows.map((r) => r.id);
}

describe('联系人单一主联系人约束（真连库）', () => {
  it('唯一索引存在（不变量被数据库强制）', async () => {
    if (!reachable) return;
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'crm_contact' AND INDEX_NAME = ?`,
      [DB_NAME, INDEX_NAME]
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it('存量数据已清理：不存在有多条主联系人的客户', async () => {
    if (!reachable) return;
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS n FROM (
         SELECT customer_id FROM crm_contact
         WHERE is_primary = 1 AND deleted_at IS NULL
         GROUP BY customer_id HAVING COUNT(*) > 1
       ) t`
    );
    expect(rows[0].n).toBe(0);
  });

  it('直接插入第二条主联系人必须被数据库拒绝', async () => {
    if (!reachable) return;
    const first = await insertContact(`约束测试_主_${Date.now()}`, 1);
    expect(await primaryContacts()).toEqual([first]);

    await expect(insertContact(`约束测试_第二主_${Date.now()}`, 1)).rejects.toThrow();
    expect(await primaryContacts()).toEqual([first]);
  });

  it('updateContact 设为主联系人时不得撞唯一键，且最终只有刚指定的一条', async () => {
    if (!reachable) return;

    const existingPrimary = await insertContact(`更新测试_原主_${Date.now()}`, 1);
    const target = await insertContact(`更新测试_目标_${Date.now()}`, 0);
    expect(await primaryContacts()).toEqual([existingPrimary]);

    await contactRouteService.updateContact(
      pool,
      { id: target, name: `更新测试_目标_${Date.now()}`, is_primary: 1 },
      user,
      canManage
    );

    expect(await primaryContacts()).toEqual([target]);
  });

  it('addContact 指定为主联系人时不得撞唯一键，且最终只有新增那条', async () => {
    if (!reachable) return;

    await insertContact(`新增测试_原主_${Date.now()}`, 1);

    const newId = await contactRouteService.addContact(
      pool,
      { customer_id: customerId, name: `新增测试_新主_${Date.now()}`, is_primary: 1 },
      user,
      canManage
    );
    contactIds.push(newId);

    expect(await primaryContacts()).toEqual([newId]);
  });
});

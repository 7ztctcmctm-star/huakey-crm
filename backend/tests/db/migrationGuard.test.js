/**
 * 迁移链完整性守卫 —— schema_migrations 与迁移文件的一致性
 *
 * ## 缺陷背景（2026-10-13 实测）
 *
 * 测试库 `huakey_crm_test` 的 `schema_migrations` 只记到 113，
 * 而 `database/migrations/` 下有 118 个迁移文件，缺 114、116~121 共 7 个。
 *
 * 逐个核实后确认**不是记账漂移，而是真缺失**（效果均未落库）：
 *   · 114 `crm_contract_item` 表不存在 → `contractController.js:71` 合同详情查询必然 ERROR 1146
 *   · 116 `crm_approval_rule` 表不存在 → `approvalService.js:190/226` 审批规则查询必然 ERROR 1146
 *   · 117 boss/manager 无 knowledge 权限
 *   · 118 `api_platform` 权限码不存在
 *   · 119 `log:delete` 权限码不存在
 *   · 120 manager 权限数 74 ≠ boss 98
 *   · 121 finance 无 quotation、sales 无 competitor 权限码
 *
 * 为什么长期没被发现：**这些代码路径没有测试覆盖**，148 个套件全绿也照样漏。
 * 本文件补上这道守卫 —— 任何后续「文件在库未跑」的情况都会红。
 *
 * ## 为什么不能靠 CI 兜底
 * 项目记忆记载：CI 建库走`deploy/init-complete.sql`（并集终态）并标记全部迁移已执行，
 * **CI 从不跑迁移**。所以「本地/测试库漏跑迁移」这一类缺陷 CI 天然抓不到，
 * 只能靠本守卫在每次全量测试时兜住。
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'crm_test';
const DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';

//本文件位于 backend/tests/db/ → 上溯三层到仓库根，才能定位 database/migrations
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../database/migrations');

let pool;
let reachable = false;
let appliedVersions = new Set();
let fileVersions = [];

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
    console.warn(`[migrationGuard] MySQL 不可达 (${DB_HOST}:${DB_PORT})，跳过迁移链守卫`);
    return;
  }
  pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, waitForConnections: true, connectionLimit: 2
  });

  const [rows] = await pool.query('SELECT version FROM schema_migrations');
  appliedVersions = new Set(rows.map(r => String(r.version)));

  // 只取 up 迁移（排除 *_down.sql 回滚脚本）
  fileVersions = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.includes('_down'))
    .map(f => ({ version: f.slice(0, 3), file: f }))
    .sort((a, b) => a.version.localeCompare(b.version));
});

afterAll(async () => {
  if (pool) await pool.end();
});

describe('迁移链完整性守卫', () => {
  it('每个迁移文件都应在 schema_migrations 中有对应记录', () => {
    if (!reachable) return;
    const missing = fileVersions.filter(v => !appliedVersions.has(v.version));
    expect(missing.map(m => `${m.version}(${m.file})`)).toEqual([]);
  });

  it('schema_migrations 不应记录不存在的迁移文件（防误记账）', () => {
    if (!reachable) return;
    const fileVerSet = new Set(fileVersions.map(v => v.version));
    const orphans = [...appliedVersions].filter(v => !fileVerSet.has(v));
    expect(orphans).toEqual([]);
  });

  // ---- 以下为「效果断言」：记账齐了不等于效果落了 ----

  it('114: crm_contract_item 应可被真实查询（此前必然 ERROR 1146）', async () => {
    if (!reachable) return;
    const [rows] = await pool.query(
      'SELECT id, product_name FROM crm_contract_item WHERE contract_id = ? AND deleted_at IS NULL ORDER BY id',
      [1]
    );
    expect(Array.isArray(rows)).toBe(true);
  });

  it('116: crm_approval_rule 表应存在（approvalService 审批规则依赖）', async () => {
    if (!reachable) return;
    // 实测依据：approvalService.js:188-194 按 business_type + 金额区间查审批规则
    const [rows] = await pool.query(
      `SELECT id FROM crm_approval_rule
        WHERE business_type = 'quote' AND status = 1 AND deleted_at IS NULL`
    );
    expect(Array.isArray(rows)).toBe(true);
  });

  it('118: api_platform 权限码应存在（routes/api-platform.js 依赖）', async () => {
    if (!reachable) return;
    const [rows] = await pool.query("SELECT id FROM sys_permission WHERE code = 'api_platform'");
    expect(rows.length).toBe(1);
  });

  it('117: boss 与 manager 都应持有 knowledge 权限', async () => {
    if (!reachable) return;
    const [rows] = await pool.query(
      `SELECT r.code FROM sys_role_permission rp
        JOIN sys_role r ON r.id = rp.role_id
        JOIN sys_permission p ON p.id = rp.permission_id
       WHERE p.code = 'knowledge' AND r.code IN ('boss','manager')`
    );
    const codes = rows.map(r => r.code).sort();
    expect(codes).toEqual(['boss', 'manager']);
  });

  it('119: log:delete 与 log:export 权限码应存在', async () => {
    if (!reachable) return;
    const [rows] = await pool.query(
      "SELECT code FROM sys_permission WHERE code IN ('log:delete','log:export')"
    );
    expect(rows.length).toBe(2);
  });

  it('120: manager 权限数应追平 boss（120 迁移目标）', async () => {
    if (!reachable) return;
    // 2026-10-15：改按 roleCode（原硬编码 role_id IN (1,2) —— 角色 id 跨环境不可靠，
    // 本项目铁律「一律 roleCode」。本机 boss=1/manager=2 巧合蒙对，但 finance 在
    // 测试库是 31、生产库当年是 6，同类硬编码已让 121 的授权静默丢失过一次）。
    const [rows] = await pool.query(
      `SELECT r.code, COUNT(*) AS n FROM sys_role_permission rp
         JOIN sys_role r ON r.id = rp.role_id
        WHERE r.code IN ('boss','manager') GROUP BY r.code`
    );
    const map = new Map(rows.map(r => [r.code, Number(r.n)]));
    expect(map.get('manager')).toBe(map.get('boss'));
  });

  it('121: finance 应持有 quotation 权限码', async () => {
    if (!reachable) return;
    // 实测依据：quote.js list 路由 checkPermission('quotation')
    // 2026-10-15：改按 roleCode（原硬编码 role_id=6，测试库 finance=31 ⇒ 数据已修好仍假红）
    const [rows] = await pool.query(
      `SELECT p.code FROM sys_role_permission rp
         JOIN sys_role r ON r.id = rp.role_id
         JOIN sys_permission p ON p.id = rp.permission_id
        WHERE r.code = 'finance' AND p.code = 'quotation'`
    );
    expect(rows.length).toBe(1);
  });

  it('121: sales 应持有 competitor 系列权限码', async () => {
    if (!reachable) return;
    // 实测依据：competitor.js checkPermission('competitor:view' / 'competitor:add')
    // 2026-10-15：改按 roleCode（原硬编码 role_id=3）
    const [rows] = await pool.query(
      `SELECT p.code FROM sys_role_permission rp
         JOIN sys_role r ON r.id = rp.role_id
         JOIN sys_permission p ON p.id = rp.permission_id
        WHERE r.code = 'sales' AND p.code LIKE 'competitor%'`
    );
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  // ---- 123：完整性约束（记账齐了 ≠ 约束真的落了） ----

  it('123: crm_invoice.invoice_no 应有唯一约束（防重号发票）', async () => {
    if (!reachable) return;
    // 实测依据：invoiceService.createInvoice 以 COUNT(*)+1 生成编号，并发下会重号
    const [rows] = await pool.query(
      `SELECT NON_UNIQUE FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_invoice'
          AND INDEX_NAME = 'uk_invoice_no'`
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(Number(rows[0].NON_UNIQUE)).toBe(0);
  });

  it('123: crm_payment_plan(contract_id, plan_date) 应有唯一约束', async () => {
    if (!reachable) return;
    const [rows] = await pool.query(
      `SELECT NON_UNIQUE FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_payment_plan'
          AND INDEX_NAME = 'uk_plan_contract_date'`
    );
    expect(rows.length).toBe(2); // 复合唯一键：contract_id + plan_date 两列
    expect(rows.every(r => Number(r.NON_UNIQUE) === 0)).toBe(true);
  });

  it('123: 6 条关键外键应全部存在（孤儿行拦截）', async () => {
    if (!reachable) return;
    const [rows] = await pool.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'
          AND CONSTRAINT_NAME IN (
            'fk_followup_opportunity', 'fk_opp_source', 'fk_payremind_contract',
            'fk_payremind_plan', 'fk_invoice_contract', 'fk_reminder_follow_plan')`
    );
    expect(rows.length).toBe(6);
  });
});
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

  // ---- 124：评分日志软删（记账齐了 ≠ 列真的加了） ----

  it('124: crm_customer_score_log.deleted_at 与复合索引应存在（C3 软删读路径依赖）', async () => {
    if (!reachable) return;
    // 实测依据：scoringRouteService.saveScoreResult 写 'UPDATE ... SET deleted_at = NOW()
    // WHERE customer_id = ? AND deleted_at IS NULL'，getCustomerScore / customerDetailService
    // 读路径均过滤 deleted_at IS NULL —— 列缺失即 ERROR 1054。
    const [cols] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer_score_log'
          AND COLUMN_NAME = 'deleted_at'`
    );
    expect(cols[0].n).toBe(1);

    const [idx] = await pool.query(
      `SELECT COUNT(DISTINCT INDEX_NAME) AS n FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer_score_log'
          AND INDEX_NAME = 'idx_csl_customer_deleted'`
    );
    expect(idx[0].n).toBe(1);
  });

  // ---- 123：完整性约束（记账齐了 ≠ 约束真的落了） ----

  it('123: crm_invoice.invoice_no 应有唯一约束（防重号发票）', async () => {
    if (!reachable) return;
    // 实测依据：invoiceService.createInvoice 按当日已用最大序号 +1 生成编号，唯一键用于兜底偶发冲突
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

// ============================================================
// B4（2026-10-20）：迁移链基线守卫 —— 静态一致性校验
//
// 背景：迁移链**不自足**。`001_init_baseline.sql` 只建 schema_migrations，
// 空库直接跑 run_migrations.js 会在 002 崩（实测：Table 'crm_customer'
// doesn't exist，exit 1）。故引入 `000_real_baseline.sql` 作为最底部。
//
// 治理约定（详见 docs/migration-baseline-governance.md）：
//   · 权威 = **生产库实测结构**，快照落在 database/baseline/prod-schema-snapshot.sql
//   · 000 = 下界（幂等建表，无 DROP）
//   · deploy/init-complete.sql = 上界（全新环境自举，含视图/事件）
//   · 三者表集合必须一致（允许差异见 KNOWN_BASELINE_EXCEPTIONS）
//
// 为什么放在静态层：默认 jest 套件**没有 MySQL**（backend-test job 也跑到
// tests/db/），任何依赖 DB 的断言都会因不可达而静默跳过 ⇒ 等于没守。
// 真正跑 DB 的往返验证见 backend/tests/db/migration-roundtrip.test.js，
// 由 CI 的 migration-test job 显式执行。
// ============================================================

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BASELINE_000 = path.join(REPO_ROOT, 'database/migrations/000_real_baseline.sql');
const BASELINE_000_DOWN = BASELINE_000.replace(/\.sql$/, '_down.sql');
const PROD_SNAPSHOT = path.join(REPO_ROOT, 'database/baseline/prod-schema-snapshot.sql');
const INIT_COMPLETE = path.join(REPO_ROOT, 'deploy/init-complete.sql');

/**
 * 已知、可接受的表集合差异。
 * ⚠️ 每加一条都必须写明原因与跟进方式；没有原因的差异一律视为缺陷。
 */
const KNOWN_BASELINE_EXCEPTIONS = {
  // 迁移内部临时备份表：由 097 / 113 在执行时自行创建，不属于应用结构，
  // 因此不进 000；init-complete.sql 是「全新环境自举」同样不该带垃圾表。
  '_migration_097_backup': '097 的临时备份产物（迁移内部状态），应由迁移自建/自清',
  'crm_contact_primary_backup_113': '113 的临时备份产物（迁移内部状态），应由迁移自建/自清',
  // 迁移追踪表：形状由 001 / run_migrations.js 兜底创建。
  // 它记录「本库跑过哪些迁移」，把它固化进基线会让新库一出生就带着别人的账目。
  'schema_migrations': '迁移追踪表，由 001 / run_migrations.js 创建，不应固化进 000',
};

const CORE_TABLES = [
  'crm_customer', 'crm_contact', 'crm_opportunity', 'crm_quote', 'crm_quote_item',
  'crm_contract', 'crm_contract_item', 'crm_payment', 'crm_payment_plan',
  'crm_invoice', 'crm_follow_up', 'crm_follow_plan', 'crm_product',
  'crm_supplier', 'crm_purchase_order', 'crm_purchase_request',
  'crm_service_order', 'sys_user', 'sys_role', 'sys_permission',
  'sys_role_permission', 'sys_dept', 'sys_config', 'sys_log',
];

function readSql(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

/** 抽取 SQL 文本里的建表名（幂等写法 CREATE TABLE IF NOT EXISTS 也支持） */
function extractTables(sql) {
  const set = new Set();
  const re = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`([^`]+)`/gi;
  let m;
  while ((m = re.exec(sql))) set.add(m[1]);
  return set;
}

describe('B4: 迁移链基线守卫（静态一致性）', () => {
  it('000_real_baseline.sql 必须存在且非空', () => {
    expect(fs.existsSync(BASELINE_000)).toBe(true);
    expect(readSql(BASELINE_000).trim().length).toBeGreaterThan(100);
  });

  it('000 基线必须覆盖全部核心业务表', () => {
    const tables = extractTables(readSql(BASELINE_000));
    const missing = CORE_TABLES.filter(t => !tables.has(t));
    expect(missing).toEqual([]);
  });

  /**
   * ⚠️ 安全红线：000 会跑在已存有生产数据的库上。
   * 一旦出现 DROP / TRUNCATE，等于清空生产。历史上 000 是「生成物」，
   * 本断言用来防止重新生成时把默认 mysqldump 的 DROP TABLE 带进来。
   */
  it('000 基线绝不能含 DROP / TRUNCATE（否则会清空生产数据）', () => {
    const sql = readSql(BASELINE_000);
    // 只看代码行，跳过注释行，避免正常说明文字被误判
    const code = sql
      .split('\n')
      .filter(l => !l.trim().startsWith('--'))
      .join('\n');
    expect(/\bDROP\s+TABLE\b/i.test(code)).toBe(false);
    expect(/\bDROP\s+DATABASE\b/i.test(code)).toBe(false);
    expect(/\bTRUNCATE\b/i.test(code)).toBe(false);
  });

  it('000 基线的每条建表都必须是幂等写法', () => {
    const sql = readSql(BASELINE_000);
    const nonIdempotent = (sql.match(/CREATE TABLE\s+(?!IF NOT EXISTS)/gi) || []).length;
    expect(nonIdempotent).toBe(0);
  });

  it('000_real_baseline_down.sql 必须覆盖与 000 完全相同的表集合', () => {
    const up = extractTables(readSql(BASELINE_000));
    const downSql = readSql(BASELINE_000_DOWN);
    const down = new Set();
    const re = /DROP TABLE IF EXISTS\s+`([^`]+)`/gi;
    let m;
    while ((m = re.exec(downSql))) down.add(m[1]);
    expect([...down].sort()).toEqual([...up].sort());
  });

  it('000 基线的表集合必须与生产权威快照一致（偏差需登记）', () => {
    const baseline = extractTables(readSql(BASELINE_000));
    const prod = extractTables(readSql(PROD_SNAPSHOT));
    const onlyProd = [...prod].filter(t => !baseline.has(t)).sort();
    const onlyBaseline = [...baseline].filter(t => !prod.has(t)).sort();

    const unregistered = [...onlyProd, ...onlyBaseline]
      .filter(t => !(t in KNOWN_BASELINE_EXCEPTIONS));
    expect(unregistered).toEqual([]);
  });

  it('deploy/init-complete.sql 的表集合必须与 000 基线一致（上界 == 下界）', () => {
    const baseline = extractTables(readSql(BASELINE_000));
    const init = extractTables(readSql(INIT_COMPLETE));
    const onlyInit = [...init].filter(t => !baseline.has(t)).sort();
    const onlyBaseline = [...baseline].filter(t => !init.has(t)).sort();

    const unregistered = [...onlyInit, ...onlyBaseline]
      .filter(t => !(t in KNOWN_BASELINE_EXCEPTIONS));
    expect(unregistered).toEqual([]);
  });
});

// ============================================================
// B4：迁移编号连续性守卫
//
// 背景：迁移编号存在跳号（064 / 065 / 115）。经考证它们**从未入库**
//      （`git log --all --diff-filter=A` 查遍所有 ref 均无记录，对照组
//        114 可正常查到），属「版本号被占用后跳号」的历史遗留，无害。
//      但**新增跳号必须被看见** —— 跳号一旦无记录，就再也无法判断
//      某版本是否已应用于生产（这正是 109 改号 111 的根因）。
//      故：白名单之外的新缺口一律让测试红。
// ============================================================

/** 已考证、确认无害的编号缺口（写成闭开区间 [start, end)） */
const KNOWN_VERSION_GAPS = [
  { from: 64, to: 66, reason: '2026-09-10 考证：文件从未入库，无引用无依赖' },
  { from: 115, to: 116, reason: '2026-10-20 考证：git log --all --diff-filter=A 无记录，版本号被占用后跳号' },
];

describe('B4: 迁移编号连续性守卫', () => {
  it('不得出现白名单之外的新缺口', () => {
    const versions = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && /^\d{3}_/.test(f) && !f.includes('_down'))
      .map(f => parseInt(f.slice(0, 3), 10))
      .sort((a, b) => a - b);

    const max = versions[versions.length - 1];
    const present = new Set(versions);
    const gaps = [];
    for (let v = 1; v <= max; v++) {
      if (!present.has(v)) gaps.push(v);
    }

    const known = new Set();
    for (const g of KNOWN_VERSION_GAPS) {
      for (let v = g.from; v < g.to; v++) known.add(v);
    }
    const unregistered = gaps.filter(v => !known.has(v));
    expect(unregistered).toEqual([]);
  });

  it('不得出现重复版本号', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && /^\d{3}_/.test(f) && !f.includes('_down'));
    const versions = files.map(f => f.slice(0, 3));
    expect(new Set(versions).size).toBe(versions.length);
  });
});
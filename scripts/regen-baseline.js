#!/usr/bin/env node
/**
 * 从「权威源库」重新生成两份基线文件
 *
 *   1. database/migrations/000_real_baseline.sql      幂等建表基线（迁移链的最底部）
 *   2. database/migrations/000_real_baseline_down.sql 对应的回滚脚本
 *   3. deploy/init-complete.sql                       全新环境自举基线（含视图 / 事件）
 *
 * 背景（B4，2026-10-20）
 * ---------------------
 * `001_init_baseline.sql` 只创建 `schema_migrations`，其注释写明「初始建表脚本在本迁移
 * 之前已执行」。也就是说**迁移链本身不自足**：空库直接跑 `run_migrations.js` 会在 002
 * 就崩（`crm_customer` 不存在）。过去靠 `deploy/init-complete.sql` 兜底，但那份基线
 * 是「旧基线 + 迁移 + 手工补丁」的**并集**，长期无人与生产对齐，实测已漂移 26 处
 * （缺 `sys_cron_log` / `sys_client_perf` / 归档事件，多出幽灵表 `sys_operation_log`，
 * 外键引用动作与生产相反等）。
 *
 * 治理约定
 * --------
 * · **权威 = 生产库实测结构**。本脚本从生产导出的快照库反向生成基线，不再手工拼接并集。
 * · `000` 是**下界**：001..123 在它之上必须全部幂等、无副作用，
 *   由 `backend/tests/db/migrationGuard.test.js` 双向校验。
 * · `init-complete.sql` 是**上界**：必须与「000 + 迁移链终态」等价，同样由该守卫校验。
 * · 本脚本产物为**生成物**，禁止手工编辑；结构变更一律新增迁移后重新生成。
 *
 * 用法
 * ----
 *   # 0) 刷新生产快照（需 ssh 免密到 nas-crm，见 scripts/dump-prod-schema.sh）
 *   bash scripts/dump-prod-schema.sh
 *
 *   # 1) 把快照导入一个临时库（库名含 test，避免误伤）
 *   mysql -ucrm_user -p -e "CREATE DATABASE huakey_crm_test ..."
 *   mysql -ucrm_user -p huakey_crm_test < database/baseline/prod-schema-snapshot.sql
 *
 *   # 2) 生成基线
 *   DB_PASSWORD=*** DB_NAME=huakey_crm_test \
 *     MYSQLDUMP="C:/Program Files/MySQL/mysql-8.0.46-winx64/bin/mysqldump.exe" \
 *     node scripts/regen-baseline.js
 *
 * 环境变量：
 *   DB_HOST(127.0.0.1) DB_PORT(3306) DB_USER(crm_user) DB_PASSWORD(*必填)
 *   DB_NAME          源库名（默认 huakey_crm_test）
 *   MYSQLDUMP        mysqldump 路径（默认 mysqldump）
 *   OUT_000          000 基线输出路径
 *   OUT_INIT         init-complete 输出路径
 *   EXCLUDE_TABLES  额外排除的表（逗号分隔）
 */
const fs = require('fs');
const path = require('path');
const mysql = require('C:/huakey-crm/backend/node_modules/mysql2/promise');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT || '3306';
const DB_USER = process.env.DB_USER || 'crm_user';
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME || 'huakey_crm_test';
const MYSQLDUMP = process.env.MYSQLDUMP || 'mysqldump';

const OUT_000 = process.env.OUT_000 || path.join(REPO, 'database/migrations/000_real_baseline.sql');
const OUT_000_DOWN = OUT_000.replace(/\.sql$/, '_down.sql');
const OUT_INIT = process.env.OUT_INIT || path.join(REPO, 'deploy/init-complete.sql');

/**
 * 迁移内部产生的临时/备份表 —— 不属于应用结构，不进基线。
 * 这些表是某次迁移执行时的中间产物，若进了基线会让「全新环境」平白多出垃圾表。
 */
const DEFAULT_EXCLUDES = [
  'schema_migrations',              // 迁移追踪表，由 001 / run_migrations.js 兜底创建
  '_migration_097_backup',          // 097 的临时备份表
  'crm_contact_primary_backup_113', // 113 的临时备份表
];

function fail(msg) {
  console.error(`[regen-baseline] ${msg}`);
  process.exit(1);
}

if (!DB_PASSWORD) fail('缺少 DB_PASSWORD 环境变量。');
if (!DB_NAME) fail('缺少 DB_NAME 环境变量。');

const EXCLUDES = new Set([
  ...DEFAULT_EXCLUDES,
  ...(process.env.EXCLUDE_TABLES || '').split(',').map(s => s.trim()).filter(Boolean),
]);

let pool;
try {
  pool = mysql.createPool({
    host: DB_HOST, port: parseInt(DB_PORT, 10), user: DB_USER, password: DB_PASSWORD,
    database: DB_NAME, multipleStatements: true, waitForConnections: true, connectionLimit: 2
  });
} catch (e) {
  fail(`创建连接池失败: ${e.message}`);
}

function q(sql) {
  return pool.query(sql);
}

/** mysql -B -N 风格的单行多列输出 → 二维数组 */
async function rows(sql) {
  const [r] = await q(sql);
  return r;
}

/** 取 SHOW CREATE xxx 的 DDL 文本 */
async function showCreate(keyword, name) {
  const [r] = await q(`SHOW CREATE ${keyword} \`${name}\``);
  const row = r[0];
  const col = Object.keys(row).find(k => /^Create /i.test(k));
  return row[col];
}

const BANNER_000 = `-- ============================================================
-- 迁移 000：真实权威基线（生成物，禁止手工编辑）
--
-- 来源：生产库 huakey_crm 的实测结构
--      （mysqldump --no-data --events --routines，来源容器 huakey-mysql / 群晖 NAS）
-- 生成：node scripts/regen-baseline.js（详见该文件头部说明）
-- 快照：database/baseline/prod-schema-snapshot.sql
--
-- ⚠️ 为什么需要它
--   001_init_baseline.sql 只建了 schema_migrations，其注释明确「初始建表脚本在本迁移
--   之前已执行」。即**迁移链本身不自足**：空库直接跑 run_migrations.js 会在 002 崩
--   （crm_customer 不存在）。本文件把迁移链采纳之前的结构补回来，使
--       空库 ──000──▶ 初始结构 ──001..123──▶ 生产权威终态
--
-- ⚠️ 治理约定
--   1. 本文件是**下界**：001..123 在它之上必须全部幂等、无副作用。
--      新增迁移不得再假设「某列 / 某索引一定不存在」。
--   2. deploy/init-complete.sql 是**上界**：必须等价于「000 + 迁移链终态」。
--   3. 两者偏差由 backend/tests/db/migrationGuard.test.js 双向校验。
--
-- ⚠️ 安全边界
--   全篇只用 CREATE TABLE IF NOT EXISTS，**绝不含 DROP / TRUNCATE** ——
--   本文件会跑在已存有生产数据的库上，任何 DROP 都是灾难。
-- ============================================================`;

const BANNER_000_DOWN = `-- ============================================================
-- 回滚 000：撤销真实权威基线（生成物，禁止手工编辑）
--
-- 仅用于「空库重放」类验证场景（如 roundtrip 测试建立重放态）。
-- ⚠️ 生产库**严禁**执行：会删除全部基线表及其数据。
-- ============================================================`;

async function main() {
  // 连通性检查
  try {
    await q('SELECT 1');
  } catch (e) {
    fail(`源库不可达 (${DB_HOST}:${DB_PORT}/${DB_NAME}): ${e.message}`);
  }

  const tableRows = await rows(
    `SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`
  );
  const tables = tableRows.map(r => r.TABLE_NAME).filter(t => !EXCLUDES.has(t));

  if (tables.length === 0) fail(`源库 ${DB_NAME} 未找到任何基线表，拒绝生成空基线。`);

  // 1) 000 up：幂等建表
  const up = [BANNER_000, '', 'SET FOREIGN_KEY_CHECKS = 0;', ''];
  for (const t of tables) {
    const ddl = await showCreate('TABLE', t);
    up.push(
      ddl
        .replace(/^CREATE TABLE `/, 'CREATE TABLE IF NOT EXISTS `')
        .replace(/\s*AUTO_INCREMENT=\d+/i, '')
      + ';',
      ''
    );
  }
  up.push('-- 视图 v_user_permissions 由 014 创建、事件 evt_archive_sys_log 由 056 创建，');
  up.push('-- 二者均已是幂等写法（CREATE OR REPLACE / DROP IF EXISTS），故不进基线。');
  up.push('SET FOREIGN_KEY_CHECKS = 1;');
  up.push('');
  up.push(`-- 基线共 ${tables.length} 张表`);

  // 2) 000 down：按外键安全的方式删除
  const down = [BANNER_000_DOWN, '', 'SET FOREIGN_KEY_CHECKS = 0;', ''];
  for (const t of [...tables].reverse()) {
    down.push(`DROP TABLE IF EXISTS \`${t}\`;`);
  }
  down.push('SET FOREIGN_KEY_CHECKS = 1;');
  down.push('');

  fs.writeFileSync(OUT_000, up.join('\n'), 'utf8');
  fs.writeFileSync(OUT_000_DOWN, down.join('\n'), 'utf8');
  console.log(`✓ ${path.relative(REPO, OUT_000)}      （${tables.length} 张表）`);
  console.log(`✓ ${path.relative(REPO, OUT_000_DOWN)}（${tables.length} 张表）`);
}

main()
  .catch(e => fail(e.message))
  .finally(() => pool && pool.end());

#!/usr/bin/env node
/**
 * 重新生成 deploy/init-complete.sql（全新环境的结构基线）
 *
 * 背景
 * ----
 * 本仓库的迁移链**不是**自足的：`database/migrations/001_init_baseline.sql` 只创建
 * `schema_migrations`，其注释明确「初始建表脚本在本迁移之前已执行」。即真实部署流程是
 *
 *     init-complete.sql（结构基线）  →  run_migrations.js（111 个增量迁移）
 *
 * 而 CI / E2E 自举为了提速，采用的是
 *
 *     init-complete.sql  →  ci-missing-tables.sql（手工补丁）  →  标记所有迁移已执行
 *
 * 历史上基线快照严重落后于迁移链（crm_customer.status 仍是 TINYINT、缺 business_status /
 * is_demo 等），CI 库与真实迁移链**静默漂移**，只能靠 ci-missing-tables.sql 逐条打补丁追平（N-05）。
 *
 * ⚠ 关键认知：**仅跑迁移链并不足以还原权威结构**。存在两类缺口：
 *   1) 旧基线的建表语句比迁移链更「瘦」，而迁移多用 `CREATE TABLE IF NOT EXISTS`
 *      ⇒ 表已存在即整段跳过，迁移里的列（如 039 的 create_by/update_time）永远建不上；
 *   2) 少数结构只存在于 ci-missing-tables.sql（如 crm_quote/crm_contract.update_time）。
 *   因此权威结构 = 旧基线 + 全部迁移 + ci-missing 修正 的**并集**。
 *
 * 本脚本即从该并集终态反向导出基线，使其与 CI/E2E 实际校验的库结构逐表逐列一致，
 * 从而让 CI/E2E 导入本文件即可，无需再依赖 ci-missing-tables.sql（该文件退化为幂等空跑）。
 *
 * 用法
 * ----
 *   # 1) 建临时库（库名建议含 test），导入**当前**基线，跑完迁移链，再应用 ci-missing 修正
 *   mysql -u root -p -e "CREATE DATABASE huakey_baseline_regen_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
 *   sed "s/`huakey_crm`/`huakey_baseline_regen_test`/g" deploy/init-complete.sql \
 *     | mysql -u root -p huakey_baseline_regen_test
 *   NODE_PATH=backend/node_modules DB_NAME=huakey_baseline_regen_test \
 *     DB_USER=root DB_PASSWORD=*** node database/migrations/run_migrations.js
 *   mysql -u root -p huakey_baseline_regen_test < deploy/ci-missing-tables.sql
 *
 *   # 2) 从该库导出新基线（排除迁移内部备份表）
 *   DB_PASSWORD=*** IGNORE_TABLES=_migration_097_backup,crm_contact_primary_backup_113 \
 *     node scripts/regen-init-baseline.js huakey_baseline_regen_test
 *
 * 环境变量：DB_HOST(127.0.0.1) DB_PORT(3306) DB_USER(root) DB_PASSWORD(*必填)
 *           MYSQLDUMP(默认 mysqldump) OUT(默认 deploy/init-complete.sql)
 *           IGNORE_TABLES(逗号分隔，排除迁移内部备份表等非应用表)
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SRC_DB = process.argv[2];
const OUT =
  process.env.OUT ||
  path.resolve(__dirname, '..', 'deploy', 'init-complete.sql');

if (!SRC_DB) {
  console.error('用法: node scripts/regen-init-baseline.js <源库名>');
  console.error('详见本文件头部注释。');
  process.exit(2);
}

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT || '3306';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD;
const MYSQLDUMP = process.env.MYSQLDUMP || 'mysqldump';

if (!DB_PASSWORD) {
  console.error('缺少 DB_PASSWORD 环境变量。');
  process.exit(2);
}

const IGNORE_TABLES = (process.env.IGNORE_TABLES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const WARNING = `-- ⚠️⚠️⚠️ 基线生成说明 ⚠️⚠️⚠️
-- 本文件是**结构基线快照**，由「旧基线 + 全部迁移 + ci-missing-tables.sql 修正」的
-- 并集终态反向导出，与 CI / E2E 实际校验的库结构**逐表逐列一致**
-- （生成方式见 scripts/regen-init-baseline.js）。
--
-- 为什么是并集而非「迁移链终态」：
--   · 迁移多用 CREATE TABLE IF NOT EXISTS，旧基线偏瘦的表会整段跳过，迁移里的列建不上；
--   · 少数结构（如 crm_quote/crm_contract.update_time）只存在于 ci-missing-tables.sql。
--   仅跑迁移无法还原权威结构，故必须叠加 ci-missing 修正。
--
-- 用途：全新环境 / CI / E2E 自举的建库起点。
--   · 生产/演练：导入本文件后，正常执行 database/migrations/run_migrations.js（幂等补齐）；
--   · CI / E2E：导入本文件即得到与校验库一致的库，**ci-missing-tables.sql 退化为幂等空跑**。
--
-- 约束：
--   · 仅含结构（CREATE TABLE / VIEW），**不含任何业务数据**；种子数据见 database/seeds/。
--   · 不含 USE 语句，以连接默认库为准（迁移规范禁止在脚本内切库）。
--   · 视图已剥离 DEFINER（避免依赖 crm_user 等特定账号，便于跨环境导入）。
--   · 已排除迁移内部备份表（_migration_*_backup / *_backup_* 等），它们非应用结构。
--   · 禁止在本文件上手工改表结构；结构变更一律通过新增迁移文件实施，再重新生成本基线。
--
-- 重新生成：见 scripts/regen-init-baseline.js 头部说明。`;

function main() {
  const args = [
    '-h', DB_HOST,
    '-P', DB_PORT,
    '-u', DB_USER,
    `-p${DB_PASSWORD}`,
    '--no-data',            // 只导结构，不导数据（默认带 DROP TABLE IF EXISTS，与原基线一致）
    '--single-transaction'
  ];
  for (const t of IGNORE_TABLES) {
    args.push(`--ignore-table=${SRC_DB}.${t}`);
  }
  args.push(SRC_DB);

  let raw;
  try {
    raw = execFileSync(MYSQLDUMP, args, {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (e) {
    console.error('mysqldump 执行失败:', e.message);
    if (e.stderr) console.error(String(e.stderr));
    process.exit(1);
  }

  const beforeTables = (raw.match(/^CREATE TABLE /gm) || []).length;
  const beforeViews = (raw.match(/CREATE ALGORITHM=/g) || []).length;

  let out = raw
    .replace(/\r\n/g, '\n')
    // 库名归一化：快照里统一显示为 huakey_crm（CI 会在导入前 sed 成自己的库名）
    .replace(/^(-- Host:.*Database: ).*$/m, (_m, p1) => `${p1}huakey_crm`)
    // 剥离 DEFINER（`root`@`localhost` / `crm_user`@`localhost` 等），提升跨环境可移植性
    .replace(/DEFINER=`[^`]*`@`[^`]*` /g, '')
    .replace(/\n{3,}/g, '\n\n');

  // 在 banner（-- Server version 行）之后插入基线说明
  const lines = out.split('\n');
  const svIdx = lines.findIndex((l) => l.startsWith('-- Server version'));
  const insertAt = svIdx === -1 ? 0 : svIdx + 1;
  lines.splice(insertAt, 0, '', WARNING, '');
  out = lines.join('\n');

  if (!out.endsWith('\n')) out += '\n';

  fs.writeFileSync(OUT, out, 'utf8');

  const afterTables = (out.match(/^CREATE TABLE /gm) || []).length;
  const afterViews = (out.match(/CREATE ALGORITHM=/g) || []).length;

  console.log(`源库          : ${SRC_DB} @ ${DB_HOST}:${DB_PORT}`);
  console.log(`输出          : ${OUT}`);
  if (IGNORE_TABLES.length) console.log(`排除表        : ${IGNORE_TABLES.join(', ')}`);
  console.log(`表            : ${beforeTables} -> ${afterTables}`);
  console.log(`视图          : ${beforeViews} -> ${afterViews}`);
  console.log(`行数          : ${out.split('\n').length}`);
  console.log(`残留 DEFINER  : ${(out.match(/DEFINER=/g) || []).length}`);
  console.log(`残留 USE 语句 : ${(out.match(/^USE /gm) || []).length}`);
  console.log(`大小          : ${(Buffer.byteLength(out, 'utf8') / 1024).toFixed(1)} KB`);
}

main();

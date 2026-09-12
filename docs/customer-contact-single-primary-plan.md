# 联系人「单一主联系人」不变量修复 —— 实施计划

> **For agentic workers:** 用 `executing-plans` 逐任务执行，步骤用 `- [ ]` 跟踪。设计与方案 A 已于
> 2026-09-11 经用户批准（含生产库数据去重）。

**Goal:** 让「每个客户最多一个主联系人」成为**数据库强制的不变量**，从而一次性修好因 `LEFT JOIN crm_contact ... is_primary = 1` 扇出而重复的 20 处列表查询（客户/合同/收款/公海/审批/服务单/分析…）。

**Architecture:** ①迁移里先备份受影响行、再把每客户多余的主联系人降级（保留 `MIN(id)`）、最后加**唯一索引**（MySQL 8.0.13+ 函数式索引，表达式为 `IF(is_primary=1 AND deleted_at IS NULL, customer_id, NULL)`，NULL 不参与唯一性）；②写路径改为「先降级再升级/插入」，否则会先撞唯一键；③CI/全新库的 schema 来源是 `deploy/ci-missing-tables.sql`（CI 只把迁移标记为已执行、并不真跑），需同步。

**Tech Stack:** MySQL 8.0.46、Node/Express、mysql2、Jest（真连库测试）、Playwright。

**Spec:** 用户批准的方案 A + 本文件「根因证据」段。

---

## 根因证据（实测，非推断）

| 证据 | 数值 / 事实 |
|---|---|
| 未删客户 | 428 |
| 有 **2 条** `is_primary=1` 联系人的客户 | **417（97%）**（例：客户 11 → 联系人 14 与 529） |
| 无主联系人的未删客户 | 6 |
| 接口表现 | `POST /customers/list` `pageSize=200` → 返回 **200 行**、去重仅 **103 条**；`total=428`（`COUNT(DISTINCT)`）→ 行数与 total 口径不一致 |
| 扇出点 | 全仓 **10 个服务、20 处** `LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL` |
| 数据来源 | `deploy/ci-remaining-migrations.sql`（历史迁移）把 `crm_customer.contact_name` 迁成联系人并一律置 `is_primary=1`，**未先降级既有主联系人** → 每客户 2 条 |
| 写路径现状 | `addContact`/`updateContact` 是「**先升级后降级**」（`contactRouteService.js:84-90`、`140-152`）→ 加约束后会先撞唯一键；`deleteContact` 顺序正确 |

## Global Constraints

- 迁移文件命名：`NNN_name.sql` + `NNN_name_down.sql`，下一个号 = **113**；`schema_migrations(version,name)`。
- 迁移**不使用 `USE` 语句**（用 `DATABASE()`），否则测试库执行失败（见 112 号迁移注释）。
- 迁移必须**幂等**（可重复执行）；DDL 用 `information_schema` 判断 + `PREPARE/EXECUTE`（见 060/089 写法）。
- **CI 不跑迁移**（`.github/workflows/ci.yml` 用 `INSERT IGNORE INTO schema_migrations` 全部标记为已执行），
  它的库来自 `deploy/init-complete.sql` + `deploy/ci-missing-tables.sql` → schema 变更必须同步后者。
- 不动业务语义：不改变「谁是主联系人」的既有判定习惯，只把**重复**的收敛为最早那条（`MIN(id)`）。
- 改动后必须：后端全量测试 + 真连库测试 + 前端 chromium E2E 全绿（当前基线 113 套件/1101 用例、E2E 39 passed）。

---

## File Structure

| 文件 | 责任 |
|---|---|
| `database/migrations/113_single_primary_contact.sql` | 备份受影响行 → 去重 → 加唯一索引（存量库） |
| `database/migrations/113_single_primary_contact_down.sql` | 回滚：删索引 → 从备份表恢复 `is_primary` → 删备份表 |
| `deploy/ci-missing-tables.sql` | 全新库/CI：在 `is_primary` 列之后补同一唯一索引（幂等） |
| `backend/services/contactRouteService.js` | `addContact`/`updateContact` 改为「先降级再升级/插入」 |
| `backend/tests/db/contactSinglePrimary.test.js` | 真连库回归：不变量存在、重复已清、写路径不撞唯一键且最终唯一 |
| `docs/customer-contact-single-primary-plan.md` | 本计划 + 执行记录 |

---

## Task 1: 迁移 113（up）

**Files:** Create `database/migrations/113_single_primary_contact.sql`

- [ ] **Step 1: 写迁移**

```sql
-- ============================================================
-- 113: 联系人「每个客户最多一个主联系人」不变量
-- ============================================================
-- 背景（实测 2026-09-11）：
--   历史迁移（deploy/ci-remaining-migrations.sql 中把 crm_customer.contact_name
--   迁成联系人的那段）为每个客户插入一条 is_primary=1 的联系人，却未先降级既有主联系人，
--   导致 428 个未删客户中 417 个（97%）各有 2 条主联系人。
--   而全仓 10 个服务 20 处查询写的是
--     LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
--   一对多即扇出 → 列表返回重复行（实测 pageSize=200 返回 200 行、去重仅 103 条），
--   而 total 用 COUNT(DISTINCT c.id) → 行数与总数口径不一致。
--
-- 处理三步：
--   1) 备份将被降级的行（供 down 精确回滚）
--   2) 每客户保留 id 最小的一条为主联系人，其余降级
--   3) 加唯一索引固化不变量（函数式索引，NULL 不参与唯一性）
--
-- 影响评估：
--   🟡 中。UPDATE 97% 客户的多余主联系人 + 一条 DDL；无删数据、无列变更。
--   去重后前端「主联系人」显示为该客户最早创建的联系人（含历史迁移前就已存在的联系人）。
--
-- 回滚：113_..._down.sql（先删索引，再从备份表恢复 is_primary）。
-- 跨库兼容：不使用 USE，依赖 run_migrations.js 连接的默认数据库。
-- 幂等：重复执行时第 2 步无匹配行、第 3 步有 information_schema 判断。
-- ============================================================

-- ---------- 第 1 步：备份将被降级的行 ----------
CREATE TABLE IF NOT EXISTS crm_contact_primary_backup_113 (
  contact_id INT NOT NULL,
  customer_id INT NOT NULL,
  is_primary TINYINT(1) NOT NULL,
  backed_up_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='113 迁移前的 is_primary 快照（回滚用）';

INSERT IGNORE INTO crm_contact_primary_backup_113 (contact_id, customer_id, is_primary)
SELECT ct.id, ct.customer_id, ct.is_primary
FROM crm_contact ct
JOIN (
  SELECT customer_id, MIN(id) AS keep_id
  FROM crm_contact
  WHERE is_primary = 1 AND deleted_at IS NULL
  GROUP BY customer_id
  HAVING COUNT(*) > 1
) dup ON dup.customer_id = ct.customer_id AND ct.id <> dup.keep_id
WHERE ct.is_primary = 1 AND ct.deleted_at IS NULL;

-- ---------- 第 2 步：每客户只保留 id 最小的主联系人 ----------
UPDATE crm_contact ct
JOIN (
  SELECT customer_id, MIN(id) AS keep_id
  FROM crm_contact
  WHERE is_primary = 1 AND deleted_at IS NULL
  GROUP BY customer_id
  HAVING COUNT(*) > 1
) dup ON dup.customer_id = ct.customer_id AND ct.id <> dup.keep_id
SET ct.is_primary = 0
WHERE ct.is_primary = 1 AND ct.deleted_at IS NULL;

-- ---------- 第 3 步：唯一索引固化不变量 ----------
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact'
    AND INDEX_NAME = 'uk_contact_primary_per_customer');
SET @add_idx_sql = IF(@idx_exists = 0,
  'ALTER TABLE crm_contact ADD UNIQUE KEY uk_contact_primary_per_customer ((IF(is_primary = 1 AND deleted_at IS NULL, customer_id, NULL)))',
  'SELECT "uk_contact_primary_per_customer 已存在" AS msg');
PREPARE add_idx_stmt FROM @add_idx_sql;
EXECUTE add_idx_stmt;
DEALLOCATE PREPARE add_idx_stmt;

-- ---------- 验证 ----------
SELECT '=== 113 之后：仍有多主联系人的客户数（应为 0）===' AS info;
SELECT COUNT(*) AS remaining_multi_primary FROM (
  SELECT customer_id FROM crm_contact
  WHERE is_primary = 1 AND deleted_at IS NULL
  GROUP BY customer_id HAVING COUNT(*) > 1
) t;

SELECT '=== 113 之后：唯一索引是否存在（应为 1）===' AS info;
SELECT COUNT(*) AS uk_exists FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact'
  AND INDEX_NAME = 'uk_contact_primary_per_customer';

SELECT '=== 113 备份行数（供回滚，供人工核对）===' AS info;
SELECT COUNT(*) AS backed_up_rows FROM crm_contact_primary_backup_113;
```

- [ ] **Step 2: 在测试库实跑（迁移前先记录基线）**

Run（先测基线，再跑迁移，再看结果）：
```powershell
mysql -h 127.0.0.1 -u $env:DB_USER huakey_crm_test -e "SELECT COUNT(*) FROM (SELECT customer_id FROM crm_contact WHERE is_primary=1 AND deleted_at IS NULL GROUP BY customer_id HAVING COUNT(*)>1) t;"
node database/migrations/run_migrations.js
mysql -h 127.0.0.1 -u $env:DB_USER huakey_crm_test -e "SELECT COUNT(*) FROM (SELECT customer_id FROM crm_contact WHERE is_primary=1 AND deleted_at IS NULL GROUP BY customer_id HAVING COUNT(*)>1) t;"
```
Expected: 迁移前 **417** → 迁移后 **0**；且 `uk_exists = 1`。

- [ ] **Step 3: 幂等复跑**

再次执行同一迁移 SQL：应无报错、无改动（`remaining_multi_primary` 仍为 0）。

---

## Task 2: 迁移 113（down）

**Files:** Create `database/migrations/113_single_primary_contact_down.sql`

- [ ] **Step 1: 写 down 脚本**

```sql
-- 113 回滚：删唯一索引 → 从备份表恢复 is_primary → 删备份表
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact'
    AND INDEX_NAME = 'uk_contact_primary_per_customer');
SET @drop_idx_sql = IF(@idx_exists = 1,
  'ALTER TABLE crm_contact DROP INDEX uk_contact_primary_per_customer',
  'SELECT "索引不存在，跳过" AS msg');
PREPARE drop_idx_stmt FROM @drop_idx_sql;
EXECUTE drop_idx_stmt;
DEALLOCATE PREPARE drop_idx_stmt;

SET @bak_exists = (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact_primary_backup_113');
SET @restore_sql = IF(@bak_exists = 1,
  'UPDATE crm_contact ct JOIN crm_contact_primary_backup_113 b ON b.contact_id = ct.id SET ct.is_primary = b.is_primary',
  'SELECT "备份表不存在，跳过恢复" AS msg');
PREPARE restore_stmt FROM @restore_sql;
EXECUTE restore_stmt;
DEALLOCATE PREPARE restore_stmt;

SET @drop_bak_sql = IF(@bak_exists = 1,
  'DROP TABLE crm_contact_primary_backup_113',
  'SELECT "备份表不存在，跳过删除" AS msg');
PREPARE drop_bak_stmt FROM @drop_bak_sql;
EXECUTE drop_bak_stmt;
DEALLOCATE PREPARE drop_bak_stmt;
```

- [ ] **Step 2: 在测试库验证往返**

Run: `node database/migrations/run_migrations.js --rollback 113` → 多主联系人应恢复为迁移前数量（417）。
再 `node database/migrations/run_migrations.js` 重新应用 → 回到 0。

> 往返验证必须在**测试库**做（`DB_NAME=huakey_crm_test`），禁止在生产/开发库演练 rollback。

---

## Task 3: 写路径改为「先降级再升级/插入」

**Files:** Modify `backend/services/contactRouteService.js`

**Interfaces:** 两个函数对外签名不变；只调整语句顺序，保证任何时刻每个客户至多一条 `is_primary=1`。

- [ ] **Step 1: 写失败测试（真连库）**

Create `backend/tests/db/contactSinglePrimary.test.js`：
- 客户已有主联系人时，`updateContact(... is_primary=1 ...)` 不得因唯一键报错，且结果该客户恰好 1 条主联系人（且是刚指定的那条）；
- 客户已有主联系人时，`addContact(... is_primary=1 ...)` 同样不得报错，且恰好 1 条主联系人；
- 数据库层直接插入第二条主联系人必须被唯一键拒绝（证明不变量真的生效）；
- 未删客户中「多主联系人」计数为 0（存量已清理）。
（沿用仓库 `tests/db` 约定：MySQL 不可达则整组跳过；数据自建自清。）

- [ ] **Step 2: 运行，确认失败**

Run: `cd backend; npx jest tests/db/contactSinglePrimary.test.js --forceExit`
Expected: 「恰好 1 条主联系人」用例 **FAIL**（当前是先升级后降级，第二条主联系人插入/更新会撞唯一键或留下 2 条）。

- [ ] **Step 3: 调整顺序**

`addContact`：在 INSERT 之前，若本次要设为主联系人（`is_primary` 为真或客户当前无主联系人），
先执行 `UPDATE crm_contact SET is_primary = 0 WHERE customer_id = ? AND deleted_at IS NULL`，再 INSERT。
`updateContact`：把第 146-152 行的「降级其他联系人」**移到**第 140 行的 UPDATE **之前**。

- [ ] **Step 4: 运行，确认通过**

Run: `cd backend; npx jest tests/db/contactSinglePrimary.test.js --forceExit`
Expected: 全部 PASS。

---

## Task 4: 同步 CI / 全新库 schema

**Files:** Modify `deploy/ci-missing-tables.sql`

- [ ] **Step 1: 在 `is_primary` 列之后补同一唯一索引（幂等）**

在 259-270 行那段（`071: crm_contact.is_primary`）之后追加同样风格的 `information_schema` 判断 + `PREPARE/EXECUTE`，
索引名与表达式与迁移 113 **完全一致**：`uk_contact_primary_per_customer ((IF(is_primary = 1 AND deleted_at IS NULL, customer_id, NULL)))`。

- [ ] **Step 2: 说明为何不改 `init-complete.sql`**

在文件内注释写明：`init-complete.sql` 是旧版 dump，其 `crm_contact` 连 `is_primary` 列都没有
（该列由 `ci-missing-tables.sql` 的 071 段补上），故索引只能加在后者；否则会因列不存在而失败。

---

## Task 5: 验证与收口

- [ ] **Step 1: 真连库测试 + 后端全量**

Run: `cd backend; npx jest tests/db/ --forceExit --testTimeout=60000; npm test`
Expected: 真连库全绿；后端全量 ≥113 套件全绿（基线 113/1101，本次 +1 套件）。

- [ ] **Step 2: HTTP 端到端（重复行消失）**

启动后端（测试库）→ `POST /customers/list {page:1,pageSize:200}` → 断言
**返回行数 == 去重后条数**，且 `total` 与实际匹配；`/customers`（正式客户）同样校验。

- [ ] **Step 3: E2E**

Run: `cd frontend; npx playwright test --project=chromium`
Expected: **39 passed / 0 failed / 0 flaky**（基线）。

- [ ] **Step 4: 提交 + push，并在本文件追加执行记录**

提交信息需写明：根因证据、改动文件、迁移的前后数值、回滚方式、以及**未覆盖项**。

---

## Risks / Rollback

| 风险 | 说明 | 处置 |
|---|---|---|
| 去重改变了「主联系人」显示 | 97% 客户的显示主联系人从「批量迁入的那条」变为「最早创建的那条」 | 属预期（保留 `MIN(id)`，确定性规则）；备份表可精确回滚 |
| 唯一索引阻断既有写路径 | 已核实只有 `addContact`/`updateContact` 顺序有问题，Task 3 修 | Task 3 的真连库测试覆盖 |
| 生产库执行 | `deploy.sh` 会跑迁移链 | 迁移前先备份（仓库既有备份脚本）；down 脚本已验证往返 |
| CI 不跑迁移 | CI 用 `ci-missing-tables.sql` 建 schema | Task 4 同步 |

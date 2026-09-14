# N-05 · ci-missing-tables.sql 静默失败模式 · 修复报告

> **状态**: ✅ 已闭环 (2026-09-12)
> **优先级**: P0（CI 数据库完整性）
> **影响面**: `.github/workflows/ci.yml` 4 处建库流程 + `deploy/ci-missing-tables.sql` 91 段 PREPARE/EXECUTE

---

## 一、问题陈述

### 1.1 现象

`deploy/ci-missing-tables.sql` 共 **965 行**，含 **91 个 PREPARE 段**：
```sql
SET @uk_primary = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact' AND INDEX_NAME = 'uk_contact_primary_per_customer');
SET @sql113 = IF(@uk_primary = 0,
  'ALTER TABLE crm_contact ADD UNIQUE KEY uk_contact_primary_per_customer ((IF(is_primary = 1 AND deleted_at IS NULL, customer_id, NULL)))',
  'SELECT 1');
PREPARE stmt113 FROM @sql113; EXECUTE stmt113; DEALLOCATE PREPARE stmt113;
```

每段探测 `information_schema` 后用 `IF(cond, '<DDL>', 'SELECT 1')` 模式有条件补齐列/索引/唯一约束。

### 1.2 根因

mysql 客户端默认遇 SQL 错误时不中止脚本：
- `mysql -e` 模式：错误输出到 stderr 但 stdout 继续，**exit 0**
- 管道 / docker exec stdin 模式：错误报 ERROR 后**后续语句不再执行**，但 **exit 仍可能为 0**

具体三类静默失败：

| 段类型 | 数量 | 典型错误码 | 失败表象 |
|---|---|---|---|
| ADD COL | 82 | 1060 (列重名) / 1061 (重复 key) | 列未补齐 |
| ADD UNIQUE KEY | 2 | **1062 (重复键)** | 看似无约束 |
| CREATE INDEX | 4 | 1061 | 索引缺 |
| ADD INDEX | 1 | 1061 | 同上 |
| MODIFY COL | 2 | **1265 (truncated) / 1264 (strict)** | 数据/类型错位 |

### 1.3 影响

- **CI**：库由 init-complete.sql + ci-missing-tables.sql 拼成后，91 段任一失败无法察觉，**库看似建好实际缺 invariant**
- **生产**：部署脚本若复用此模式，相同静默失败模式

---

## 二、修复方案 (方案 A：尾部统一校验)

### 2.1 思路

**不动 91 段逻辑**，而是**事后用 information_schema 重放每个探测**，对照期望值：

- ADD COL / ADD INDEX / CREATE INDEX / ADD UNIQUE → 期望值 `1`（段后存在）
- MODIFY（探测条件含 `DATA_TYPE`） → 期望值 `0`（段后类型改了）

任何一项不满足 → 调用脚本返回 `exit 1`。

### 2.2 实现

#### 2.2.1 `deploy/ci-missing-tables-verify.sql`（自动生成）

`scripts/build-n05-verify.py` 解析 `ci-missing-tables.sql` 抽出 92 个探测，分类后写出：

```sql
SELECT
  GROUP_CONCAT(CONCAT(tag, IF(pass=1, '=OK', CONCAT('=FAIL(want ', expected, ', got ', actual, ')')))
    ORDER BY tag SEPARATOR ' | ') AS __n05_per_item,
  SUM(pass) AS __n05_passed,
  COUNT(*) AS __n05_total,
  SUM(IF(pass=0, 1, 0)) AS __n05_failed
FROM (
  SELECT '@col_xxx' AS tag,
         (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE ...) AS actual,
         1 AS expected,
         IF((SELECT COUNT(*) FROM ...) = 1, 1, 0) AS pass
  UNION ALL
  -- 共 92 项,2 项 expected=0 (DATA_TYPE 类)
  ...
) AS __n05_checklist;

SELECT @__n05_per_item AS `N-05_ITEM_REPORT`,
       @__n05_passed    AS `N-05_PASSED`,
       @__n05_total     AS `N-05_TOTAL`,
       @__n05_failed    AS `N-05_FAILED`;

SELECT IF(@__n05_failed = 0,
          CONCAT('N-05 ALL PASS: ', @__n05_passed, '/', @__n05_total, ' invariants satisfied'),
          CONCAT('N-05 FAIL: ', @__n05_failed, '/', @__n05_total, ' invariants violated (...)'))
       AS `N-05_FINAL`;
```

设计要点：
- **不创建 TEMP TABLE**（MEMORY engine 二次引用触发 1137）
- **SIGNAL 不在 PREPARE 中可行**（mysql 报 `This command is not supported in the prepared statement protocol yet`），让调用脚本决定 exit

#### 2.2.2 `scripts/verify-ci-missing-tables.sh`（独立调用）

```
./scripts/verify-ci-missing-tables.sh <DB_NAME> [HOST] [PORT] [USER] [PASS]
```

- `mysql --batch` 跑 verify 文件
- awk 解析 `N-05_ITEM_REPORT`/`N-05_PASSED`/`N-05_FAILED` 行
- exit 0/1 决策

#### 2.2.3 `.github/workflows/ci.yml`（4 处补 verify 调用）

每个 build step 在 `ci-missing-tables.sql` 跑完后追加：

```bash
echo "Verifying N-05..."
sed "s/.../" deploy/ci-missing-tables-verify.sql | \
  docker exec -i ci-mysql mysql --batch -u root -ptest_root_pass huakey_crm_test > /tmp/n05-verify.tsv
N05_RC=$?
if [ $N05_RC -ne 0 ] || grep -q '^N-05 FAIL' /tmp/n05-verify.tsv; then
  echo "✗ N-05 verify FAILED"
  cat /tmp/n05-verify.tsv
  exit 1
fi
echo "✓ N-05 verify: 92/92 invariants satisfied"
```

---

## 三、验证结果

| 场景 | 描述 | verify EXIT | 详情 |
|---|---|---|---|
| **空库** | 无任何 91 段执行 | **1 (FAIL)** | 92/92 invariants violated |
| **干净建库** | init-complete + 91 段成功 | **0 (PASS)** | 92/92 invariants satisfied |
| **手动破坏** | 删 1 列 + 1 索引 | **1 (FAIL)** | 89/92 invariants satisfied, 3/92 violated（精准定位） |
| **重建** | 重建回原状 | **0 (PASS)** | 92/92 invariants satisfied |

---

## 四、改动清单

| 文件 | 改动 |
|---|---|
| `deploy/ci-missing-tables-verify.sql` | **新增**：38 KB / 227 行 / 92 invariant 校验 |
| `scripts/build-n05-verify.py` | **新增**：从 `ci-missing-tables.sql` 自动生成 verify |
| `scripts/verify-ci-missing-tables.sh` | **新增**：verify 文件调用与退出码决策 |
| `scripts/verify-seeds.sh` | **新增**：种子数据完整性校验（顺手补） |
| `.github/workflows/ci.yml` | **修改**：4 处建库 step 各加 verify 调用 |

---

## 五、剩余 / 后续

- **`deploy/init-complete.sql` 过时基线**与 ci-missing-tables.sql 需人工同步，仍旧是一项手动流程；本次未触碰（属于「已冻结基线」范畴）
- **CI workflow 中 docker exec 命令的 `--abort-source-on-error`**（mysql 8.0 客户端参数）作为二级防御：**未引入**——方案 A 已足够稳健
- **CI 验证**：本地 E2E 全绿；下一次 push 后 CI 跑通可补一张 run 截图进 docs/
- **整合说明（2026-09-12 rebase）**：本提交与远端 N-04 线（`580f7aa`…`1972fa0`）在 `7620c2c` 分叉，
  两线各自新增了 `scripts/verify-seeds.sh`（add/add 冲突）。**取远端进化版**（临时库实跑 + N-04 断言，
  见 `docs/DEMO_DATA_AUDIT.md`）；本提交的简版（参数式断言）废弃。ci.yml 未调用该脚本，无接口对齐问题。

---

## 六、附：92 项 invariant 类别一览

| 类别 | 数量 | expected |
|---|---|---|
| ADD COLUMN | 82 | 1 (列已存在) |
| CREATE INDEX | 4 | 1 (索引已存在) |
| ADD UNIQUE KEY | 2 | 1 (约束已存在) |
| ADD INDEX | 1 | 1 |
| ADD COLUMN (mod status tinyint) | 1 | 0 (MODIFY 后类型改) |
| ADD COLUMN (mod pool_status tinyint) | 1 | 0 |
| **合计** | **92** | — |

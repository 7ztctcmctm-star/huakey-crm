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

- ~~**`deploy/init-complete.sql` 过时基线**与 ci-missing-tables.sql 需人工同步，仍旧是一项手动流程；本次未触碰（属于「已冻结基线」范畴）~~
  → **✅ 已闭环（2026-09-14）**：`init-complete.sql` 已按「并集终态」反向重建为权威基线，导入后即满足全部 92 项 invariant，
  `ci-missing-tables.sql` 退化为幂等空跑。详见 **§七**。
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

---

## 七、闭环：`init-complete.sql` 权威基线重建（2026-09-14）

### 7.1 背景

N-05 方案 A 只是「让补丁失败可见」，并未消除**补丁本身**。根因是 `deploy/init-complete.sql`
停留在迁移 ~055 的旧快照，与真实结构漂移，只能靠 `ci-missing-tables.sql` 91 段人工追平。
本节把基线本身扶正，使补丁退化为幂等空跑。

### 7.2 关键认知：权威结构 ≠ 迁移链终态（并集定理）

原以为「跑完全部迁移 = 权威结构」，实测证伪。既有**两类缺口**：

| 缺口类型 | 机制 | 实例 |
|---|---|---|
| **IF NOT EXISTS 掩盖** | 旧基线建表语句比迁移链更「瘦」，迁移用 `CREATE TABLE IF NOT EXISTS` ⇒ 表已存在即整段跳过，迁移里的列永远建不上 | 迁移 `039` 定义了 `crm_supplier_contact.create_by/update_time`，但旧基线已建该表 ⇒ 列缺失 |
| **仅存在于补丁** | 结构只写在 `ci-missing-tables.sql`，迁移链从未定义 | `crm_quote` / `crm_contract` 的 `update_time`（`quoteService.convertToContract` 查询依赖） |

⇒ **权威结构 = 旧基线 + 全部迁移 + ci-missing 修正 的并集**。仅跑迁移会缺 7 项（实测 85/92）。

### 7.3 重建方法

新增可复现脚本 `scripts/regen-init-baseline.js`：

```
旧基线 → run_migrations.js（111 个迁移）→ ci-missing-tables.sql
       → mysqldump --no-data（排除迁移内部备份表）→ deploy/init-complete.sql
```

**排除表**（迁移副作用，非应用结构）：`_migration_097_backup`、`crm_contact_primary_backup_113`。
产物：**102 表 + 1 视图**，无 `USE`、无 `DEFINER`、无数据。

### 7.4 verify 生成器修正（索引存在性语义）

`scripts/build-n05-verify.py` 对索引类探测原用 `COUNT(*)`——数的是**索引列数**。
迁移 `071` 建的是复合索引 `idx_contact_primary(customer_id, is_primary)`（迁移 `113` 证实
全仓 20 处查询写作 `pc.customer_id = c.id AND pc.is_primary = 1`，复合索引正是其目标形状），
`COUNT(*)` 得 2 而被误判 FAIL。

修正：索引类（`STATISTICS` 视图）改用 `COUNT(DISTINCT INDEX_NAME)`（∈{0,1}），
与 `ci-missing-tables.sql` 自身守卫 `IF(@c = 0, 建, 跳过)` 的**存在性语义**一致。
重新生成后 92 项不变（`探测段: 92`）。

### 7.5 验证结果

| 路径 | 库结构 | N-05 verify | 说明 |
|---|---|---|---|
| **仅导入新基线** | 102 表 | **92/92 PASS** | 核心目标：不再需要补丁 |
| 新基线 + ci-missing | 102 表 | **92/92 PASS** | CI 兼容：补丁幂等空跑 |
| 新基线 + 全部迁移 | 104 表 | **92/92 PASS** | 生产路径：迁移被守卫识别为已建 |
| 新基线库 vs 并集终态 | — | **结构差异 0** | `information_schema` 逐列/逐索引比对（排除 2 张备份表） |

**回归**：后端单元 `113 套件 / 1079 用例` 全绿；集成 `tests/e2e/ 10 套件 / 69 用例` 全绿
（均指向由新基线自举的库）。

### 7.6 本次改动清单

| 文件 | 改动 |
|---|---|
| `deploy/init-complete.sql` | **重建**：91 表 → 102 表 / 1 视图（并集终态，含 39 处结构纠正） |
| `scripts/regen-init-baseline.js` | **新增**：可复现的重建脚本（支持 `IGNORE_TABLES`） |
| `scripts/build-n05-verify.py` | **修改**：索引类探测改 `COUNT(DISTINCT INDEX_NAME)` |
| `deploy/ci-missing-tables-verify.sql` | **重生成**：92 项（8 处索引项改存在性语义） |
| `docs/n05-ci-missing-tables-verify-fix.md` | **修改**：本 §七 |

> ~~**保留项**：`ci-missing-tables.sql` 及其在 `ci.yml` 的调用**暂未移除**（现已空跑）。~~
> → **已于 2026-09-14 下线**（见 §八）。当时保留的原因：真实 CI 尚未以新基线跑通。
> 该前提随后由 CI run **#127**（main `661a29d`）满足——9 job 全绿，含 `migration-test` / `integration-test` / `e2e-test`。

---

## 八、下线 `ci-missing-tables.sql`（2026-09-14）

### 8.1 依据

Run **#127** 全绿证明：新基线导入后，`ci-missing-tables.sql` 的 91/92 段守卫**全部命中「已存在」分支**，
即整份文件退化为**幂等空跑**。其对 schema 的唯一价值（补齐旧基线缺的结构）已被基线自身吸收。

### 8.2 改动

| 文件 | 改动 |
|---|---|
| `deploy/ci-missing-tables.sql` | **删除**（54 KB 补丁，已无用） |
| `scripts/build-n05-verify.py` | **删除**（生成器的数据源即上表；探测集合转为冻结契约） |
| `.github/workflows/ci.yml` | **4 处**调用块：移除补丁导入 step；`verify` step 保留（改述为「against baseline」），步骤名改为 *Import baseline schema + verify invariants* |
| `deploy/ci-missing-tables-verify.sql` | **头部改写**：由「AUTO-GENERATED」改为**冻结的独立校验契约**；保留 `ci-missing` 前缀属历史命名，仅为稳定 CI 路径 |
| `scripts/verify-ci-missing-tables.sh` | 头部改写（同上；脚本名保留） |
| `scripts/regen-init-baseline.js` | 用法配方去掉 ci-missing 步骤；banner 文案同步 |
| `deploy/init-complete.sql` | banner 文案同步（指向「历史补丁修正」+ 已退役） |
| `backend/tests/db/contactSinglePrimary.test.js` | 环境要求注释订正 |
| `docs/customer-contact-single-primary-plan.md` | 加历史文档告示 |

### 8.3 保留的校验能力（未削弱）

`verify` 仍是 CI 的**建库终态验收**：任何自举路径（仅 `init-complete.sql` / `+ 全部迁移`）
都必须满足 **92/92**。删除的只是「补丁」本身，不是「校验」。
`scripts/build-n05-verify.py` 删除后，如需增删 invariant，**手工编辑** verify SQL 即可
（其头部已注明）。

### 8.4 已知遗留（未纳入本次提交）

`scripts/regen-init-baseline.js` 生成的 `AUTO_INCREMENT` 计数**取决于源库历史**
（本次实测：`sys_permission` 161 → 203，`schema_migrations` 169 → 280）。
纯属无语义差异（表为空，计数只是起始值），但会让「重新生成基线」产生噪声 diff。
如需彻底确定性，可在 dump 后统一剥离 `AUTO_INCREMENT=\d+`（另起一次提交）。

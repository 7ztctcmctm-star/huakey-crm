# N-05 不变式契约变更记录

`deploy/ci-missing-tables-verify.sql` 的头部约定：「如需增删 invariant，请手工编辑本文件，
并同步本文档」。本文件记录每一次契约变更的原因与证据。

---

## 2026-10-21 · 幻影列反向锁定（@col_qt / @col_ct）

### 背景

`crm_quote.update_time` 与 `crm_contract.update_time` 两个 invariant 自 2026-09-14
契约冻结起就是 `expected = 1`（列必须存在）。该断言源自历史兜底基线
`deploy/init-complete.sql`（「旧基线 + 迁移 + 手工补丁」的并集）——而这两列的真实来源是
**已退役的 `ci-missing-tables.sql`**：当年它为迁就 CI 测试，单方面给 CI 库补上了生产
从来没有的列（`scripts/regen-init-baseline.js` 头部注释明确记载此事）。

2026-10-20 B4 改用生产实测快照（`database/baseline/prod-schema-snapshot.sql`）重建
`init-complete.sql` 后，基线与生产逐列一致，两个幻影不变量立即失败，
`integration-test` / `e2e-test` / `migration-test` 三个 CI job 转红。

### 生产实测证据（双重）

1. NAS 上 10-19 部署前的生产全量备份
   `database/backups/predeploy-20261019-135515.sql`（4.0 MB，含真实数据，
   `crm_contract` AUTO_INCREMENT=12）：无 `update_time` 列；
2. 10-20 生产结构快照 `database/baseline/prod-schema-snapshot.sql`：同样无此列；
3. `database/migrations/` 全链（000–123）无任何迁移给这两张表加过 `update_time`；
4. 生产 `crm_contract` 历史数据中 `[取消]` 记录数为 0——依赖该列的取消逻辑
   （`contractService.js` 的 `UPDATE ... update_time = NOW()`，2026-08-08 引入）
   **从未在生产成功执行过**，属潜伏缺陷。

### 变更内容

| 项 | 原值 | 新值 | 理由 |
|---|---|---|---|
| `@col_qt`（crm_quote.update_time） | expected = 1 | expected = 0 | 生产无此列，断言存在=把 CI 补丁态当契约 |
| `@col_ct`（crm_contract.update_time） | expected = 1 | expected = 0 | 同上 |

invariant 总数仍为 **92**（翻转而非删除），CI 各 job 中「92/92」的日志口径不变。

`expected = 0` 同时是**反向锁定**：将来若有人再手工给基线补回幻影列，N-05 会立刻失败。

### 配套代码变更

`backend/services/contractService.js` 取消合同的 SQL 删除 `update_time = NOW()`。
取消的审计痕迹由 `cancel_reason` / `cancel_action` 两列 + `remark` 的 `"[取消]"` 后缀
承载，不依赖 `update_time`。该变更无测试断言依赖（取消流程单测整体 mock service，
Playwright contract-flow 不覆盖取消）。

### 将来若确需该列

必须走正式路径，不得再手工补基线：

1. 新建迁移（条件化 `ADD COLUMN`，`_down.sql` 成对）；
2. 导入快照 → 应用该迁移 → 重新生成 `deploy/init-complete.sql`；
3. 同步把对应 invariant 翻转回 `expected = 1` 并在本文档记录。

---

## 2026-10-22 · C3 软删契约新增（@c124 / @i124，92 → 94）

### 背景

C3 删除逻辑治理新增迁移 124：`crm_customer_score_log.deleted_at` 软删列 +
复合索引 `idx_csl_customer_deleted (customer_id, deleted_at)`。
按契约文件头部原则，新列/新索引必须有不变量锁定，防止「init-complete.sql 被
手工改瘦」导致 CI 库缺列而软删查询报 ERROR 1054（B4 幻影列教训的同向防御）。

### 变更内容

- `deploy/ci-missing-tables-verify.sql`：末尾追加两条探测，tag 按迁移号命名：
  - `@c124`：`crm_customer_score_log.deleted_at` 列存在，expected = 1；
  - `@i124`：`idx_csl_customer_deleted` 索引存在（COUNT DISTINCT INDEX_NAME），expected = 1。
- invariant 总数 92 → **94**；`.github/actions/setup-test-db/action.yml` 三处
  「92」口径同步改为 94（描述行 / 校验回显 / 通过回显）。
- `deploy/init-complete.sql` 的 `crm_customer_score_log` 建表块同步加列与加 KEY
  （CI 建库事实源，不同步即缺列）。

### 与 10-21 幻影列修复的区别

10-21 是「列在生产不存在 → expected 翻 0」的**反向锁定**；
本次是「列确实应该有 → expected = 1」的**正向锁定**，两者共同构成
「契约只认生产实测 + 迁移终态」的完整立场。

---

*2026-09-14 契约冻结时的初始 92 项集合由 `scripts/build-n05-verify.py` 生成，
该生成器与数据源 `deploy/ci-missing-tables.sql` 已随「基线扶正」一并退役；
此后契约只能手工编辑并以本文档留痕。*

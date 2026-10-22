# 删除逻辑治理：占用检查 409 + 审批状态取消 + 评分日志软删（C3，2026-10-22）

> 对应《全面审计与企业级优化方案 2026-10-16》Phase C 步骤 C3。
> 原则：**先扫描、后动手**——计划假设「41 张无 deleted_at 表需补软删」，实测 44 张，
> 逐表评估后真正需要动的只有 1 张表 + 1 处删除路径 + 2 处占用检查。不为凑数乱加列
> （软删列有持续成本：所有读路径都要过滤，漏一处就是数据错误）。

## 一、改动总览

| # | 项 | 文件 | 说明 |
|---|---|---|---|
| 1 | 占用冲突统一 409 | `errors/codes.js` 新增 `RESOURCE_IN_USE`（409001）；`services/deptRouteService.js`、`services/roleRouteService.js`、`routes/role.js` | 原 dept 返回 400、role 经字符串匹配压成 400；语义上「资源被占用」是 409 Conflict |
| 2 | 角色删前补权限配置占用检查 | `services/roleRouteService.js` | 新增 `sys_role_permission.role_id` 计数检查——原只查用户，删已配权限的角色会静默丢掉整套授权矩阵 |
| 3 | 审批撤回改状态取消 | `services/approvalService.js` `withdrawApproval` | `DELETE FROM crm_approval_record ... status="pending"` → `UPDATE ... status="canceled", remark="申请人撤回"`，审计痕迹保留 |
| 4 | 评分日志软删 | 迁移 `124_customer_score_log_soft_delete.sql`(+`_down`)；`services/scoringRouteService.js`、`services/customerDetailService.js` | 重算由「DELETE 清表」改「UPDATE 封版」，历史曲线可追溯 |
| 5 | CI 基线同步 | `deploy/init-complete.sql`、`deploy/ci-missing-tables-verify.sql`、`.github/actions/setup-test-db/action.yml`、`docs/n05-ci-missing-tables-verify-fix.md` | 新列+新索引进 CI 建库事实源；N-05 92→94 项（@c124/@i124） |
| 6 | 前端 canceled 渲染 | `views/approval/submitted.vue` | statusNameMap/statusTypeMap 加 `canceled: '已撤回'/info` + 时间线 RefreshRight 图标；completed.vue 时间线已有 info 兜底无需改 |
| 7 | 守卫效果断言 | `tests/db/migrationGuard.test.js` | 新增「124: deleted_at 与复合索引应存在」（记账齐 ≠ 列真的加了） |

## 二、44 张无 deleted_at 表逐类评估（核心结论）

实测（`deploy/init-complete.sql` 106 张表中 62 张已有 `deleted_at`，44 张没有）。
计划写「41 张」为 10-16 时点数据，此后 B2 新增 `crm_idempotency` 等表。逐类评估：

| 类别 | 表 | 结论 | 理由 |
|---|---|---|---|
| **已有等价软删机制** | `crm_notification` | 不加 | 已有 `is_dismissed` 列，全部查询（notificationService 5 处）均过滤 `is_dismissed = 0`，dismiss 即软删 |
| **无删除路由的系统流水** | `crm_payment_reminder` | 不加 | 全模块无 DELETE，只有 `status='acknowledged'` 确认；系统生成的提醒流水不提供用户删除 |
| **关联/从表（外键语义）** | `crm_customer_tag`、`crm_user_permission`、`sys_role_permission`、`sys_data_permission`、`crm_purchase_plan_item`、`crm_approval_step`、`crm_opportunity_source`、`crm_email_attachment` | 不加 | 关联表物理删是正确的（软删会破坏唯一约束/关联语义）；`crm_approval_step` 随工作流删除清理，工作流本体已软删 |
| **日志/流水（保留期清理）** | `sys_log`（有 `sys_log_archive` 归档表 + cron 定期删）、`crm_webhook_log`、`crm_workflow_log`、`crm_smart_reminder_log`、`crm_opportunity_stage_log`、`crm_stock_movement`、`crm_idempotency`、`sys_email_log`、`sys_cron_log`、`sys_client_perf` | 不加 | 日志治理靠保留期 + 归档；软删会让 `cronService` 的清理失效、表无限增长，与「删数据想历史」初衷相悖 |
| **系统/配置表** | `sys_config`、`sys_permission`、`sys_integration`、`sys_validation_rule`、`sys_customer_status`、`sys_customer_status_transition`、`sys_analysis_config`、`sys_backup_record`、`sys_token_blacklist`、`schema_migrations` | 不加 | 系统元数据，物理删是正确语义 |
| **只读/无删路径业务表** | `crm_scoring_rule`（供应商评分规则，只读）、`crm_employee_profile`、`crm_reconciliation`、`crm_stock_alert`、`crm_commission_record`、`crm_ai_suggestion`、`crm_survey_response`、`crm_email`、`crm_prediction_config`（0 引用，死表） | 不加 | 无用户可见删除路径；未来加删除功能时再评估 |
| **真正需要动** | `crm_customer_score_log` | **加（迁移 124）** | 有确定性的「重算即抹历史」删除路径，评分溯源是真实业务需求 |
| （状态取消替代删列） | `crm_approval_record` | **不加列，改撤回语义** | 无独立删除路由；撤回路径由物理删改状态取消后已满足「保留审计」。若未来出现「删审批记录」管理功能，再按同一模式评估 |

## 三、迁移 124 与三层基线同步

`crm_customer_score_log` 加 `deleted_at datetime DEFAULT NULL` + 复合索引 `idx_csl_customer_deleted (customer_id, deleted_at)`。

按 `docs/migration-baseline-governance.md` 的三层基线纪律同步了全部层：

1. **迁移链**：`124_customer_score_log_soft_delete.sql`（up/down 成对，条件化 DDL 防重放）；
2. **CI 事实源** `deploy/init-complete.sql`：对应建表块加列 + 加 KEY（不同步则 CI 库缺列，软删查询报 ERROR 1054——B4 幻影列教训）；
3. **N-05 契约** `deploy/ci-missing-tables-verify.sql`：追加 `@c124`（列存在，expected=1）、`@i124`（索引存在，expected=1），总数 92→94；`setup-test-db/action.yml` 三处口径同步；`docs/n05-ci-missing-tables-verify-fix.md` 追加 2026-10-22 章节（与 10-21 幻影列「反向锁定 expected=0」形成正/反向完整立场）。

**生产部署注意**：迁移 124 尚未在生产执行（本次只提交代码，deploy.sh 会按编号链自动跑）。生产无 canceled 状态存量、无软删行存量，up/down 均只碰结构不碰数据。

## 四、测试与本地验证证据

新增 4 个单测套件（20 用例）+ 修改 2 个路由测试 + 1 个守卫断言：

| 套件 | 覆盖 |
|---|---|
| `tests/unit/deptRouteServiceDelete.test.js` | 子部门占用→409 不 DELETE；用户占用→409；干净才删；查询短路顺序 |
| `tests/unit/roleRouteServiceDelete.test.js` | 用户占用→409；**权限配置占用→409（C3 新增）**；干净才删+清缓存；短路顺序 |
| `tests/unit/approvalWithdraw.test.js` | 撤回走 UPDATE canceled 绝无 DELETE；approval_status 回落 0；**撤回后重复撤回报「没有待撤回」证明记录保留**；非本人 403；类型/空记录校验 |
| `tests/unit/scoringRouteService.test.js` | 重算软删非 DELETE；带 `deleted_at IS NULL` 条件；无命中只软删不 INSERT；连续两次重算不互相软删；读取过滤；客户不存在 404 |
| `tests/dept.test.js` / `tests/role.test.js` | 3 处 400→409 断言更新；role 补「有权限配置 409」路由级用例 + 正常删除 mock 链补 perms 查询 |
| `tests/db/migrationGuard.test.js` | 「124: deleted_at 与复合索引应存在」效果断言 |

本地验证（全部当场复核）：

- 后端全量 jest：**159 套件 / 1539 用例全绿**（基线 155/1538 → 新增 4 套件）；
- 迁移 124 实测（测试库）：up 成功（列+复合索引落库）→ up 二次幂等 → down 回滚（列与索引均消失）→ down 二次幂等 → 恢复 up 并记账；
- N-05 本地预跑：**94/94 全过**（含 @c124=OK）；
- migrationGuard：23/23 全绿（含 124 新断言）；
- 后端 eslint（`--max-warnings=0`，14 个改动文件）：0 error 0 warning；
- 前端：lint 0/0、vitest 159/159（串跑三次，首次 1 例失败为与全量 jest 并发的资源竞争 flake，复跑两次全绿）、build 成功 + bundle check OK。

## 五、遗留与边界（诚实记录）

1. **AI 查询不过滤软删**：`routes/ai.js` 的 LLM 生成 SQL 白名单（SCOPED_TABLES）不过滤 `deleted_at`——这是既有设计边界（`crm_customer` 等 62 张软删表同样在内），本次未扩大改动面。评分日志被 AI 读到软删历史行的概率与影响均极低，如需收敛应作为独立事项统一治理 AI SQL 层。
2. **`crm_approval_record.status` 列注释**仍是「pending/approved/rejected」（schema COMMENT，varchar(20) 容纳 canceled 无问题）。改注释需单独迁移，本次未做——代码与文档是权威，COMMENT 更新列入后续小迁移候选。
3. **B4 遗留**：`crm_contract` 双外键冗余去重迁移仍未建（`fk_contract_opp` / `fk_contract_opportunity` 同在 opportunity_id），见 `docs/migration-baseline-governance.md` 第六节。

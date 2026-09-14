# HuakeyCRM 未完成工作盘点（2026-09-14）

> 扫描范围：`backend/`（src/services/controllers/routes/middleware/utils/config）、`frontend/src/`、`database/migrations/`、`scripts/`、`deploy/`、`docs/`（105 篇）。
> 方法：① 标记扫描（TODO/FIXME/HACK/XXX/TBD）② 文档「声明未交付」项交叉核对 ③ 代码级证据（SQL 语句、字段、覆盖率统计）复核。
> 排除：`node_modules/`、`.git/`、`dist/`、`coverage/`。

---

## 一、扫描结论摘要

| 维度 | 结果 |
|---|---|
| 真·代码标记（TODO/FIXME/HACK） | **0 处真实待办**。所有命中均为领域词汇（「待办」= CRM 待办任务）或部署占位符（`your-domain.com`、密码占位符），非技术债标记 |
| 空 `catch {}` 吞异常 | **0 处**（前后端均无静默吞异常） |
| 文档声明的遗留项 | 扫描出 6 项，**本次修复 3 项**（P1-1 / P2-1 / P2-2），1 项已由前序提交修复（D1） |
| 前端状态覆盖率 | 98 个视图，31 个用 `StateWrapper`/`TableSkeleton`；69 个含 `el-table` 的页面中 **38 个无骨架屏** |
| 后端测试 | 80 个测试文件（覆盖充分） |
| 需求池（显式延后） | 商机中心 5 项 Could-Have + 15 项 Won't-Have（已决策，非遗漏） |

**总体判断**：项目处于「v1 已冻结、技术债清零度较高」状态。**无隐藏的未完成功能**；遗留项集中在 **① 生产部署前的迁移（P0）**、**② 通知一致性（本次已修）**、**③ 代码重复抽象（本次已修）**。

---

## 二、按优先级排序的待办清单

### 🔴 P0-1 · 生产库未应用迁移 112/113

| 项 | 内容 |
|---|---|
| **位置** | `docs/crm-customer-overview-design.md` §8.4 L3；`database/migrations/112_create_customer_transfer.sql`、`113_single_primary_contact.sql` |
| **需要做什么** | 生产库（NAS `huakey_crm`）补跑迁移 112 与 113 |
| **为什么** | 文档 §8.4 L3 已直连生产库确认：`crm_customer_transfer` 表**不存在**；未经迁移即部署，转移功能会报错 |
| **验证** | 生产 `information_schema` 中两表存在；`schema_migrations` 版本含 112/113 |
| **注** | **本地库已确认正常**（`schema_migrations` 到 113）。风险仅在生产部署路径，属发版前 checklist 项，非代码缺陷 |

---

### 🟠 P1-1 · 客户转移处理完后，系统通知未自动消除（角标常亮）✅ 本次已修复

| 项 | 内容 |
|---|---|
| **位置** | `backend/services/notificationService.js`、`backend/services/transferService.js` |
| **根因** | `createNotification` **丢弃** `business_type`/`business_id`（INSERT 仅 5 列，调用方传入也不生效）；`transferService` 4 条路径均未传业务字段、也未做消除 |
| **已实施** | ① `createNotification` 扩展为持久化 `business_type`/`business_id`，`link_url` 缺省时由 `buildLink` 派生；② 新增 `dismissByBusiness(pool, businessType, businessId)`；③ `transferService` 的 create/accept/reject/expire 四条路径补齐业务字段，并在处理时消除接收人侧「待处理」通知；④ 新增 8 条单测 |
| **验证** | `tests/transferService.test.js` 20/20、`tests/unit/services-notificationService.test.js` 13/13 全绿 |

---

### 🟡 P2-1 · 「按业务消除通知」SQL 惯用法重复 3 次 ✅ 本次已修复

| 项 | 内容 |
|---|---|
| **位置** | `approvalService.js:369`、`quoteService.js:356`、`reminderService.js:353`（同一句 SQL 逐字重复） |
| **已实施** | 三处统一改为调用 `notificationService.dismissByBusiness()`；`reminderService` 的 `dismissNotificationByBusiness` 保留为薄包装（对外接口不变） |
| **验证** | `approval.test.js` / `quote.test.js` / `quoteService.test.js` / `reminder.test.js` 全绿 |

---

### 🟡 P2-2 · D2 转移候选人含「死按钮」（约 36%）✅ 本次已修复

| 项 | 内容 |
|---|---|
| **位置** | `backend/services/transferService.js:listTransferCandidates` |
| **根因** | 候选人查询仅按 `deleted_at IS NULL AND status=1` 过滤，**不校验 `customer:transfer` 权限**；而 `POST /pool/transfer/accept` 要求该权限（`routes/pool.js:107`）→ 无权候选人点「同意」必然 403 |
| **已实施** | 查询改为 `JOIN sys_role_permission + sys_permission` 并加 `p.code = 'customer:transfer'`，保证「候选人 ⊆ 可接受人」；新增 2 条回归用例 |
| **真库实测** | 候选人由 **25 → 16**，剔除 9 个死按钮 |
| **判据说明** | 原文档顾虑「涉及产品口径」；实际 `accept` 端点已强制该权限，故这是**正确性一致性**要求，非产品决策 |

---

### 🟡 P2-3 · 39 个含 el-table 的页面缺骨架屏/三态管理 —— ✅ 可接入部分已修复（18/18）

| 项 | 内容 |
|---|---|
| **位置** | `frontend/src/views/**` —— 69 个含 `el-table` 的页面中，39 个无 `TableSkeleton`/`StateWrapper`（详见附录 A） |
| **本次已实施** | 按既有「统一改法」（StateWrapper 四态 + TableSkeleton + errorMsg 三分支），接入 **18 个可接入页**（全部单主表格列表页），使接入数 **31 → 49** |
| **按既有约定跳过 21 个** | 详情页内嵌多表格（`customer/Detail` 8 表、`*Detail.vue`、`*/detail.vue`）、编辑页（`quotation/edit`）、多表格各自独立取数的看板（`TeamDashboard` 5 表、`analysis/index`、`report/index`、`report/business`、`hr/commission`）、`payment/reconciliation`（推广计划已约定跳过）、`followup/calendar`（日历非主内容） |
| **为什么** | 路线图原文标注：骨架屏覆盖率 **「未达『全部列表页』」且与实测不符（2026-09-11 更正）** |
| **验证** | `StateWrapper` 覆盖 31 → **49** 个视图；18 页守卫测试 + 全量 15 文件 / 64 用例 + 构建全绿；逐文件复核列数/表格数/分页数/`v-permission`/对话框数**全部不变** |
| **顺带修复** | `analysis/prediction.vue` 使用 `chartColors` 但**从未导入** → 图表渲染必抛 `ReferenceError`（与此前 `inventory`/`competitor` 同类缺陷），已补 import |
| **剩余未覆盖** | 21 个跳过页 + 详情页内嵌表格，均为按约定不适用，非遗漏 |

---

### 🟢 P3-1 · `init-complete.sql` 的 `AUTO_INCREMENT=N` 计数器不确定

| 项 | 内容 |
|---|---|
| **位置** | `deploy/init-complete.sql`、`scripts/regen-init-baseline.js` |
| **需要做什么** | 在 regen 脚本中剥离 `AUTO_INCREMENT=N`，或统一写死为 `AUTO_INCREMENT=1` |
| **为什么** | 2026-09-14 重建基线时发现：从不同源库导出会带出不同的计数器（`sys_permission` 161↔203），导致 `mysqldump` 产物**非确定性**，每次 regen 都产生无意义 diff |
| **验证** | 连续两次 regen 产物 `diff` 为空 |
| **注** | 纯工程整洁性，无功能影响。已在 `docs/n05-ci-missing-tables-verify-fix.md` §8.4 登记 |

---

### 🟢 P3-2 · 前端无 TypeScript / 关键 API 无 JSDoc 类型

| 项 | 内容 |
|---|---|
| **位置** | `frontend/src/api/*.js`、`frontend/src/composables/*.js` |
| **需要做什么** | 短期不上 TS（决策已定），但按路线图 §Q-3：① 关键 API 响应加 JSDoc ② 核心 composables 加 JSDoc |
| **为什么** | 纯 JS 无类型约束，API 响应结构靠约定维系；加 JSDoc 可获 IDE 提示，且为未来迁移 TS 留路径 |
| **验证** | 核心 `api/customer.js` 等具备 `@returns {Promise<{...}>}` 注释 |

---

## 三、已确认「无需处理」的项（避免重复排查）

| 曾疑虑项 | 结论 | 证据 |
|---|---|---|
| **D1 部署静默删除 `customer:transfer`** | **✅ 已修复（`a324ef3`）** | `init_role_permissions.js` 的 `ROLE_PERMISSIONS` 白名单已为 boss/manager/sales 补上该码（L162/184/202）；文档 §8.5 原记录早于修复。**残留隐患**：白名单仍是硬编码，将来新增权限码若漏登记，仍会被 §6 的 DELETE 清掉 —— 建议后续改为从 `sys_permission` 动态读取（未做，属 P3） |
| `test_data_modules.sql` 用旧数字 schema | ✅ 已闭环 | 文件内 2026-09-12 修订注释；`dept_id` 改为按名解析；`business_status` 用字符串枚举 |
| `navigation.spec.js` 选择器过时（`.el-empty`） | ✅ 已闭环 | 已改 `const LIST_LOADED = '.el-table, .empty-state'`，附 2026-09-12 修订说明 |
| `ci-missing-tables.sql` 冗余 | ✅ 已下线 | 提交 `24a6756` |
| 空 catch 吞异常 | 无需处理 | 全仓前后端扫描 0 命中 |
| `routes/customer/module.js` 缺 `customer:transfer`（文档 D1 残留警告） | 无需处理 | 该文件已随阶段 4 整树下线（`module.js` 不存在），警告已失效 |
| `useAssign.js` 死代码 | 已知，v2 清理 | 全仓零引用，与 `api/customer.js` 3 函数重复 |
| 商机中心 8 阶段模型 / 附件表 / 分析页等 | 已决策延后 | `opportunity-center-v1-mvp-scope.md` §3 Could-Have + §4 Won't-Have |
| 前端 `el-table` 页面里 `/customer/list` 等 | 非缺陷 | 是 Vue Router 前端路由，与 HTTP 端点无关 |

---

## 附录 A · 缺骨架屏页面清单（P2-3 工作清单 —— ✅ 已收口）

初筛 39 个含 `el-table` 的页面（原列 38 个，补 `analysis/prediction.vue`）。经逐个判定，拆为**接入 18 / 按约定跳过 21**。

### A.1 ✅ 已接入 StateWrapper + TableSkeleton（18 个，提交 `P2-3`）

```
analysis/prediction.vue          approval/workflow.vue
automation/assign-rules.vue      customer/AssignRules.vue
email/settings.vue               follow-up/TodayTasks.vue
follow-up/TomorrowTasks.vue      followup/template.vue
report/custom.vue                report/finance.vue
scoring/rules.vue                settings/integration.vue
social/index.vue                 supplier/ranking.vue
system/backup.vue                system/currency.vue
system/permission.vue            target/index.vue
```

> `analysis/prediction.vue` 顺带修复一处**既有缺陷**：使用了 `chartColors` 却未从 `@/utils/chartTheme` 导入（同 `inventory`/`competitor` 的历史缺陷类型），原会导致图表渲染时抛 `ReferenceError`。

### A.2 ⏭ 按约定跳过（21 个，不做）

依据 `docs/frontend-statewrapper-promotion-plan.md` §已知限制：

| 类别 | 页面 | 跳过原因 |
|---|---|---|
| 详情页内嵌多表格 | `customer/Detail.vue`、`contract/detail.vue`、`competitor/detail.vue`、`opportunity/Detail.vue`、`procurement/planDetail.vue`、`purchase/detail.vue`、`purchase/ComparisonDetail.vue`、`supplier/detail.vue`、`survey/detail.vue` | 子表格各自独立取数，需按子表粒度分别接线，本轮不做 |
| 编辑页 | `quotation/edit.vue` | 编辑场景，非列表加载态 |
| 多表格看板 | `TeamDashboard.vue`、`analysis/index.vue`、`report/index.vue`、`report/business.vue`、`hr/commission.vue` | 一页多表、各自独立取数，需按表分别接入 |
| 日历/流程型 | `followup/calendar.vue`、`automation/workflows.vue`、`automation/smart-reminders.vue`、`procurement/plan.vue` | 主体非 `el-table` 列表，骨架屏收益低 |
| 配置页 | `settings/api-platform.vue` | 文档示例型页面 |

> 以上 21 个并非「遗漏」，而是明确判定本轮不适用。若后续要做，建议按「子表粒度」逐页设计，而非机械套用统一改法。

---

*盘点方法可复现：标记扫描 → 文档交叉核对 → 代码级证据复核（SQL 语句/字段/覆盖率）。所有「已闭环」结论均附代码或文档位置。*

# HuakeyCRM 功能逻辑文档（v1 生产准备版）

> 编制日期：2026-09-18
> 编制依据：实际代码探查（backend/routes、backend/services、frontend/src/views，以及 middleware/permission.js、utils/money.js 等）。
> 说明：本文档描述"代码实际怎么跑"，不是规划文档。所有模块逻辑均已对照源码核对；标注【待补】的为代码中存在 stub/占位/未接线的部分。

---

## 0. 总体架构与横切机制

### 0.1 技术栈与路由挂载
- 前端：Vue 3 + Vite + Element Plus + Pinia + ECharts + Axios；唯一主题源 `frontend/src/styles/apple.css`，图表配色统一走 `frontend/src/utils/chartTheme.js`。
- 后端：Node.js + Express + mysql2（含只读连接池 `readOnlyPool`）+ JWT（httpOnly Cookie + CSRF Cookie）+ Joi + bcryptjs + multer + node-cache/Redis。
- 数据库：MySQL 8.0，InnoDB，utf8mb4。
- **全部路由统一挂载在 `/api/v1` 下**（`backend/app.js` 中 `app.use('/api/v1', apiRouter)`）。文档中端点均省略此前缀。

### 0.2 权限模型（三层强制）
1. **认证**：`authenticateToken` 校验 JWT；`/auth/me` 实时查库合并权限（不缓存）。
2. **功能权限（RBAC）**：`checkPermission(业务码)` 校验 `sys_role_permission ∪ crm_user_permission`（角色直授 ∪ 用户直授），结果缓存 5 分钟（node-cache + Redis 两级）。
3. **数据范围（Data Scope）**：`middleware/permission.js` 的 `checkDataPermission` 统一判定，范围枚举：
   - `all` → `1=1`
   - `dept` → `owner_id IN (同部门用户) OR owner_id IS NULL`
   - `dept_and_sub` → `owner_id IN (本部门 + 递归子部门用户)`
   - `self` → `owner_id = ?`（仅 customer 模块额外放开 `owner_id IS NULL AND status IN ('lead','sea')` 兜底公海/线索）
   - `custom` → `owner_id IN (指定部门用户) OR owner_id IS NULL`
   - 无配置默认 `self`；管理员 / `manageAll` 直接 `all`。
4. **字段级权限**：`checkFieldPermission(模块)`（如报价/合同/采购单价仅管理员可见）、`stripRestrictedFields` 出参脱敏。
5. **前端筛选越权防护**：`buildOwnerOverrideFilter` 对"按成员筛选"做服务端强制授权，self/无配置时静默忽略筛选，防销售越权看他人数据。

> ⚠️ 铁律：禁止硬编码 `roleId`，一律用 `roleCode`（BOSS/MANAGER/SALES/...）。审批步骤的 `role` 类型审批人已通过 `resolveRoleApproverId`（按 `sys_role.id` 解析在职用户）落地，不再把角色 id 当 userId 写库。

### 0.3 客户域边界收敛（R-06）
非 Customer 域模块（user/transfer/automation/scoring/import/followup/approval 的关联读）写 `crm_customer` 必须统一经 `customerService` 受控入口（`systemAssignOwner` / `systemUpdateField` / `systemUpdateScore` / `systemAcceptTransfer` / `systemApplyFollowUpEffect` / `systemTouchLastFollowTime` / `systemSetLastFollowTime` / `systemReleaseOwnedCustomersOnLeave`）。越界写已在存量治理中清零，并设为零容忍门禁。

### 0.4 金额计算
权威工具 `backend/utils/money.js`（BigInt 消除浮点误差，仅最后一次 half-up 舍入）。**已采用：`quoteService`（完整）、`purchaseService`（采购单价/折扣/税额/总额，2026-09-18 补齐采购单汇总）、`approvalService`（折扣率判定）、`paymentService`（回款计划已回金额，2026-09-18）**。其余如报表/财务分析中的 `parseFloat` 多为**读取 SQL 聚合结果仅作展示或比较**（不写回 DECIMAL 列），无写入误差风险；若后续要在其中做金额计算并入库，须改走 `money.js`。

### 0.5 软删除与状态约定
- 客户/线索/标签/知识库/产品/供应商/竞品/日志等用 `deleted_at IS NULL` 逻辑删除。
- 合同/采购单等用 `status` 终态（如"已取消"）而非物理删。
- 并发写入用"原子 UPDATE + `affectedRows` 校验"，避免 REPEATABLE READ 下并发覆盖（公海认领、转移同意等）。

---

## 1. 认证与权限域

| 模块 | 路由 | 核心逻辑 | 前端 |
|---|---|---|---|
| 认证 | `auth.js` | 登录（验证码 + bcrypt + JWT）、登出（token 入黑名单 `sys_token_blacklist`）、`/me` 实时合并权限、改密（强制首登改密正则 `(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$`） | login / change-password / profile |
| 权限 | `permission.js` | 权限树、角色-权限绑定（事务替换 `sys_role_permission` 并清缓存）、数据范围配置 | system/permission |
| 角色 | `role.js` | 角色 CRUD；删除前校验无关联用户 | system/role |
| 用户 | `user.js` | 用户 CRUD；删除为事务级联：软删用户 → 置 `leave_date` → **名下客户释放公海**（经客户域受控入口）→ 商机转直属上级 → 跟进保留 | system/user |
| 部门 | `dept.js` | 部门树 CRUD（平铺返回，前端建树）；删除前置检查有子部门/用户则拒绝 | system/dept |

**已知坑**
- 登出数据库失败被静默忽略（用户端永远登出成功）。
- Swagger 注释写 `/api/auth/...`，实际 `/api/v1/auth/...`，文档前缀不一致。
- 角色删除不清理 `sys_role_permission` 残留行（依赖业务层，理论孤儿风险）。

---

## 2. 客户域（CRM 主链路：线索 → 客户 → 公海 → 跟进 → 商机 → 报价 → 合同 → 回款）

### 2.1 客户（customers / leads / pool / recycle / tag / scoring / automation）

**客户中心三页面**：线索池（lead）/ 正式客户 / 公海（sea）。handler 经 `customerController` → `customerService` / `customerDetailService` / `assignService`。

核心流程：
- **创建**（`customerDetailService.addCustomer`）：校验≥1 有效联系人 → 公司名查重 → `autoAssignOwner` 自动分配（命中规则则 `status=following` 并指派 owner，否则 `status=lead` 入线索池）→ 事务插 `crm_customer` + `crm_contact`（首条 `is_primary=1`）+ 写分配日志。
- **自动分配**（`assignService.autoAssignOwner`）：按启用规则优先级匹配 `round_robin` / `by_source` / `by_region`，轮询取下一用户；现仅面向 `sales` 角色。
- **状态机**：主漏斗 `CUSTOMER_STATUS_PIPELINE`；`forward/backward` 取下一/上一态，也可经 `sys_customer_status_transition` 表任意合法流转（`require_reason` 规则强制填原因）。`status` 变化同步 `business_status`。
- **线索转正式**（`convertLeadToCustomer`）：本人转化→归操作人、`pool_status=private`；代转化（管理员）→ `owner_id=NULL`、`pool_status=sea` 进公海待分配；仅真正归属变更才写 `crm_assign_log`（修复"日志说分了数据没分"缺陷）。
- **公海认领**（`claimPoolCustomer`）：必须 `pool_status='sea'` 且非 lead；原子 UPDATE 带 `owner_id IS NULL AND pool_status='sea'`，`affectedRows!=1` 视为被他人抢先；同步状态 + 写 `crm_pool_log`。
- **释放到公海**（`releaseCustomerToPool`）：拒绝 lead（提示用"放弃"）；置 `sea` + 清空 owner + 写日志。
- **自动回收**（`poolService.autoReleaseCustomers`）：超过期天数未跟进的 `private+following` 客户批量释放，写 `auto_release` 日志 + SSE 通知原负责人。**保护期已下线**（2026-09-10 产品决策），释放后可立即认领。
- **转移**（`transferService`）：状态机 `pending→accepted/rejected/expired`，无 cancelled；发起须本人客户、不能转给自己；同意时经 `systemAcceptTransfer`（owner_id 作并发守卫）；超 3 天定时任务置 `expired`，客户仍归原主。
- **评分**（`scoringRouteService.calculateScore`）：取客户统计 → 遍历启用规则按 `eq/gt/lt/contains` 匹配 → 累加 → 经 `systemUpdateScore` 写分 + 写日志。
- **自动化**（`automationService`）：工作流（触发-条件-动作）、分配规则、智能提醒三类。动作 `assign/notify/tag/update_field/create_followup` 统一经客户域受控入口；`update_field` 白名单含 `'assignee'`（但 `crm_customer` 无此列，命中会 SQL 报错，属刻意不改的历史笔误）。
- **回收站**（`recycle.js`）：对 8 张表软删恢复/彻底删除；后端齐全，**前端无对应视图【待补】**。

**已知坑**
- 自动分配 `by_region` 用 `address.includes(region_value)` 模糊包含，可能误匹配。
- 离职释放（`systemReleaseOwnedCustomersOnLeave`）与公海自动回收 SQL 不一致：前者不写 `crm_pool_log`、不同步 `status`（已知差异）。
- 转移候选人必须自身持 `customer:transfer` 权限，否则接收人点"同意"必 403。
- 智能提醒 `notify_to==='boss'` 硬编码 `user_id=1`（超级管理员 id 写死）。
- 导入/创建后 `clearByPrefix('cache:')` 全量清缓存，粒度粗。

### 2.2 跟进与触达（followUp / reminder / notification）

- **跟进记录**（`followUpService.addFollowUp`）：写 `crm_follow_up` → 绑附件 → 经 `systemApplyFollowUpEffect` 更新客户派生状态 → **自动解除该客户所有未读逾期提醒** → 若客户为 `lead/sea/new` 则自动推进到 `following`。
- **跟进计划**：与跟进记录同表 `crm_follow_up`，靠 `is_plan=1` 区分；完成计划转真实跟进并刷新 `last_follow_time`、解除提醒。
- **逾期提醒**：阈值来自 `sys_config.overdue_days`，默认 **15 天**（临近预警起点 = `overdueDays-3`）。提醒数据由 `cronService.notifyPreReleaseCustomers` + `scripts/generate_reminders.js` 生成 `crm_follow_up_reminder`，接口只负责读取/标记。
- **提醒中心**（`reminderService.getMyReminders`）：聚合逾期/今日/临近跟进 + 通知 + 待处理转移 + 超时工单。
- **通知中心**（`notification.js`）：`crm_notification`（role/user 维度）列表/已读/未读计数。

**已知坑**
- 后端跟进接口挂 `/follow-up`，前端经 `@/api/customer` 调用（api 模块名与路由前缀错位）。
- `getPaymentOverdue` 归属用 `create_by`（合同创建人）而非客户 owner，可能漏显/错显。
- 回款后提醒不自动消除，依赖手动 acknowledge/dismiss（潜在滞留）。
- 两个同名函数 `getOverdueList`（`followUpService` 按 next_time 找逾期跟进；`reminderService` 按 last_follow_time 找逾期客户）语义不同。

---

## 3. 商机 → 报价 → 合同 → 回款

### 3.1 商机（opportunity）
- 阶段机：1 询盘 / 2 需求确认 / 3 方案报价 / 4 谈判 / 5 成交 / 6 失败。终态 5/6 不可推进。
- 推进时按 `DEFAULT_STAGE_PROBABILITY` 自动覆盖 `win_rate`（除非显式 null），写 `crm_opportunity_stage_log`；回退按 `BACKWARD_RULES` 白名单矩阵。
- 编号 `OPP-YYMMDD-NNN`（`FOR UPDATE` + COUNT 防并发，无唯一约束兜底）。
- 联动：报价转合同推进到 stage 3；合同转成交推进到 stage 5（try/catch 不阻塞主流程）。

**已知坑**
- 阶段回退矩阵为硬编码白名单，新增阶段需同步改 `BACKWARD_RULES` 与 `STAGE_MAP`。
- `createContractFromOpportunity` 推进到 stage 5，但若合同审批被拒，商机已被推到成交→状态不一致且无回滚。

### 3.2 报价（quote / quotation）
- 创建（`quoteService.createQuote`）：事务校验客户/商机同客户 → 校验产品（status=1）→ **金额全部走 `money.mul/add/applyDiscount`** → 写 `crm_quote` + `crm_quote_item` → 发审批通知（去重）。状态：1 草稿 / 2 已发送 / 3 已确认 / 4 已失效。
- 报价转合同（`convertInContract`）：事务内 `FOR UPDATE` 锁报价；幂等校验靠"是否已存在引用该报价的合同"（`crm_contract.quote_id`，**不靠 status===3**）；复制明细；推进商机到 stage 5。
- 审批（`approveQuote`）：更新 `approval_status/approver_id` → 清待审批通知 → `if (approvalStatus === 1)` 推进商机到 stage 3。

**已知坑（BUG，已修复 2026-09-18）**
- 原缺陷：路由 `/quote/approve` 的 `approval_status` 仅接受 `2`(通过)/`3`(驳回)，但服务里判断 `=== 1` 才推进商机 → "通过(2)"时永不推进商机到 stage 3。已将服务条件改为 `=== 2`（`quoteService.js:359`），通过时正确推进商机到 stage 3。

### 3.3 合同（contract 系列 + contractTemplate）
- 合同状态机：1 待执行 / 2 执行中 / 3 已完成(终态) / 4 已取消(终态)。
- 创建（`createContract`）：要求客户 `status='signed'` → 校验商机同客户 → 编号 `CON-YYMMDD-NNN` → 写合同 + 批量写 `crm_payment_plan`。**直接建合同不推进关联商机阶段**。
- 取消（`cancelContract`）：据 `cancel_action` 联动商机（`customer_cancelled→stage6` / `reopen_negotiation→stage4` / `keep_won→不推进`）。
- 审批（`simpleApproveContract`）：**只更新 `approval_status`（1待/2通过/3拒绝），不改合同 `status`，不联动商机**；清通知。
- 回款（`paymentService.recordPayment`）：事务插 `crm_payment` → 置 `status=2`(待执行→执行中) → 刷新回款计划状态。`recalculatePlanStatus`：`paid>=plan→completed`，`>0→partial`，部分回款且超期显示 `partial`（但 `overdue_days` 仍算）。
- 模板（`contractTemplateService`）：纯 CRUD（`crm_contract_template`），**模板数据不注入新建合同**，仅作参考。

**已知坑**
- ~~**合同编号双前缀/双日期格式**~~（✅ 已修 2026-09-18）：原直接建 `CON-YYMMDD-NNN`、报价转合同 `HT-YYYYMMDD-NNN`，前缀与日期格式都不同 → 数据不一致。已统一为 `CON-YYMMDD-NNN`（`quoteService.convertToContract` 对齐 `contractService.createContract`）。
- 状态机与审批解耦（已修复 2026-09-18）：原审批通过不会自动让合同进入"执行中"、易卡在待执行（#3）；现 `simpleApproveContract` 与通用工作流审批末步（`approveRecord`/`batchApprove`，仅 `business_type=contract`）均会在审批通过时把 `status` 由 1 流转到 2。
- ~~合同 `amount` 直接存储、`paid_amount` 用 `parseFloat` 累加，未走 `money.js`。~~（✅ 部分已修 2026-09-18）：回款计划 `paid_amount` 落库已改走 `money.js`（`round2` 归一化，避免浮点尾数写入）；合同 `amount` 仍为前端直传（无后端计算，无误差引入）。

### 3.4 财务与收款（finance-enhanced / invoice）
- 回款提醒（`financeService.generateReminders`）：未来 7 天未完成 → `upcoming`；已逾期 → `overdue`；`INSERT IGNORE` 去重键为 contract_id+plan_id+type+date（仅防同日重复，跨天再生成）。
- 对账：`getCustomerReconciliation`（客户+区间汇总合同额/回款额）；`getSupplierReconciliation` 的 `paid_amount` **恒为 0**（供应商付款录入未实现【待补】）。
- 财务分析（`getAnalysis`）：收入=区间合同额、成本=区间采购额、毛利=差；账龄按 `sign_date` 算 `age_days`（非回款计划 `plan_date`，与回款逾期口径不一致）。
- 发票（`invoiceService`）：CRUD + 导出；编号 `INV-YYMMDD-NNN`；**`tax_amount` 由前端直接传，服务端不自动算**；状态 1 待开票 / 2 已开票 / 3 已邮寄 / 4 已作废。

**已知坑**
- 前端 api 模块命名错位：财务接口后端 `/finance`，前端放 `@/api/hr`；回款后端 `/contract/payment`，前端放 `@/api/contract`。
- 发票与合同/回款无强关联，`contract_id` 仅普通字段；金额/税额未用 `money.js`。

---

## 4. 审批工作流（approval）

- 为报价/合同/采购/折扣四类业务提供「可配置工作流 + 阈值审批人矩阵 + 提交/通过/驳回/撤回/转交/批量」闭环。
- `submitApproval`：折扣率 >10% 时把类型改写为 `discount`；优先按金额匹配阈值规则决定首审批人，回退工作流默认步骤；role 步骤经 `resolveRoleApproverId` 解析（已修硬编码角色号）。
- `approveRecord`：`SELECT ... FOR UPDATE` 锁行防竞态；通过后查下一步，无下一步则业务表 `approval_status=2`；`rejectRecord` → `approval_status=3`；`withdrawApproval` 仅创建人可撤回。
- 关联客户详情只读 `crm_customer`，绝不 UPDATE（R-11 约束）。表名走 `validateTable` 白名单防注入。

**已知坑**
- 前端 `workflow.vue` 下拉框重复两个「折扣审批」`value="discount"` 选项（复制粘贴残留）。
- 折扣改写仅覆盖 quote/contract，`purchase` 不参与折扣判定（需确认是否有意）。

---

## 5. 协同与赋能

### 5.1 AI 助手（ai）
- 对话问答（多轮，60s 超时，限 200 字）；Text-to-SQL（`/query`）：LLM 生成 SQL（temp 0.1）→ 清洗 → 非 SELECT 拒绝 → 危险关键字 + 系统表黑名单 → **维度白名单**（仅 `crm_opportunity/crm_customer/crm_contract`）→ **数据范围隔离**（非全局账号触及 27 张敏感表一律拒绝，宁拒不乱）→ 只读连接池执行 → 缺 LIMIT 补 50。
- `generateSuggestions`：三类规则——跟进超 30 天客户、停滞>14 天商机、预期金额≥10万且赢率<30% 商机；24h 同 ref 去重。

**已知坑**
- 维度白名单 `extractTables` 用正则取首张表，逗号连接多表时可能漏判（靠"换问法"兜底）。
- 图表建议整数 GROUP BY 维度缺口（已用正则补回，但仍脆弱）。
- 未配置 `DB_RO_*` 时仅 warn 仍用主库（只读账号缺失风险）。

### 5.2 知识库 / 销售资料（knowledge）
- 四类资产：产品、话术、FAQ、文档（文档支持 multipart 上传，multer 落盘 + 扩展名/MIME 白名单 + 防目录穿越）。
- 列表支持关键词/分类/分页，全部软删除；详情带阅读计数自增（无去重）。
- `getStats`：四类计数 + 各 5 条最近更新。

**已知坑**
- 产品更新（`PUT /products/:id`）未失效缓存（scripts/faqs 的 PUT 已失效）→ 最长 300s 读到旧数据。
- 文档删除物理删文件 + 软删记录，与其他三类软删不一致。

### 5.3 服务工单（service）
- 状态机：1 待分配 / 2 已分配 / 3 处理中 / 4 待确认 / 5 已完成。
- 建单要求客户 `status='signed'`；工单号 `SRV-YYMMDD-序号`（`FOR UPDATE` 防重复）。
- 分配/开始/完成/确认均校验 `canManageService`（创建人、被指派人、BOSS/MANAGER、同部门销售；**用 roleCode 判权，禁止硬编码 roleId**）。
- 列表内置超时计算：紧急 2h / 高 4h / 中 8h / 低 24h。

**已知坑**
- 批量分配通知 `business_id` 仅取首单 id（`ids[0]`），详情跳转可能不准。

### 5.4 报表与仪表盘（report / dashboard / analysis / teamDashboard / target / metrics）
- 首页仪表盘（`dashboardService`）：顶栏时间范围（默认本月）+ 团队筛选，统计销售额/新增客户/合同数/回款/进行中商机；各表归属列不同（customer→owner_id、contract→create_by、opportunity→owner_id），经 `buildOwnerOverrideFilter` 服务端强制团队筛选。已改为统一 `checkDataPermission`，boss/super_admin(view_all=1)→all。
- 数据报表（`reportAnalyticsService`）：销售漏斗/业绩/客户/回款/趋势/采购；漏斗回传数值 `stage_code`（已修）。**数据范围已全量收口（2026-09-20）**：14 个端点挂 `checkDataPermission('report')`，服务内按各表归属列套 `buildDataPermissionWhere`（customer→`owner_id`、contract→`create_by`、payment→经合同 `create_by`、opportunity→`owner_id`、purchase_order→`owner_id`、成员排名→`sys_user.id`）。语义：boss/finance(`all`)→全量；manager(`dept_and_sub`)→本部门及下级；sales(`self`)→仅本人。
- 团队看板（`teamDashboardService`）：boss 看全量否则看自己；销售拆解/催办/停滞商机(>14天)。
- 销售目标（`targetService`）：左连接目标/实际算达成率；`ON DUPLICATE KEY UPDATE` 幂等。
- 自定义报表（`customReportService`）：5 个数据源白名单，运行前字段白名单校验防注入。
- 经营分析 AI 增强（`analysisService`）：流失预警/异常检测/客户评分(RFM A-D)/增强预测(移动平均+线性回归+季节因子)/建议。**数据范围已收口（2026-09-20）**：10 个端点由 `checkPermission('analysis') + requireManager` 改为 `checkPermission('analysis') + checkDataPermission('analysis')`，服务内按各表归属列套 `scopeFor`（customer→`owner_id`、contract→`create_by`、opportunity→`owner_id`、follow_up→`create_by`、sales_target→`user_id`、成员排名→`sys_user.id`）；并在 `init_role_permissions.js` 为 `analysis` 模块新增数据范围（boss=`all`、manager=`dept_and_sub`）。详见第 10 节 #21。

**已知坑**
- `teamDashboard.js` 原多数接口硬编码 `ROLES.ADMIN/roleId` 判 boss（与 dashboard 修复口径不一致）。**已修复（2026-09-18）**：所有 `isBoss` 判定统一改为 `viewAll || roleCode∈{boss,manager}`，service 层 `getStuckOpportunities` 的 `ROLES.ADMIN` 硬比较也改为 `roleCode !== ROLE_CODES.BOSS`。
  - **已知限制（非回归）**：团队看板仍用「看全部 vs 看自己」二元 `isBoss`，未像 `dashboardService` 那样走 `checkDataPermission` + `buildDataPermissionWhere`（dept_and_sub 粒度）。彻底对齐需重构 service 查询，属更大改动，未在本轮做。
- `/business`、`/finance`、`/finance/export`、`/export` 四个端点**曾无数据范围隔离**（仅 `checkPermission('report')`）→ **已修复（2026-09-20）**，详见第 10 节 #6。`analysis/*`（`analysisService`）亦为「挂了中间件但不分档」→ **已修复（2026-09-20）**，详见第 10 节 #21。
- ⚠️ **`requireManager` 不是「管理层」判定的可靠实现**（两次踩坑）：`middleware/admin.js` 的 requireManager 只放行 `req.user.manageAll` / `ADMIN_ROLE_CODES`（仅 `super_admin`，且为遗留 code、现库不存在）/ `roleId === 1`(boss)；而 **manager 角色 `view_all=0`/`manage_all=0` 会被直接 403**，`hr` 角色同理被挡在自己的 hr 模块之外。判据：**若某角色持有该功能权限码、前端菜单对其可见，却在端点上被 requireManager 403，即为同型缺陷**。现存使用点与影响面清单见第 10 节 #21。
- 图表建议整数 GROUP BY 维度缺口同 AI 模块（脆弱实现）。

---

## 6. 进销存与采购

| 模块 | 核心逻辑 | 完整性 |
|---|---|---|
| 库存（inventory） | 入/出/盘点调整均事务+行锁；预警阈值实时算；采购收货不直接改库存（需经本模块手动入口） | 完整（需先配 `crm_stock_alert` 才有预警） |
| 采购单（purchase） | 头+明细+收货+付款；金额走 `money`；收货按量累加 `received_qty` 判部分/完成；单价对普通角色字段级隐藏 | 完整 |
| 采购计划（procurement-plan） | 草案→提交→审批→转采购单（按供应商拆分多 PO）；`auto-generate` 依低库存+近一笔采购价生成补货计划 | 完整（依赖历史采购价） |
| 采购申请（purchase/request） | 草稿→待审→批准/驳回/撤销；仅记录申请，**不自动生成采购单/比价单**（人工衔接） | 完整 |
| 采购比价（purchase/comparison） | 向多家供应商征集报价→比价→选定（可自动按总价最低/交期最短）；不自动转 PO | 完整 |
| 供应商（supplier） | 主数据+联系人+资质+人工评分(4维)+绩效(实时聚合) | 完整 |
| 供应商评分（scoring 子路由） | 规则引擎自动加权算综合分，回写 `crm_supplier.rating`；与人工评分并存两套体系 | 完整（`calculateServiceScore` 用 `Math.random()` ±0.25 抖动属 hack） |
| 产品（product） | 主数据 CRUD + 多级价格表（retail/wholesale/vip/custom + 客户等级 + 币种 + 有效期）；`cost_price` 仅管理员可见 | 完整 |
| 货币（currency） | 多币种与汇率维护；设默认币清其它 | 完整（汇率人工维护） |
| 竞品（competitor） | 档案+交锋记录(输/赢/竞争)+情报+对比分析；与商机/客户弱关联 | 完整（纯手工录入） |

---

## 7. 协同与外部

| 模块 | 核心逻辑 | 完整性 |
|---|---|---|
| 邮件（email） | 个人账号 IMAP/SMTP 配置（aes-256-cbc 加密）+ 收发 + 自动关联客户；发送走 nodemailer | 发送/配置/关联/统计完整；**收信同步（`syncEmails`/`testConnection` 的 IMAP 部分）未实现**——已消除假成功、改为诚实上报（详见第 10 节 #14） |
| 社媒（social） | 各平台与客户沟通记录台账，形成客户时间线 | 完整（纯手工录入，无平台 API） |
| 集成（integration） | 系统级 SMTP 配置 + 测试发送 + 邮件日志（区别于个人账号） | 完整（仅邮件通道，"集成"命名偏宽） |
| API 平台（api-platform） | API Key + Webhook 管理，Webhook 测试含 SSRF 防护，**业务事件自动派发（已接线）** | 密钥/Webhook CRUD+测试+派发完整 |
| 日历（calendar） | 个人/团队日程，关联客户/业务对象，提醒分钟数+参与人 | 完整（弹窗依赖 SSE/cron） |

---

## 8. 调研问卷（survey）

- 模板/活动/回收/分析四件套；模板 questions 存 JSON（系统预设 `is_system=1` 不可改）；活动 draft→active→closed；回收自动解析 NPS(0-10)/CSAT(1-5)。
- **唯一对外免登录端点**：`POST /api/v1/survey/respond/:campaign_id`（双层 IP 限流防刷）。
- 分析端实时算 NPS 净推荐值、CSAT 均值、文本反馈。

**已知坑**
- 启动活动仅记 `total_sent`（按 all/selected 计数），**未实现真实邮件/短信投放【待补】**。

---

## 9. 系统支撑

| 模块 | 核心逻辑 | 备注 |
|---|---|---|
| 系统配置（config） | 键值参数（逾期天数/回收天数），更新清缓存；企微通知测试 | 完整（无企微 Webhook 则测试报错） |
| 操作日志（log） | `sys_log` 审计（module/action/params/old_value/new_value…），导出 xlsx 上限 1 万行，清 90 天 | 完整 |
| 数据备份（backup） | mysqldump 全量 + 恢复（HMAC 确认码二次确认） | 依赖环境装 mysqldump/mysql 且配 DB 密码 |
| 文件上传（upload） | multer 内存 + 扩展名/MIME 白名单 + magic bytes 二次校验；Supabase/本地双存储；UUID 化文件名 | 完整 |
| 全局搜索（search） | 跨客户/合同/商机/报价关键词搜索（≥2 字符），复用数据权限过滤 | 完整（仅 4 类实体） |
| 人力资源（hr） | 员工档案 + 佣金规则/计算（按签约合同额×率，calculated→confirmed→paid）+ 组织树 | 完整（回款型佣金结构预留但未自动计算） |
| 数据质量（dataQuality） | 对客户/供应商主数据体检（重复/缺失/格式） | 完整（仅支持这两表，其它表 400） |
| 定时任务（cronJobs） | 每日评分/清日志/公海回收/生成提醒（Vercel Cron 触发） | 完整（委托各 service，**公海回收已收敛客户域**） |
| 实时通知（sse） | SSE 长连接 + 心跳 + `sseManager` 连接池 | 完整（业务事件分散调用 `send`） |

---

## 10. 已知问题清单（汇总）

| # | 模块 | 问题 | 严重度 | 状态 |
|---|---|---|---|---|
| 1 | 报价审批 | 路由收 `2/3`、服务判 `===1` 推进商机 → 通过时不推进商机（疑似笔误） | P1 | ✅ 已修(2026-09-18) |
| 2 | 合同 | 编号双前缀/双日期格式（CON vs HT、YYMMDD vs YYYYMMDD） | P2 | ✅ 已修(2026-09-18) |
| 3 | 合同 | 审批通过不自动流转合同 `status`，易卡待执行 | P2 | 未修 |
| 4 | 合同/回款/发票/财务 | 金额未统一走 `money.js`（仅报价严格） | P2 | 🟡 部分已修(2026-09-18) |
| 5 | 团队看板 | 硬编码 `ROLES.ADMIN/roleId` 判 boss（与 dashboard 不一致） | P2 | ✅ 已修(2026-09-18) |
| 6 | 报表 | 经营看板/财务报表等 4 端点无数据范围隔离（**原判「分析无隔离」失实**，实为可获得全公司财务/业绩排名） | P2（实为可达越权，已按 P1 对待） | ✅ 已修(2026-09-20) |
| 7 | 知识库 | 产品更新未清缓存（stale≤300s） | P3 | 未修 |
| 8 | 服务工单 | 批量通知 business_id 取首单 | P3 | 未修 |
| 9 | 公海/离职 | 离职释放与自动回收 SQL 不一致 | P3 | 已知差异 |
| 10 | 智能化提醒 | boss 通知硬编码 `user_id=1` | P3 | 未修 |
| 11 | 自动化 | `update_field` 白名单含 `'assignee'`（crm_customer 无此列，命中报错） | P3 | 刻意不改 |
| 12 | 前端 api 命名 | finance→hr、follow-up→customer、payment→contract 错位 | P2 | ✅ 核查通过（非缺陷，2026-09-18） |
| 13 | 回收站 | 后端齐全但前端无视图 | P3 | 待补 |
| 14 | 邮件 | 两处 IMAP「假成功」已消除（2026-09-20）：`testConnection` 不再返回 `imap:true` 而置 `null`+`imap_note`；`syncEmails` 不再写 `last_sync_at`，返回 `{synced:false, reason:'IMAP_SYNC_NOT_IMPLEMENTED'}`。真实 IMAP 拉取**前置条件未满足**（缺 IMAP 依赖 + 受管环境 npm 被安全策略阻断不可安装），故功能**仍未实现**，仅从「静默成功」改为「诚实上报未实现」 | P2 | 🔶 诚实化已修(2026-09-20)，真接入受阻 |
| 15 | 问卷 | 启动活动未真实投放邮件/短信 | P3 | 待补 |
| 16 | API 平台 | Webhook 业务事件派发逻辑未接线 | P2 | ✅ 已修(2026-09-18) |
| 17 | 财务 | 供应商对账 `paid_amount` 恒为 0 | P2 | ✅ 已修(2026-09-18) |
| 18 | 财务 | 账龄用 sign_date 而非 plan_date，与回款逾期口径不符 | P3 | 未修 |
| 19 | 采购申请/比价 | 与采购计划/采购单无代码级自动衔接 | P3 | 人工衔接 |
| 20 | 审批前端 | 折扣类型重复选项 | P3 | UI 残留 |
| 21 | 权限闸门 | `requireManager` 只放行 `manageAll`/`super_admin`/`roleId===1`，**manager（`manage_all=0`）被 403**；分析域 10 端点「manager 持有 `analysis` 权限、菜单可见却全 403」（并顺带补数据范围） | P2 | ✅ 已修(2026-09-20) |
| 22 | 权限闸门 | 同上缺陷的**系统性扩散**：全库 **47 处** `requireManager` 挂载 / 15 个路由文件；中间件语义排除 manager ⇒ 约 **35 个**「角色已持有功能权限码 + 前端菜单可见」端点对**部门经理全部 403**（hr 角色亦被挡在自己模块外） | P2（可达的「功能不可用」而非越权） | ✅ 中间件与配对已修(2026-09-20)；`hr.js`(17 端点) 待产品决策 |

> **#4 剩余项（未修）**：报表/财务分析（`financeService`/`reportAnalyticsService`/`analysisService`/`customerDetailService`）与回款统计汇总中的浮点求和目前**只用于展示/比较、不写回 DECIMAL 列**，故未强制改造；若后续在这些路径新增「计算后入库」逻辑，须改走 `money.js`。合同 `amount` 无后端计算，属前端直传。

> **#12 核查结论（2026-09-18，非缺陷）**：原判「api 命名错位」经全量交叉核验**不成立**。脚本统计后端挂载前缀 **60 个**（含 `ModuleRegistry` 动态注册的 `/product`、`/report`、`/data-quality`），前端 30 个 api 文件的所有 URL **0 处断链**。实际情况：`hr.js` 同时定义 `/hr/*` 与 `/finance/*`（HR+财务聚合，URL 各自正确）；`customer.js` 内含 `/follow-up/*`（后端 `/follow-up` 为独立路由 app.js:327，URL 正确，仅文件归属不直观）；`contract.js` 内含 `/contract/payment/*`（后端回款确实挂在该前缀，归属正确）。**结论：属合理文件聚合，无断链、无错路由。**

> **#16 修复说明（2026-09-18）**
> **原缺口**：Webhook 的 CRUD / 日志 / 手动 `/test` 发送 / SSRF 防护**均已存在**，但**业务事件发生时没有任何自动派发**——`insertWebhookLog` / `updateWebhookTrigger` 仅在手动 test 路径被调用，导致「订阅了事件却永远收不到」。前端 `api-platform.vue:144` 已定义 7 个事件名而后端从未使用。
> **修复内容**：
> 1. 新建 `backend/services/webhookDispatcher.js`，导出 `dispatch(pool, eventType, data)`：查 `crm_webhook`（`status=1 AND deleted_at IS NULL`）→ 按 `events` JSON 数组过滤订阅者 → 逐个 POST。复用 `/test` 的 SSRF 防护（仅 http/https + 内网/保留地址黑名单）、10s `AbortController` 超时、`X-Webhook-Secret` / `X-Webhook-Event` 头。
> 2. 接入 2 处业务事件（均**事务 commit 后**、fire-and-forget、失败不影响主业务）：
>    - `paymentService.recordPayment` → `payment.received`
>    - `contractService.createContract` → `contract.signed`
> 3. 全程 **fail-safe**：内部 try/catch 吞掉一切异常，`dispatch` 绝不 throw。
> **返回值语义（重要）**：`dispatched` = **HTTP 2xx 投递成功**的条数。网络错误 / 超时 / SSRF 拒绝 / 对端非 2xx 均不计入，但都会在 `crm_webhook_log` 留下 `failed`/`timeout` 记录并 `fail_count++`。
> **⚠️ 未接入的事件（5 个）**：前端定义的 7 个事件中，**除已接的 `contract.signed`/`payment.received` 外，`customer.created`、`customer.updated`、`contract.completed`、`opportunity.won`、`opportunity.lost` 仍是「可订阅但不会自动触发」状态**——派发器已就绪，后续在各服务对应写入点加一行 `dispatch` 即可。
> **验证**：新增 `backend/tests/webhookDispatcher.test.js` **18 条用例全绿**（含 parseEvents 容错 4、isUrlAllowed 5、dispatch 9）；对 `paymentService`/`contractService` 回归 **23/23 通过**；ESLint `--max-warnings=0` EXIT 0。已做**反向验证**：按行号注入 `return true`（伪造成功）→ 测试如期失败（`Expected: 0 / Received: 1`），恢复后复跑全绿。

> **#6 修复说明（2026-09-20）**
> **原判失实（两处）**：
> ① 原文「**分析**无数据范围隔离」不成立——`reportAnalyticsService` 早在 2026-09-16 就已实现范围隔离（文件头注释即写明「现统一改为『路由 checkDataPermission → 服务内 buildDataPermissionWhere』」），10 个分析端点均有 `checkDataPermission('report')`。
> ② 真正缺口只有 **4 个端点**，且性质**不是「缺文档」而是可达越权**，故按 P1 对待：`/report/business`、`/report/finance`、`/report/finance/export`、`/report/export` 仅挂 `checkPermission('report')`，其 service 函数不接收用户、SQL 无归属过滤 → 返回**全公司** KPI / 财务 / **全员业绩排名**。
> **可达性证据链（四段闭合）**：
> | 环节 | 证据 | 结果 |
> |---|---|---|
> | 功能权限 | `migrations/086_fix_sales_permissions.sql` §3i「数据报表」 | **`report` 授予 sales** |
> | 数据范围 | `seeds/permission_data.sql:180` | sales 的 `report` = **`self`** |
> | 前端菜单 | `Sidebar.vue:151-152` `v-if="hasMenuPermission('report')"` | 销售**看得到**菜单 |
> | 前端路由 | `router/index.js:610`（`admin` 路由 = `manageAll` 放行 **或持有 permission 也放行**） | 销售**进得去**页面 |
> **修复内容**：
> 1. 路由层 4 端点补挂 `checkDataPermission('report')` 并透传 `req.dataPermission`（报表域挂载数 10 → **14**）。
> 2. service 层 4 个函数（`getFinanceReport` / `exportFinance` / `exportReport` / `getBusinessDashboard`）接收 `dataPermission`，对**每条**业务查询套 `scopeFor`，按表选归属列：customer→`owner_id`、contract→`create_by`、payment→经合同 `create_by` 透传、opportunity→`owner_id`、purchase_order→`owner_id`、成员排名→`sys_user.id`。
> 3. 顺带修铁律违规：`getBusinessDashboard` 两处 `u.role_id IN (1, 2, 3)` → 改为 `BUSINESS_ROLE_IDS_SQL`（`SELECT r.id FROM sys_role r WHERE r.code IN ('boss','manager','sales')`），业务口径不变但不再依赖 role_id 数值。
> **语义（沿用 sys_data_permission.report 既有配置，未新增产品规则）**：boss/finance(`all`)→全量；manager(`dept_and_sub`)→本部门及下级；sales(`self`)→仅本人。**无人被锁死**（销售看到的是「自己的经营数据」而非 403）。
> **⚠️ 为何不用 `requireManager` 加锁**：它判的是 `manageAll || ADMIN_ROLE_CODES.has(roleCode) || roleId===ROLES.ADMIN(1)`，而 `ADMIN_ROLE_CODES` 仅含 `super_admin`（`config/roles.js` 注释载明「现库已不存在」），且 `demo_users.sql:83` 明载 **manager 角色 `view_all=0`/`manage_all=0`**（靠 `sys_data_permission.dept_and_sub` 取数）⇒ 套用 `requireManager` 会把**部门经理一并 403**，属回归。`routes/analysis.js` 全量套用该中间件存在同一隐患 —— **已于 2026-09-20 修复，详见 #21**。
> **⚠️ 未收口（4 个端点）**：`/purchase-trend`、`/purchase-by-supplier`、`/purchase-cost`、`/supplier-performance` 为 `checkPermission('purchase')`（采购域），本次未动——`sys_data_permission` 仅 role 1/2 配了 `purchase`，其余角色会落到缺省 `self`，需先定采购域的数据归属口径再改。
> **验证**：`tests/unit/reportAnalyticsScope.test.js` 由 13 条扩至 **29 条全绿**（新增：`getFinanceReport` all/self 各表归属、`exportFinance` 3 分支、`exportReport` 4 Sheet、`getBusinessDashboard` 19 条查询「无漏网」不变式、roleCode 架构守卫、路由挂载守卫）；`tests/unit` 全量回归 **479 passed / 36 suites / 0 failed**；ESLint `--max-warnings=0` EXIT 0。已做**反向验证**（按行号注入两处缺陷）：去掉一条查询的 scope + 还原硬编码 `role_id IN (1,2,3)` → **5 条对应用例如期失败**，恢复后复跑全绿。

> **#21 修复说明（2026-09-20，分析域 `requireManager` 缺陷 + 数据范围补挂）**
> **缺陷本质**：`middleware/admin.js` 的 `requireManager` 判 `req.user.manageAll || ADMIN_ROLE_CODES.has(roleCode) || roleId === ROLES.ADMIN(1)`。而 `ADMIN_ROLE_CODES` 仅含 `super_admin`（`config/roles.js` 注释载明为**遗留 code、现库已不存在**），`ROLES.ADMIN = 1` 即 **boss**。⇒ 它实际只放行 **boss / manageAll**，**把名字里的 manager 排除在外**。
> **可达性证据链（四段闭合）**：
> | 环节 | 证据 | 结果 |
> |---|---|---|
> | 功能权限（权威源） | `backend/scripts/init_role_permissions.js:182`（CI 注释明示「权限的唯一事实来源」）manager 权限列表含 `'analysis'` | **manager 持有 `analysis`** |
> | 数据范围 | 同文件 `DATA_PERMISSIONS`（修复前）**无 `analysis` 条目** | manager 落入缺省 `self`（若仅去闸门则「只看自己」） |
> | 前端菜单 | `Sidebar.vue:156-162` `v-if="hasMenuPermission('analysis')"` | manager **看得到**「分析工具」 |
> | 前端路由 | `router/index.js:415-418`、`374-376` `meta.permission:'analysis'` | manager **进得去** 分析首页/增强预测 |
> ⇒ 结果：**菜单可见 → 点开 10 个接口全部 403，且文案为「需要管理员或经理权限」**（对一个经理说这句）。
> **修复内容**：
> 1. `routes/analysis.js`：**移除 `requireManager`**，10 个端点统一改为 `checkPermission('analysis') + checkDataPermission('analysis')`，并把 `req.dataPermission` 透传进 service。
> 2. `services/analysisService.js`：10 个函数接收 `dataPermission`，对**每条**归属相关查询套 `scopeFor`，按表选归属列：customer→`owner_id`、contract→`create_by`、opportunity→`owner_id`、follow_up→`create_by`、sales_target→`user_id`、成员排名→`sys_user.id`（共 17 处查询）。
> 3. `scripts/init_role_permissions.js` `DATA_PERMISSIONS` 新增 `analysis` 模块：**boss=`all`、manager=`dept_and_sub`**（其余角色无此权限码，脚本第 7 步会清理其历史残留行）。**为何必须显式配 boss**：`checkDataPermission` 对无条目角色注入缺省 `self`，boss 虽因 `manageAll` 走 bypass 注入 `all`，但显式声明可避免将来 boss 去掉 manageAll 时静默退化为「只看自己」。
> 4. 抽出共享工具 `utils/dataScope.js`（`scopeFor`），`reportAnalyticsService.js` 的局部同名函数改为引用它 —— 避免出现第二事实来源。
> **语义**：boss→全量；manager→本部门及下级；其余（无 `analysis` 码）→ 连入口都没有。**无人被误锁**。
> **验证**：`tests/analysis.test.js` 由 5 条增至 **8 条全绿**（新增：manager 不再 403 且按 `dept_and_sub` 注入部门集参数、`self` 只查本人、`/suggestions/enhanced` **5 条业务查询「无漏网」不变式**）；`tests/unit` + analysis + report + email 全量回归 **501 passed / 39 suites / 0 failed**；ESLint `--max-warnings=0` EXIT 0。**反向验证两轮**：① 给 `/win-rate` 重新挂 `requireManager` → 3 条用例如期失败（2 条 `Expected 200 / Received 403`）；② 删掉「停滞商机」查询的归属子句 → 「无漏网」不变式如期失败（`Expected pattern /(owner_id|create_by|user_id)\s*=\s*\?/`），恢复后复跑全绿。
> **⚠️ 未收口（同型缺陷仍存，需逐案决策）**：全库仍有 **13 个路由文件**在使用 `requireManager`。据角色权限表交叉核对，其中**至少 9 个构成同型缺陷**（角色持有该权限码、菜单可见，却被 403）：
> `routes/survey.js`(7 端点,`survey`)、`routes/tag.js`(2,`tag`)、`routes/scoring.js`(2,`scoring`)、`routes/contractTemplate.js`(1,`contract_template`)、`routes/followupTemplate.js`(1,`followup:template`)、`routes/customer/assign.js`(7,`customer:assign` 等)、`routes/contract/approval.js`(1,`contract`)、`routes/procurement-plan.js`(1,`purchase`) —— 以上 manager 均持有对应权限；
> **另有 `routes/hr.js`（17 端点,`hr`）**：`hr` 角色同样 `manage_all=0`，**被挡在自己的 hr 模块外**（此条与 manager 无关，属独立同型问题）。
> 余下 `routes/config.js`(`system`)、`routes/permission.js`、`routes/currency.js`、`routes/automation.js`（后三者无 `checkPermission`）语义上更像「仅管理员」，需产品确认是否保留。**因涉及多模块产品语义，未在本轮擅自修改。**
> ⇨ 上述「未收口」已于同日后续轮次处理，**详见下方 #22**。

> **#22 修复说明（2026-09-20，`requireManager` 语义缺陷的系统性收敛）**
> **口径决策**：与 #6 / #21 一致 —— **修中间件语义**（让 manager 通过），而不是给每个端点补 403。理由：这些端点的功能权限早已配置正确（`init_role_permissions.js` 是唯一事实来源），菜单也已可见，**唯一错的就是这道「管理层」闸门把它自己的名字排除了**；再补 403 等于把「功能不可用」固化。
> **精确盘点（脚本统计，非估算）**：`backend/routes/**` 共 69 个文件、519 条路由声明，其中 **47 处**挂载 `requireManager`，分三组：
> | 组 | 数量 | 特征 | 处理 |
> |---|---|---|---|
> | ① 真缺陷 | **35** | 同时挂 `checkPermission('<code>')`，且该码**非 boss 角色也持有**（manager 持有：`survey`/`tag`/`scoring`/`contract_template`/`followup:template`/`customer:assign`/`contract`/`purchase`/`hr` 等） | 中间件修好后**自动放行 manager**，无需改路由 |
> | ② 语义即「仅管理员」 | **2** | `config.js` 挂 `checkPermission('system')`，该码**仅 boss 持有** | 单角色码已天然收口，**语义不变**，不额外改动 |
> | ③ 无功能码（隐性越权风险） | **10** | 只有 `requireManager`，**没有任何 `checkPermission`**；一旦中间件放宽就会**泄漏给所有经理** | **补配对功能码**（下条） |
> **修复内容**：
> 1. `middleware/admin.js`：`requireManager` 纳入 `roleCode === ROLE_CODES.MANAGER`（保留原 `manageAll` / `ADMIN_ROLE_CODES` / `roleId === ROLES.ADMIN` 判据以向后兼容）。同时写入**使用约束注释**：本中间件只判「是不是管理层」、不判「有没有该功能权限」，**必须与 `checkPermission` 成对使用**。
> 2. 为组③ 的 **10 个端点补配对 `checkPermission`**，且刻意选择**仅 boss 持有**的码以**保持原「仅管理员」语义**（不因中间件放宽而扩权）：
>    | 文件 | 端点数 | 补挂的权限码 | 该码持有者 |
>    |---|---|---|---|
>    | `routes/permission.js` | 3（`/list`、`/role/:roleId`、`/data-scope/:roleId`） | `system:permission` | 仅 boss |
>    | `routes/currency.js` | 1（`DELETE /:id`） | `system:currency` | 仅 boss（与同文件 `PUT` 的 `requireAdmin` 同级） |
>    | `routes/automation.js` | 2（`/smart-reminders/pending`、`/smart-reminders/log/:id/seen`） | `automation` | 仅 boss |
>    | `routes/customer/assign.js` | 4（`/assign-rules` 增删改查 4 端点） | `customer:assign` | boss + manager（**有意放宽**：这是客户分配规则，属经理职责） |
> **验证**：
> - 新增 `tests/unit/middleware-requireManager.test.js` **12 条**（manager 放行**核心不变式**、boss/super_admin 放行、sales/hr/purchase/finance/engineer/unknown 403、未认证 403、缺 roleId 时不得侥幸通过）。
> - 新增 `tests/unit/requireManagerUsage.test.js` **7 条静态守卫**：① 扫描到 ≥30 个路由文件、≥40 处 `requireManager` 挂载（防扫描逻辑失效造成**假绿**）；② **每一处 `requireManager` 必须与 `checkPermission` 配对**；③ `routes/**` 不得出现 `roleId === <数字>` 硬编码判权；④ `requireManager` 必须含 `ROLE_CODES.MANAGER`（防修复回退）；⑤ 必须保留 `manageAll`/`ADMIN_ROLE_CODES` 判据；⑥⑦ `checkPermission` 必须委托 `permissionService` 按 `sys_permission.code` 判定、不得比较 roleId 数值。
> - 全量审计：**47/47 配对，0 处遗漏**。
> - **反向验证**：删掉 `|| req.user.roleCode === ROLE_CODES.MANAGER` 后，`middleware-requireManager.test.js` 中 manager 放行相关 **2 条如期失败**（`Expected 200 / Received 403`），恢复后复跑 19/19 全绿。
> - ESLint `--max-warnings=0` EXIT 0。
> **⚠️ 仍未收口（1 项，需产品决策，未擅自改）**：`routes/hr.js` **17 个端点**挂 `checkPermission('hr') + requireManager`，而 **`hr` 角色本身 `manage_all=0` 且不是 manager** ⇒ **中间件修好后 hr 角色仍被挡在自己的 hr 模块之外**（菜单可见、17 个接口全 403）。这与 manager 无关，属独立同型问题。两条候选路径：(a) 作为「模块所有者」直接移除 `requireManager`，仅留 `checkPermission('hr')`（与 #21 分析域口径一致，但会放开 `hr` 角色读取全员薪资）；(b) 在中间件中再加入 `ROLE_CODES.HR`（会同时放开 hr 角色到**其他**所有挂了 `requireManager` 的模块，风险更大）。**建议 (a) 并配合 hr 域数据范围**，但涉及薪资可见性产品规则，需拍板后再动。

---

## 11. 功能完整性矩阵

| 类别 | 完整可用 | 部分实现 / 待补 |
|---|---|---|
| 核心 CRM 域 | 客户/线索/公海/跟进/商机/报价/合同/回款/审批/权限/ Dashboard | 回收站（前端缺失） |
| 采购域 | 库存/采购单/计划/申请/比价/供应商/产品/货币/竞品 | 供应商评分随机抖动 hack |
| 协同赋能 | AI 助手/知识库/服务工单/报表(含数据范围)/分析(含数据范围)/自定义报表 | 知识库产品缓存、团队看板硬编码 |
| 外部协同 | 社媒/集成/API平台(含Webhook派发)/日历 | 邮件同步、问卷投放 |
| 系统支撑 | 配置/日志/备份/上传/搜索/HR/数据质量/cron/SSE | 供应商付款录入、备份依赖环境客户端 |

---

> 本文档由实际代码探查汇总。落地建议：优先处理第 10 节中 P1/P2 项（尤其报价审批推进笔误、金额统一 `money.js`、团队看板硬编码、经营看板数据隔离说明）。后续可对任一模块进一步展开字段级细节与数据库表关系图。

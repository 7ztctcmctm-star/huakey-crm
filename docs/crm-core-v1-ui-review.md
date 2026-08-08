# HuakeyCRM Core v1 UI 可用性检查报告

> **检查类型**: 前端页面静态走查 + 交互逻辑审查
> **检查日期**: 2026-08-06
> **检查人**: QA 负责人
> **检查范围**: Customer / Opportunity / Quote / Contract 四模块前端页面
> **检查方式**: 基于 Vue 组件源码的静态审查（人工浏览器走查清单见文末）

---

## 检查对象

| 模块 | 主页面 | 详情页 |
|------|--------|--------|
| Customer | `frontend/src/views/customer/List.vue` | `customer/Detail.vue` |
| Opportunity | `frontend/src/views/opportunity/list.vue` | `opportunity/Detail.vue` |
| Quote | `frontend/src/views/quotation/list.vue` | `quotation/edit.vue` |
| Contract | `frontend/src/views/contract/list.vue` | `contract/detail.vue` |

---

## 一、Customer 页面

### 新增是否顺畅
- ✅ 采用 `CustomerFormDialog` 弹窗组件，新增/编辑复用，交互统一。
- ✅ 字段完整：company_name / contact_name / phone / email / address / industry / source / level / status / remark。
- ✅ 支持 `?action=add` 路由参数自动打开新增弹窗（首页快捷入口）。

### 搜索是否正常
- ✅ 多维度筛选：公司名 / 联系人 / 电话 / 来源 / 级别 / 状态 / 创建日期范围。
- ✅ 视图模式切换（全部 / 我的 / 按员工），boss/manager 可见下属筛选。
- ✅ 搜索后自动回到第 1 页（`handleSearch` 重置 page=1）。
- ✅ 支持导出 Excel（按当前筛选条件）。

### 详情信息是否完整
- ✅ 路由 `/customer/detail/:id`，独立详情页。
- ✅ 含联系人、跟进记录、商机、报价、合同关联展示。

### 发现问题

| ID | 问题 | 严重度 | 建议 |
|----|------|--------|------|
| UI-C-01 | `isBoss` 判断使用 `roleId === 1`，`isManager` 使用 `roleId === 2`（硬编码数字 ID）。系统已迁移到 `roleCode`（boss/admin/sales），boss 角色的 roleId 不一定为 1，可能导致 boss 看不到批量分配/员工筛选等管理功能。 | **P2** | 改用 `roleCode === 'boss'` / `'admin'` 判断，或统一用 `manageAll`/`viewAll` 标志。记入 v1.1 backlog。 |

---

## 二、Opportunity 页面

### 阶段推进是否清晰
- ✅ 顶部销售漏斗可视化（stage 1-5 卡片 + 转化率箭头 + 总金额/失败统计），boss/manager 经营视角友好。
- ✅ 表格阶段列用彩色 `el-tag` 区分（询盘/需求确认/方案报价/谈判/成交/失败）。
- ✅ 赢单率用 `el-progress` 进度条展示。
- ✅ 停留天数预警（P0-2）：>15天红色 / >7天黄色 / >3天蓝色 / 3天内绿色。
- ✅ "推进"按钮仅在 `stage < 5` 时显示，已成交商机不显示推进。
- ✅ 推进弹窗：当前阶段标签 + 目标阶段下拉（仅允许向前推进，排除失败阶段）。

### 详情页信息是否足够
- ✅ 详情抽屉展示完整基本信息 + 阶段变更时间线（含 from→to、操作人、停留时长、变更原因）。
- ✅ 详情内提供"创建报价""创建合同"快捷入口，自动携带 customer_id + opportunity_id。

### 发现问题

| ID | 问题 | 严重度 | 建议 |
|----|------|--------|------|
| UI-O-01 | **推进弹窗缺少"变更原因"输入框**。`handlePushConfirm` 调用 `updateOpportunityStage(id, stage)` 仅传 2 参数，未传 `change_reason`。后端支持 change_reason（e2e 已验证），但前端推进时阶段日志的"原因"字段将为空，影响销售复盘。 | **P2** | 推进弹窗增加 `change_reason` 文本域，提交时一并传给后端。记入 v1.1 backlog。 |
| UI-O-02 | `winRateColor` 函数三档（≥70/≥40/其他）均返回 `var(--color-accent)` 同色，赢单率进度条无颜色区分，失去预警意义。 | **P3** | 三档分别用 success/warning/danger 色。记入 v1.1 backlog。 |
| UI-O-03 | 列表页商机 CRUD 复用 `@/api/customer.js`（getOpportunityList/addOpportunity 等），详情页用 `@/api/opportunity.js`，API 调用分散在两个文件，维护性差。 | **P3** | 统一到 `api/opportunity.js`。记入 v1.1 backlog。 |

---

## 三、Quote 页面

### 报价流程是否容易理解
- ✅ 搜索维度：报价单号 / 客户名称 / 状态 / 审批状态。
- ✅ 即将过期提醒（7 天内）顶部 `el-alert` 预警。
- ✅ 操作按钮按状态条件显示：草稿可编辑/发送/删除/提交审批；已确认或审批通过可转合同；审批中可撤回。
- ✅ 详情弹窗展示明细表（产品编码/名称/数量/单价/小计）+ 金额汇总（总金额/折扣/折后金额/有效期）。
- ✅ 转合同后自动跳转合同详情页。

### 发现问题

| ID | 问题 | 严重度 | 建议 |
|----|------|--------|------|
| UI-Q-01 | **审批权限判断 `isAdmin` 使用 `roleId===1 \|\| roleId===2 \|\| manageAll`**。boss 角色（roleCode='boss'）的 roleId 不一定为 1/2，若 boss 的 `manage_all` 未在 sys_role 表置 1，则 boss 无法在报价页看到"通过/拒绝"按钮，与 RBAC 矩阵（boss 可审批）矛盾。 | **P2** | UAT 必须验证 boss 账号 `manage_all=1`；长期改用 roleCode 判断。 |
| UI-Q-02 | 折扣显示 `Math.round((1 - row.discount) * 100)%`，若 `discount` 存储为绝对金额（如 300000）而非比例（如 0.95），则折扣百分比显示错误。需确认 discount 字段语义。 | **P2** | UAT 验证 discount 存储格式与显示逻辑一致；不一致则修复。 |
| UI-Q-03 | 报价相关 API（getQuoteList/addQuote/approveQuote/quoteToContract）全部内联在 `@/api/contract.js`，无独立 `api/quotation.js`，模块边界模糊。 | **P3** | 抽离为独立 `api/quotation.js`。记入 v1.1 backlog。 |
| UI-Q-04 | 操作列按钮多达 9 个（查看/编辑/发送/删除/转合同/提交审批/通过/拒绝/撤回），宽度 280px，小屏幕下可能拥挤溢出。 | **P3** | 收敛为"更多"下拉菜单。记入 v1.1 backlog。 |

---

## 四、Contract 页面

### 审批流程是否符合习惯
- ✅ 搜索维度：关键词 / 状态 / 审批状态 / 回款状态（含逾期/部分/已回清/待回款）。
- ✅ 逾期回款行高亮（P0-3，红色背景）。
- ✅ 审批流按钮：未提交→提交审批；审批中→通过/拒绝/撤回（仅 admin 可见通过/拒绝）。
- ✅ 审批通过后显示"回款"按钮，支持快速登记回款（关联回款计划、自动算待回金额）。
- ✅ 合同模板选择（可选），自动填充金额/付款条款/交付日期。
- ✅ 回款计划内联编辑（添加/删除计划行）。
- ✅ 支持导出 Excel。
- ✅ 拒绝审批强制填写原因（`inputValidator` 非空校验）。

### 发现问题

| ID | 问题 | 严重度 | 建议 |
|----|------|--------|------|
| UI-CT-01 | **合同 status 文档与前端实现不一致**。冻结审计文档（crm-core-v1-freeze-audit.md §2.4）定义：1=执行中, 2=已完结, 3=已终止, 4=已取消；前端 `statusText` 实现：1=待执行, 2=执行中, 3=已完成, 4=已取消。语义和编号均不同，可能造成业务理解歧义。 | **P2** | UAT 确认权威定义；统一文档与代码。若以代码为准则更新审计文档，若以文档为准则属 P1 代码缺陷。 |
| UI-CT-02 | 同 UI-Q-01，`isAdmin` 判断 boss 角色可能失效，影响合同审批按钮显示。 | **P2** | 同 UI-Q-01，验证 boss `manage_all`。 |
| UI-CT-03 | 合同新增弹窗中"关联商机"为可选，但未校验 opportunity_id 与 customer_id 一致性（报价模块有此校验，合同模块缺失），可能产生数据关联不匹配。 | **P2** | 新增合同时若同时选客户+商机，应校验一致性。记入 v1.1 backlog。 |

---

## 五、问题汇总

### 按严重度统计

| 严重度 | 数量 | 处理方式 |
|--------|------|----------|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 6 | 记入 v1.1 backlog（部分需 UAT 浏览器验证） |
| P3 | 5 | 记入 v1.1 backlog |

### P2 问题清单（v1.1 backlog）

| ID | 模块 | 问题 |
|----|------|------|
| UI-C-01 | Customer | isBoss/isManager 硬编码 roleId，boss 角色可能失效 |
| UI-O-01 | Opportunity | 推进弹窗缺少 change_reason 输入 |
| UI-Q-01 | Quote | isAdmin 判断 boss 可能无法审批 |
| UI-Q-02 | Quote | discount 折扣显示语义待确认 |
| UI-CT-01 | Contract | status 文档与代码定义不一致 |
| UI-CT-03 | Contract | 新增合同未校验 opportunity/customer 一致性 |

### P3 问题清单（v1.1 backlog）

| ID | 模块 | 问题 |
|----|------|------|
| UI-O-02 | Opportunity | winRateColor 三档同色 |
| UI-O-03 | Opportunity | API 调用分散两个文件 |
| UI-Q-03 | Quote | 无独立 api/quotation.js |
| UI-Q-04 | Quote | 操作列按钮过多 |
| UI-CT-02 | Contract | 同 UI-Q-01 |

---

## 六、人工浏览器走查清单

> 以下项需在 UAT 环境用真实账号浏览器执行，本静态审查无法覆盖：

| # | 检查项 | 账号 | 预期 |
|---|--------|------|------|
| 1 | Customer 新增弹窗提交后列表实时刷新 | uat_sales | 列表出现新客户 |
| 2 | Customer 搜索"汽车灯具"能命中 | uat_sales | 返回 A汽车灯具 |
| 3 | Customer 详情页联系人/跟进/商机 Tab 切换 | uat_sales | 各 Tab 数据正确 |
| 4 | Opportunity 推进阶段后漏斗数字更新 | uat_sales | 漏斗 count 变化 |
| 5 | Opportunity 详情时间线显示变更原因 | uat_sales | 显示 change_reason |
| 6 | Quote 新建报价选择产品后金额自动计算 | uat_sales | 合计正确 |
| 7 | Quote 转合同后跳转合同详情 | uat_sales | 跳转成功 |
| 8 | Contract 提交审批后 sales 看不到通过/拒绝 | uat_sales | 按钮不显示 |
| 9 | Contract manager 审批通过后回款按钮出现 | uat_manager | 回款按钮可见 |
| 10 | boss 账号能否看到全部数据 + 审批按钮 | uat_boss | 全部可见 + 可审批 |
| 11 | 验证 boss 的 manage_all 配置（UI-Q-01/CT-02） | uat_boss | 审批按钮显示 |
| 12 | 验证 discount 显示是否正确（UI-Q-02） | uat_sales | 折扣百分比合理 |

---

## 七、结论

四模块 UI 整体可用性良好：组件化程度高、交互流程完整、关键预警（漏斗/停滞/过期/逾期）均已实现。**未发现 P0/P1 阻断性问题**。

6 项 P2 问题均为"角色判断/字段语义/一致性校验"类，**不阻断核心业务流**，但其中 UI-Q-01/CT-02（boss 审批权限）需在 UAT 浏览器验证 boss 账号 `manage_all` 配置后方可放行。全部 P2/P3 记入 v1.1 backlog，不在 v1 冻结模块内改动。

> 建议：UI 静态审查发现的 6 项 P2 中，UI-Q-01 与 UI-CT-02 为同一根因（isAdmin 判断），UAT 时优先验证 boss 账号审批能力，若 boss 无法审批则升级为 P1 修复。

*本报告基于前端源码静态审查，配合人工浏览器走查清单完成最终 UI 验收。*

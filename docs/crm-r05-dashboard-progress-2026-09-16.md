# R-05 Dashboard 进展报告（2026-09-16）

> 编制：David ｜ 依据：PRD《HuakeyCRM 下一步》§4.1 首页 Dashboard 看板 + R-05 验收标准
> 结论摘要：**数据范围（R-05 硬验收项）已修复并有单测锁定；商机漏斗已改为 ECharts 并打通下钻。**
> **仍未完成**：`/report/analytics/*` 4 个接口**无数据范围**（同一缺陷类，见 §四-1），故 R-05 尚不能判定整体 PASS。

---

## 一、R-05 验收项对照

| PRD 要求 | 动手前现状 | 本轮处理 | 结论 |
|---|---|---|---|
| 4 张 KPI 卡（本月新增客户/进行中商机金额/本月签约合同额/回款率） | 已存在（`StatsCards.vue` 按角色渲染多套卡片） | 未改（无需重建） | ✅ 已具备 |
| 商机漏斗（**ECharts**，stage 1→6） | 是 HTML 行列表，非 ECharts | 改为 ECharts funnel（配色走 chartTheme） | ✅ 已完成 |
| 合同状态分布（饼图） | 已存在（`SalesChart.vue` `type:'pie'`） | 未改 | ✅ 已具备 |
| 待办清单（按角色） | 已存在（`PendingTasks.vue`） | 未改 | ✅ 已具备 |
| **角色数据隔离正确**（sales 个人 / manager 团队 / boss 全公司） | ❌ **用硬编码 roleId 判权**，与 `sys_role.view_all`/`sys_data_permission` 脱节 | 改为 `checkDataPermission('report')` + `buildDataPermissionWhere` | ✅ **已修复**（含单测） |
| 点击漏斗阶段下钻到商机列表（只读） | 无 | 图表 click → `/opportunity?stage=N`；列表页支持预置筛选 | ✅ 已完成 |
| 图表配色全部来自 `chartTheme.js`，无写死 HEX | ✅ 已符合（实测 dashboard 组件 0 处 HEX） | 新增图表同样只用 chartTheme | ✅ 已具备 |
| 顶栏「时间范围筛选 / 团队筛选」 | 未见 | **未做** | ⬜ 未开始 |
| 各角色面板（sales/manager/purchase） | 已存在 | 未改 | ✅ 已具备 |

---

## 二、本轮改动

| 文件 | 改动 | 说明 |
|---|---|---|
| `backend/services/dashboardService.js` | 重写判权 | 删除 `roleId === ROLES.ADMIN \|\| ROLES.MANAGER`；改由 `buildDataPermissionWhere` 按各表归属列构造（customer.owner_id / contract.create_by / opportunity.owner_id / follow_up.create_by / service_order.assignee_id）；顺带修掉「公海池计数传了 userId 但 SQL 无占位符」的死参数 bug |
| `backend/routes/report/dashboard.js` | 4 个路由加 `checkDataPermission('report')` | 与另外 8 个模块用法一致 |
| `backend/tests/unit/dashboardScope.test.js`（新增） | 12 个用例 | 锁定 all/self/dept 三种范围的 SQL 与参数；含**架构守卫**：源码不得再出现 `roleId ===` |
| `frontend/src/components/dashboard/SalesAnalytics.vue` | 漏斗改 ECharts + 下钻 | 配色只用 chartTheme；`sort:'none'` 保持 stage 1→6 顺序；tooltip 显示商机数与金额 |
| `frontend/src/views/opportunity/list.vue` | 支持 `?stage=N` | 预置阶段筛选（只读） |
| `backend/services/reportAnalyticsService.js` | 透传数值阶段号 | 原实现把数值 `stage` 映射成中文标签后**丢弃**，导致前端无法下钻；新增 `stage_code` → 响应含 `stage` |

---

## 三、验证证据（全部实测）

| # | 项 | 结果 |
|---|---|---|
| 1 | 新增单测 | ✅ **12/12 通过** |
| 2 | 真库冒烟（重写后的 4 个函数 × all/self/dept 三种范围） | ✅ 无 Unknown column；范围确实生效：`all` → 本月销售额 350 万/合同 1；`self(userId=2)` → **全 0**；`dept` → 与 all 同（同部门） |
| 3 | 浏览器实测：漏斗渲染 | ✅ canvas 936×260，非透明像素 **158,334**（非空画布），控制台 0 错误 |
| 4 | 浏览器实测：点击下钻 | ✅ 点击第 2 段 → URL 变为 **`/opportunity?stage=2`**（与库内该阶段数据一致） |
| 5 | 浏览器实测：下钻落地页筛选 | ✅ 直接访问 `/opportunity?stage=3` → 表格只剩 1 行，正是该阶段唯一商机 |
| 6 | 后端全量单测（带 DB 凭据） | 114 套件通过 / 1 套件失败（`contactSinglePrimary`，**本地库状态问题**，见 §四-3；修复后复跑通过） |

---

## 四、本轮新发现的 3 个问题（均非本轮引入）

### 1. 🔴 `/report/analytics/*` 4 个接口**完全没有数据范围**（未修，建议下一轮首办）

- 现状：`routes/report/analytics.js` 的 funnel / contract-revenue / payment-collection / 另 1 个接口只有
  `checkPermission('dashboard')`，**没有 `checkDataPermission`**；`reportAnalyticsService` 的函数签名
  `(pool, params)` **根本不接收用户**，SQL 里也没有 owner 过滤。
- 影响：**任何有 dashboard 权限的用户都会看到全公司的漏斗/合同收入/回款数据**（数据泄漏）。首页的
  `SalesAnalytics` 正是在用这 4 个接口 → **R-05 的「数据隔离正确」因此尚未整体达成**。
- 修法（与本轮 dashboard 同款，已验证可行）：路由加 `checkDataPermission('report')`，服务内用
  `buildDataPermissionWhere` 构造 `c.create_by / c.owner_id / o.owner_id` 条件 + 补单测。

### 2. 🟠 图表 `useChart` 的 ref 写法有一类**静默不渲染**陷阱（已核实影响面很小，结论已更正）

- 现象：`const { refs } = useChart('funnelChartRef')` + 模板 `ref="funnelChartRef"` 时，
  Vue 3 不会把元素写回 `refs[name].value` → `initChart` 拿到 null → **图表静默不渲染，无任何报错**。
- 证据：本组件首版即如此，浏览器实测 `.funnel-chart` 容器存在（936×260）但 **canvas = 0**；
  改为解构写法（`const { refs: { funnelChartRef } } = useChart(...)`，与 `TeamDashboard.vue` 一致）后立即渲染。
- **【更正 2026-09-16】影响面**：原先推测 `SalesChart.vue` / `views/analysis` / `views/report` 可能同样受影响 ——
  **核实后不成立**。全仓 5 个使用 `useChart` 的文件均为安全写法：
  `TeamDashboard`/`analysis`/`report` 用**解构**（`refs: { a, b }`），`SalesChart` 用**桥接**（`const trendChartRef = refs.trendChartRef`）——
  两者都能让字符串 ref 落到同名 setup 绑定上。**受影响的只有本轮新增的组件**（已修）。
  ⇒ 结论：这是「新增图表时必须遵守的写法约束」，不是存量缺陷。

### 3. 🟡 本地测试库会被 `tests/db` 套件改坏（环境问题，已修复本地库）

- 现象：跑完 `tests/db/*` 后，`schema_migrations` 最大版本从 114 **回退到 109**，
  `crm_customer_transfer`（迁移 112）、`uk_contact_primary_per_customer`（迁移 113）等对象消失，
  连带 `/reminder/*` 接口 500。
- 已确认**不影响 CI/生产**：权威基线 `deploy/init-complete.sql` 里两者都在（`crm_contract_item` 3 处、
  `uk_contact_primary_per_customer` 1 处）。
- 已按迁移 113 的方式在本地库重建唯一索引（先确认 0 个多主联系人客户），并重跑通过。
- **建议**：给 `tests/db` 加「不变量自检 + 失败即报」或改为在独立库上跑，避免污染 E2E 用的库。

---

## 五、剩余清单（未做）

1. **`/report/analytics/*` 的 4 个接口补数据范围**（P0 级数据泄漏，见 §四-1）——下一轮首办。
2. **顶栏时间范围筛选 + 团队筛选**（PRD R-05 明确要求）。
3. `useChart` ref 写法全仓排查与统一（§四-2）。
4. `tests/db` 与 E2E 共用同一个库造成的污染（§四-3）。
5. 09-15 登记的 **CI 库 `sys_customer_status*` 字典表为空** 仍未补。
6. R-01 / R-02 的 RFC 文档；生产库补跑迁移 112/113/114。

## 六、局限声明

- 「图表 ref 写法影响面」仅做了静态比对，**未逐页实测**（`/analysis`、`/report` 未打开验证）。
- 角色隔离的端到端验证使用了 `demo_admin`（boss 类角色）；**manager / sales 的实测未做**
  （单测已覆盖三种范围的 SQL 构造，但未做真实账号的接口对比）。
- ~~`dept` 范围在当前配置下与 `all` 结果相同属正常：`sys_data_permission` 中 **role 4(manager) 无任何配置行**
  → 实际落到默认 `self`。若产品要求「manager 看团队」，需补 `data_scope='dept'` 配置（**影响全系统所有模块**，需先拍板）。~~
  > ❌ **【2026-09-17 更正】上面这句是错的**（我排查时 SQL 口径有误）。实际数据：
  > `sys_data_permission` 中 **manager(4) = `dept_and_sub`（12 个模块）**、sales(5) = `self`、boss(1) = `all`。
  > 即「manager 看本部门及下级部门」**本来就是配置好的，无需拍板**。
  > 真正的缺陷是**前端判据过窄**（只看 `viewAll/manageAll`）导致 manager 看不到团队筛选 —— 已在 R-07 一并修复，
  > 详见 `docs/crm-r07-manager-account-2026-09-17.md` §二 / §三。

---

## 七、追加修复（同日）：`/report/analytics/*` 客户域接口补齐数据范围

**§四-1 的 P0 数据泄漏已闭环。**

### 7.1 范围界定

原以为只有 4 个接口，实际扫出**客户域共 10 个**（`routes/report/analytics.js`）：
`/sales-funnel`、`/performance`、`/customer`、`/payment`、`/sales-trend`、
`/analytics/sales/overview`、`/analytics/sales/funnel`、`/analytics/contract/revenue`、
`/analytics/payment/collection`、`/overdue`。

- 其中前 9 个此前**只有** `checkPermission('dashboard')`，服务函数签名为 `(pool, params)` **不接收用户**；
- `/overdue` 更严重：它自带一套 `roleId === ROLES.ADMIN || ROLES.MANAGER` 判权，
  而 `ROLES.MANAGER = 2` 在**现库是财务**（现库 id1=boss / id2=finance / id3=super_admin / id4=manager / id5=sales）
  ⇒ 财务会被当成「部门经理」拿到部门子查询。

### 7.2 改法

| 层 | 改动 |
|---|---|
| 路由 | 10 个接口统一加 `checkDataPermission('report')`，并传 `req.dataPermission` |
| 服务 | 新增统一助手 `scopeFor(dataPermission, ownerColumn, alias)`（内部调 `buildDataPermissionWhere`）；10 个函数接收 `dataPermission` 并在 SQL 中注入范围 |
| 归属列口径 | `crm_customer → owner_id`｜`crm_contract → create_by`｜`crm_opportunity → owner_id`；`crm_payment` / `crm_payment_plan` 无归属列，**经合同 create_by 透传**（新增 `LEFT JOIN crm_contract c`） |
| 语义 | `boss/super_admin(view_all=1) → all`；其余按 `sys_data_permission` 配置，缺省 `self` |
| 其它 | 删除 `getOverdueCustomers` 的 roleId 判权；`getSalesFunnel` 的 `dateFilter` 由「带 WHERE」改为「纯条件」以便叠加范围 |

### 7.3 验证证据

| # | 项 | 结果 |
|---|---|---|
| 1 | 新增单测 `tests/unit/reportAnalyticsScope.test.js` | ✅ 与 dashboardScope 合计 **23/23 通过**（含架构守卫「源码不得再出现 roleId ===」） |
| 2 | **真库冒烟**（10 个函数 × all/self/dept，12 条 SQL 在真实 schema 执行） | ✅ 无 Unknown column；范围生效（见下表） |
| 3 | 后端全量回归（带 DB 凭据） | 见下 |

真库冒烟（样本 `userId=2 demo_admin`）：

| 指标 | all | self | dept |
|---|---|---|---|
| 商机金额 | 4,500,000 | **1,000,000** | 4,500,000 |
| 漏斗总数 / win_rate | 5 / 20.0% | 4 / 0% | 5 / 20.0% |
| 合同收入 | 3,500,000 | **0** | 3,500,000 |
| 回款（应收/已收/回款率） | 1,050,000 / 1,050,000 / 100% | **0** | 同上 |
| 本月新增客户 | 10 | **2** | 10 |
| 业绩排行行数 | 4（Demo销售 3,500,000） | **0** | 4 |
| 销售趋势点数 | 1 | 0 | 1 |

### 7.4 仍未覆盖（如实登记）

- **非客户域报表接口仍无数据范围**：`/purchase-trend`、`/purchase-by-supplier`、`/purchase-cost`、
  `/supplier-performance`、`/export`、`/finance`、`/finance/export`、`/business`。
  它们不属于 R-05 的客户域范围，但同属「报表越权可见」缺陷类，建议随后统一处理。
- 团队筛选（PRD 要求）与 `sys_data_permission` 里 manager 的 `dept` 配置仍未做。

---

## 八、追加：顶栏「时间范围 + 团队筛选」（PRD §4.1 顶栏，已完成）

### 8.1 实现

| 层 | 内容 |
|---|---|
| 新组件 | `components/dashboard/DashboardToolbar.vue`：角色欢迎语 + 当天日期(周几) + 日期范围选择器 + 团队筛选（**仅具备全局查看能力时显示**）+ 重置 + 口径提示 |
| 新 composable | `composables/useDashboardFilters.js`：模块级单例状态 + `revision` 计数（供各面板 watch 重取数）+ `rangeLabel` 动态标签 + `query()` 组装参数 |
| 挂载点 | `views/Dashboard.vue`（角色分发壳）顶部 —— 三种角色面板共用同一份筛选 |
| 联动 | `SalesDashboard` / `ManagerDashboard`（overview/quick-stats/overdue-stats）、`SalesAnalytics`（漏斗/合同收入/回款/概览）、`SalesChart`（业绩/趋势/客户分析/漏斗）全部 watch `revision` 重取数并重绘 |
| 标签 | `StatsCards` 新增 `periodLabel` prop：受范围影响的 4 张卡（销售额/新增客户/合同数/回款）显示实际周期；**采购/服务/财务卡保持「本月」**（它们的接口不受该范围影响，避免误导） |
| 缓存 | 后端 5 个 `createCache` 自定义键**补上 query**（否则改筛选仍命中旧缓存）；`cache(ttl)` 类型本就以 `originalUrl` 为键，无需改 |

### 8.2 团队成员筛选的**服务端授权**（安全关键）

新增 `middleware/permission.buildOwnerOverrideFilter(pool, dataPermission, ownerId, ownerColumn, alias)`：

| 数据范围 | 行为 |
|---|---|
| 未传 / 非法 ownerId | 不加条件 |
| `all`（boss / super_admin） | 允许按成员筛选 |
| `dept` | 仅当目标成员与当前用户**同部门**才允许，跨部门**静默忽略** |
| `self` / `custom` / 缺省 | **一律忽略**（sales 不得借筛选看他人数据） |

> 前端下拉框不是权限边界 —— 该判定在服务端强制执行；新增单测 11 例覆盖全部分支。

### 8.3 验证证据

| # | 项 | 结果 |
|---|---|---|
| 1 | 前端构建 | ✅ `✓ built in 1m 8s`（无错误） |
| 2 | 后端单测（dashboardScope + reportAnalyticsScope + ownerOverrideFilter） | ✅ **34/34 通过** |
| 3 | 浏览器实测（demo_sales，销售面板） | ✅ 顶栏渲染（含团队筛选，因该账号 viewAll=true）；**范围联动见下表**；控制台 0 错误 |
| 4 | 重置回滚 | ✅ 数字与标签均回到「本月」 |

范围联动实测（选 2020-01-01 ~ 2020-01-31，库内无数据）：

| KPI 卡 | 筛选前（本月） | 选中历史区间 | 重置后 |
|---|---|---|---|
| 销售额 | ¥3,500,000.00 | **¥0.00** | ¥3,500,000.00 |
| 新增客户 | 1 | **0** | 1 |
| 合同数 | 1 | **0** | 1 |
| 回款 | ¥1,050,000.00 | **¥0.00** | ¥1,050,000.00 |
| 卡片标签 | 本月销售额 | **2020-01-01 ~ 2020-01-31销售额** | 本月销售额 |
| 「当下」指标（待执行合同/逾期客户/今日待跟进） | 1 / 0 / 0 | 1 / 0 / 0（**不随范围变，符合设计**） | 1 / 0 / 0 |

### 8.4 过程中的两次自我纠正（记录以免误导）

1. **误判 1**：以 `demo_sales` 首次访问 `/dashboard` 落到 404，一度以为是「`dashboard` 权限缺失」。
   实为两件事叠加：① 我的排查 SQL 用错列名（`permission_code` 应为 `code`）→ 误报"权限不存在"；
   ② 运行中的后端持有**权限缓存**（服务在补权限前启动）→ 重启即恢复。
   核实结论：`dashboard` 权限存在且已授予 boss/finance/manager/sales/hr/purchase/engineer；
   全仓 **86 个路由权限码与字典 100% 命中**（附核查脚本）。
2. **误判 2**：`useChart` ref 陷阱的影响面（已在 §四-2 更正）——实际只有本轮新增组件受影响。

### 8.5 仍未做

- 团队筛选下拉在**当前配置下对 manager 不可见**（manager 无 `sys_data_permission` 配置 → 范围=self → `canViewAll=false`）；
  若产品要「manager 看团队」，需补 `data_scope='dept'`（影响全系统）。
- 非客户域报表接口（`/purchase-*`、`/finance*`、`/export`、`/business`）仍无数据范围。


# Sales Analytics Dashboard MVP Scope

> **设计日期**: 2026-08-07
> **类型**: 范围定义（只读设计，未开发）
> **原则**: Opportunity（销售预测）/ Contract（合同收入）/ Payment（现金流）三域独立，不互改状态

---

## 1. Dashboard 信息架构

```
Sales Analytics Dashboard
├── A. Sales Funnel     ← crm_opportunity (销售预测)
├── B. Contract Revenue ← crm_contract (合同收入)
└── C. Payment Collection ← crm_payment + crm_payment_plan (现金流)
```

### A. Sales Funnel

| 指标 | 定义 | 数据源 |
|------|------|--------|
| opportunity 数量 | 活跃商机数 | crm_opportunity |
| expected_amount 总额 | 各 stage 商机金额合计 | crm_opportunity.expected_amount |
| 各 stage 分布 | 1询盘~6失败 每 stage 数量 | crm_opportunity.stage |
| stage 转化率 | 前 stage→后 stage 转化比 | stage_log + 当前分布 |
| win rate | 成交/失败比率 | stage=5 vs stage=6 |

**统计时间范围（需明确）**：
- 建议：`create_time`（商机创建时间）作为归属期间
- 备选：`update_time`（当前状态时间）、`expected_date`（预期成交）
- **MVP 决策**：以 `create_time` 为基准，后续可加时间维度切换

### B. Contract Revenue

| 指标 | 定义 | 数据源 |
|------|------|--------|
| 合同数量 | 合同总数 | crm_contract |
| 合同金额 | SUM(amount) | crm_contract.amount |
| active 合同金额 | status=2 金额 | crm_contract.status |
| completed 合同金额 | status=3 金额 | crm_contract.status |
| cancelled 合同金额 | status=4 金额 | crm_contract.status |

**金额字段**：`crm_contract.amount`（合同主金额，非报价/回款）

### C. Payment Collection

| 指标 | 定义 | 计算公式 |
|------|------|---------|
| 应收金额 | 回款计划总额 | SUM(crm_payment_plan.plan_amount) |
| 已收金额 | 实际回款 | SUM(crm_payment.pay_amount) |
| 未收金额 | 应收-已收 | 应收 - 已收 |
| 逾期金额 | overdue 计划金额 | SUM(plan_amount WHERE status='overdue') |
| 回款率 | 已收/应收 | 已收 / 应收 × 100% |

**数据源**：crm_payment（实际回款）+ crm_payment_plan（计划/应收）

---

## 2. 权限设计（复用现有 RBAC）

| 角色 | 数据范围 | 实现 |
|------|---------|------|
| 销售 | 仅自己 owner_id | `AND owner_id = ?`（现有 dashboardService 模式） |
| 主管 | 团队（本部门+子部门） | `owner_id IN (dept 子查询)`（现有 line 195 模式） |
| 管理员/boss | 全部 | 无 owner 过滤（isAdmin/manageAll） |

**复用**：`checkDataPermission('opportunity', 'owner_id')` + 现有 dashboardService 的 isAdmin/dept 过滤逻辑。**不新增权限系统**。

---

## 3. MVP 边界

### Phase 5.5 MVP 做
- KPI 卡片（三层核心指标数字）
- 基础列表（商机分布/合同状态/回款状态）
- 基础统计接口（聚合查询）

### 暂不做
- BI 图表（SalesChart 现有简化版保留，不扩展）
- AI 预测
- 高级报表
- 导出（report/analytics 已有 /export，MVP 不新增）

---

## 4. API 设计草案（只定义，不实现）

```
GET /api/v1/analytics/sales/overview        # 三层核心指标 + KPI
GET /api/v1/analytics/sales/funnel          # Sales Funnel 各 stage 分布
GET /api/v1/analytics/contract/revenue      # Contract 收入分层
GET /api/v1/analytics/payment/collection    # Payment 应收/已收/逾期
```

- 均 `GET`，带 `dateRange` query 参数
- 复用现有 `report/analytics.js` 的部分逻辑（sales-funnel、payment、overdue 已存在）
- 返回 `{code:200, data:{...}}` 标准格式

---

## 5. Current Data Sources（现状盘点）

### 已有基础设施（Phase 5.5 可复用，非从零）

| 组件 | 现状 |
|------|------|
| dashboardService | ✅ 已有 month_sales/month_payments/opportunity_amount/pending_payment |
| report/analytics.js | ✅ sales-funnel、payment、overdue、sales-trend 等 12+ 接口 |
| 数据权限 | ✅ owner_id 过滤 + isAdmin + dept 团队过滤已实现 |
| 前端 | ✅ SalesDashboard/ManagerDashboard/StatsCards/SalesChart |

### 三层数据源确认

| 层 | 表 | 关键字段 |
|----|-----|---------|
| Sales Funnel | crm_opportunity | expected_amount, stage, win_rate, owner_id, create_time |
| Contract Revenue | crm_contract | amount, status(1-4), sign_date, create_by |
| Payment | crm_payment + crm_payment_plan | pay_amount, plan_amount, status, paid_amount |

---

## 6. Metric Definition（指标定义汇总）

### A. Sales Funnel
```
total_opportunities    = COUNT(*) WHERE deleted_at IS NULL
total_expected_amount  = SUM(expected_amount) WHERE deleted_at IS NULL
stage_distribution     = GROUP BY stage COUNT(*)
win_rate               = COUNT(stage=5) / (COUNT(stage=5)+COUNT(stage=6))
```

### B. Contract Revenue
```
total_contracts    = COUNT(*) WHERE deleted_at IS NULL
total_amount       = SUM(amount)
active_amount      = SUM(amount) WHERE status=2
completed_amount   = SUM(amount) WHERE status=3
cancelled_amount   = SUM(amount) WHERE status=4
```

### C. Payment Collection
```
receivable  = SUM(plan_amount)  (crm_payment_plan, 非 deleted)
received    = SUM(pay_amount)   (crm_payment, 非 deleted)
outstanding = receivable - received
overdue     = SUM(plan_amount) WHERE status='overdue'
rate        = received / receivable * 100%
```

---

## 7. Calculation Rules（计算规则）

1. **时间维度**：默认按 `create_time` 归属期间，MVP 支持 dateRange query
2. **软删除**：所有查询 `WHERE deleted_at IS NULL`
3. **三域独立**：各层指标只查询自己的表，不做跨域状态联动
4. **金额精度**：decimal(15,2)，返回字符串保留两位
5. **owner 过滤**：按角色拼接 owner_id/dept 条件（复用现有）

---

## 8. Permission Rules（权限规则）

```
请求 → authenticateToken → 按角色拼数据范围
  sales     → AND owner_id = userId
  manager   → AND owner_id IN (本部门+子部门用户)
  boss/admin→ 无 owner 过滤
→ 聚合查询 → 返回
```

复用 `checkDataPermission` + dashboardService 现有模式。

---

## 9. MVP Scope（交付范围）

### In Scope
| # | 项 | 说明 |
|---|----|------|
| 1 | KPI 卡片 | 三层核心指标（商机额/合同额/回款额） |
| 2 | Sales Funnel 列表 | 各 stage 数量+金额+转化 |
| 3 | Contract 状态列表 | 各状态合同数+金额 |
| 4 | Payment 汇总 | 应收/已收/未收/逾期 |
| 5 | 4 个 GET 接口 | overview/funnel/revenue/collection |

### Out of Scope（后续）
- BI 图表增强
- AI 预测 / 智能推荐
- 高级多维报表
- 导出扩展

---

## 10. Future Extension（未来扩展）

| 扩展 | 阶段 |
|------|------|
| 时间维度切换（月/季/年） | Phase 5.x |
| 部门/区域维度 | Phase 5.x |
| 图表可视化增强 | Phase 5.x |
| 预测模型（基于 win_rate） | Phase 6 |
| 导出扩展 | Phase 6 |

---

## 结论

Phase 5.5 MVP 基于**已有 dashboard/report 基础设施**整合成三层销售分析视图，非从零建设。核心工作是：新增 `analytics/sales` 系列聚合接口 + KPI/列表展示，复用现有 RBAC 数据权限。三域独立，不做状态联动。

*本范围定义等待批准。批准后进入 Phase 5.5.2 开发。*

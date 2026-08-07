# Sales Analytics Dashboard MVP Scope

> **设计日期**: 2026-08-07
> **类型**: 范围定义（只读设计）
> **原则**: Opportunity/Contract/Payment 三域独立，不互改状态

## 1. Dashboard 信息架构

Sales Analytics Dashboard:
- A. Sales Funnel     ← crm_opportunity (销售预测)
- B. Contract Revenue ← crm_contract (合同收入)
- C. Payment Collection ← crm_payment + crm_payment_plan (现金流)

### A. Sales Funnel
指标: opportunity 数量 / expected_amount 总额 / 各 stage 分布 / 转化率 / win rate
时间基准: create_time (MVP), 备选 update_time/expected_date

### B. Contract Revenue
指标: 合同数量 / 总额 / active(2) / completed(3) / cancelled(4) 金额
金额来源: crm_contract.amount

### C. Payment Collection
指标: 应收 SUM(plan_amount) / 已收 SUM(pay_amount) / 未收 / 逾期(status=overdue) / 回款率

## 2. 权限设计 (复用 RBAC)
- sales: AND owner_id = userId
- manager: AND owner_id IN (部门+子部门)
- boss/admin: 无过滤
复用 checkDataPermission + dashboardService 现有模式

## 3. MVP 边界
做: KPI卡片 / 基础列表 / 基础统计接口
不做: BI图表 / AI预测 / 高级报表 / 导出

## 4. API 草案 (GET, 不实现)
GET /api/v1/analytics/sales/overview
GET /api/v1/analytics/sales/funnel
GET /api/v1/analytics/contract/revenue
GET /api/v1/analytics/payment/collection

## 5. Current Data Sources
已有: dashboardService(month_sales/payments/opp_amount) + report/analytics.js(12+接口) + owner过滤
三层表: crm_opportunity / crm_contract / crm_payment+plan

## 6-8. 指标/计算/权限规则
- 软删除过滤 deleted_at IS NULL
- 三域独立查询
- 金额 decimal(15,2)
- owner 按角色拼接

## 9. MVP Scope
In: 三层 KPI + Funnel列表 + Contract状态 + Payment汇总 + 4接口
Out: BI图表/AI/高级报表/导出

## 10. Future
时间维度切换 / 部门维度 / 图表增强 / 预测模型 / 导出

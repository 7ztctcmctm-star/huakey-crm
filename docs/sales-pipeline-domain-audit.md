# Sales Pipeline Domain Audit

> **审计日期**: 2026-08-07
> **类型**: 只读业务领域审计

## Executive Summary

销售闭环领域基本完整。Lead/Customer/Opportunity/Contract/Payment 均有数据模型支撑，FK 链路完整。

| 环节 | 完成度 | 说明 |
|------|--------|------|
| Lead | 完成 | 作为 Customer 状态（lead） |
| Customer | 完成 | 生命周期+公海+分配+跟进 |
| Opportunity | 完成 | 阶段推进+stage_log+金额/概率 |
| Contract | 完成 | 状态+审批+opportunity关联 |
| Payment | 存在 | crm_payment+plan+4页面（非缺失） |

**主要缺口**: Opportunity→Contract 状态自动联动未发现。

## Current Architecture

- crm_customer 主档 (status/owner_id/pool_status/last_follow_time)
- crm_opportunity (customer_id/stage/win_rate/expected_amount + stage_log)
- crm_contract (customer_id/opportunity_id/status/approval_status)
- crm_payment + crm_payment_plan (contract_id/status pending|partial|completed|overdue)

## Lead Analysis

完成。lead 是 crm_customer.status 状态变体（无独立表），leadsService 管理潜客池，api:leads:claim/convert/mark 权限存在。

## Customer Analysis

完成。8 状态生命周期，owner_id 归属，assignService/poolService 分配与公海，followUpService 自动推进状态。Customer 为销售主档。

## Opportunity Analysis

完成（MVP 完整）。创建/编辑/阶段推进(stage_log)/金额/概率/负责人/客户关联均实现。**缺口**: 无 contract_id 字段（依赖 contract.opportunity_id 反向关联），合同后自动推进未发现。

## Contract Analysis

完成。可作为 Opportunity 后置节点（opportunity_id FK SET NULL）。状态+审批+回款计划完整。

## Payment Gap

**已存在**（非缺失）。crm_payment + crm_payment_plan + paymentService + 4 前端页面。增强方向: 应收/已收汇总、逾期告警完善。

## Data Flow

Lead→Customer(convert)→Opportunity(create)→Contract(convert)→Payment(plan/receive)
FK 完整: opp→customer, contract→customer, contract→opportunity(SET NULL), payment→contract, plan→contract。

## RBAC Analysis

| 模块 | 销售 | 管理员 |
|------|------|--------|
| Customer | view/edit/claim (self) | 全部 |
| Opportunity | add/edit (self) | 全部 |
| Contract | create | 全部+审批 |
| Lead | claim/convert | 全部 |

## Phase 5 Development Recommendation

已完成能力（不动）: Customer Center, Opportunity MVP, Contract, Payment 基础
缺失能力: P1 Opportunity→Contract 状态联动, P2 合同后商机收尾, P3 Payment 增强
不应修改: Customer Center, Contract 状态机, FK 关系

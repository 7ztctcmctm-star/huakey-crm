# Opportunity Contract Lifecycle Audit

> **审计日期**: 2026-08-07
> **类型**: 只读生命周期联动审计

## Current State

| 环节 | 状态 | 说明 |
|------|------|------|
| Opportunity 状态机 | 完成 | 6 阶段: 询盘/需求确认/方案报价/谈判/成交/失败 |
| Opportunity→Contract | 部分 | createContractFromOpportunity 存在但未接路由 |
| Contract 状态→Opportunity | 缺失 | 无 UPDATE crm_opportunity |
| Payment→Contract | 存在 | 回款后合同 status→2(执行中) |
| Payment→Opportunity | 缺失 | 不触碰商机 |

## Opportunity Lifecycle

- STAGE_MAP: 1询盘 2需求确认 3方案报价 4谈判 5成交(终态) 6失败(终态)
- 概率: DEFAULT_STAGE_PROBABILITY (5:100, 6:0)
- stage_log: crm_opportunity_stage_log (from/to_stage, reason, by)
- 结束条件: 人工推到 5/6

## Contract Lifecycle

- 创建(contract/add): contractService.createContract → 校验 opp 存在 → INSERT → 不推进商机
- 状态: 1待执行→2执行中→3已完成/4已取消, 不触发 UPDATE opportunity
- 审批: 独立 approval_status, 不影响商机

## Payment Relationship

- 回款→合同: paymentService.js:131 UPDATE crm_contract SET status=2 (存在)
- 回款→商机: 无 (缺失)

## Missing Automation

1. 合同创建后商机自动成交: createContractFromOpportunity 有推进逻辑但无路由
2. 合同状态变化影响商机: 缺失
3. 回款完成影响商机: 缺失

根因: createContractFromOpportunity (advanceStage op→5) 已编写但未接路由/前端。

## Recommended Implementation

已有逻辑(保留): 6阶段+stage_log+终态保护 / Contract状态机+审批 / Payment→Contract / 前端跳转带opp_id

缺失逻辑(优先级): P1 合同创建→商机成交(在createContract后调advanceStage或加路由)
                    P2 合同取消→商机回退
                    P3 合同完成→商机终态确认

不应修改: Opportunity 6阶段定义 / stage_log表 / 终态保护 / Payment→Contract联动

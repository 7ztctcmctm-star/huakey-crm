# Sales Lifecycle Rule Design

> **设计日期**: 2026-08-07
> **类型**: 业务规则设计（只读）

## 1. Opportunity Stage 语义

STAGE_MAP: 1询盘 2需求确认 3方案报价 4谈判 5成交(终态) 6失败(终态)

**关键问题**: stage 5(成交) 当前在合同创建时触发(5.2.2)，但合同创建≠生效(需审批)。
需业务决策: 成交应绑定"合同创建"还是"审批通过/生效"?

## 2. Contract 状态影响

Contract: 1待执行→2执行中→3已完成(终态)/4已取消(终态)
当前: 合同创建→商机stage5(有); 审批/执行/完成/取消→商机(均无影响)

## 3. Payment 状态影响

Payment: pending/partial/completed/overdue
当前: 回款→合同status=2(有); 回款→商机(无); 回款→forecast(无); dashboard仅month_payments

## 4. Sales Lifecycle Matrix

| 事件 | Opportunity | Contract | Payment |
|------|------------|----------|---------|
| 合同创建 | stage 5 (现状) | status=1 | — |
| 审批通过 | 无 (建议: 若D1改则stage5) | status=2 | — |
| 合同取消 | 无 (建议: stage回退4) | status=4 | — |
| 合同完成 | 无 (建议: 保持5+锁定) | status=3 | — |
| 回款完成 | 无 | status=2 | plan completed |
| 回款逾期 | 无 | 无 | plan overdue |

## 5. 核心决策点

- D1: stage 5 触发时点 (合同创建/审批通过/生效)
- D2: 合同取消时商机处理 (回退4/保持标记/转失败)
- D3: 回款是否联动 forecast
- D4: 合同完成商机终态 (保持5/锁定)

## 6. 推荐规则 (待批准)

- D1=A: 合同创建即成交(现状, 审批拒绝率高则改B)
- D2=A: 合同取消→商机回退stage4
- D3=A: 回款只推进合同, 不联动商机/forecast
- D4=A: 合同完成商机保持5

## 7. 结论

半联动: 合同创建→商机成交已实现; 合同取消/完成/回款→商机缺失。
需业务确认 D1-D4 后转入开发。

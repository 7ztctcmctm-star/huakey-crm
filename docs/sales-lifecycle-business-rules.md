# Sales Lifecycle Business Rules — 已确认规则

> **确认日期**: 2026-08-07
> **类型**: 业务规则最终确认（D1-D4 决策固化）
> **定位**: HuakeyCRM = 设备制造企业销售 CRM

## 1. 生命周期模型（三域独立）

```
Opportunity (销售机会)    1询盘 2需求确认 3方案报价 4谈判 5成交 6失败
    ↓ 成交
Contract (合同执行)       draft → approval → active → completed / cancelled
    ↓ 财务执行
Payment (财务兑现)        pending → partial → completed / overdue
```

原则: 三域独立生命周期，不反向强耦合。

## 2. 已确认决策（D1-D4）

### D1: stage 5 触发时点
- 短期: 合同创建 → stage 5（保持 5.2.2）
- 长期: 合同生效（approval+active）→ stage 5（Phase 5.x 优化，不能马上改）

原因: 设备行业合同=谈判→拟定→审批→签署→预付款→生产。合同刚创建即成交会虚高漏斗。

### D2: 合同取消
不自动回退 stage 4。需人工选择原因:
| 取消原因 | Opportunity |
|---------|------------|
| 客户取消/反悔 | stage 6 失败 |
| 商务重新谈判 | stage 4 谈判 |
| 内部原因 | 默认 stage 6 或确认 |

P2.1: cancel reason + manual decision，非简单 cancel→stage4。

### D3: 回款与 Forecast
不联动（Opportunity 管机会，Payment 管兑现）。
未来 Dashboard 三层: 销售预测(expected_amount) / 合同收入(amount) / 实际收入(received)。

### D4: 合同完成
保持 stage 5 + 锁定。三域独立: Won/Completed/Completed。

## 3. 当前采用规则
- R1 合同创建→商机成交 (5.2.2 已实现)
- R2 回款→合同 status=2 (已实现)
- R3 合同完成→商机不动
- R4 合同取消→待 P2.1 实现

## 4. 后续优化
- O1 合同生效→商机成交 (D1 长期)
- O2 Dashboard 三层指标
- O3 合同取消→商机联动 (P2.1)

## 5. 不自动联动
- 回款不自动改商机 (D3)
- 合同取消不自动回退 stage (D2)
- Contract/Payment 不反向影响 Opportunity 终态

## 6. 开发路线
push main → 5.3.1 确认 → 5.4 Enhancement (P2.1 合同取消处理) → Dashboard/Forecast

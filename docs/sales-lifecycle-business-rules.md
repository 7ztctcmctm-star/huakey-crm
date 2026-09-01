# Sales Lifecycle Business Rules — 已确认规则

> **确认日期**: 2026-08-07
> **类型**: 业务规则最终确认（D1-D4 决策固化）
> **前置**: [sales-lifecycle-rule-design.md](sales-lifecycle-rule-design.md)
> **定位**: HuakeyCRM = 设备制造企业销售 CRM

---

## 1. 生命周期模型（三域独立）

```
Opportunity (销售机会)    1询盘 2需求确认 3方案报价 4谈判 5成交 6失败
    ↓ 成交
Contract (合同执行)       draft → approval → active → completed / cancelled
    ↓ 财务执行
Payment (财务兑现)        pending → partial → completed / overdue
```

**原则**: 三域独立生命周期，**不反向强耦合**。

```
Opportunity ──成交──→ Contract ──财务执行──→ Payment
```

---

## 2. 已确认业务决策（D1-D4）

### D1: Opportunity stage 5 触发时点

| 阶段 | 规则 | 状态 |
|------|------|------|
| **短期（现在）** | 合同创建 → stage 5（保持 5.2.2 实现） | ✅ 采用 |
| **长期（Phase 5.x 优化）** | 合同生效（approval 通过 + status=active）→ stage 5 | 📌 记录，后续优化 |

**原因**: 设备行业合同流程 = 商务谈判 → 合同拟定 → 内部审批 → 客户签署 → 预付款 → 生产。若合同刚创建即算成交，审批失败会虚高销售漏斗（如 10 草稿 8 失败 → 显示 8 成交，不准确）。

**注意**: 长期方案**不能马上改**（会改变 P1 的 5.2.2 实现），避免回滚。

### D2: 合同取消处理

**不自动回退 stage 4**。设备行业取消有两种场景，需人工选择：

| 取消原因 | Opportunity 去向 |
|---------|-----------------|
| 客户取消 / 反悔 | → stage 6 失败 |
| 商务重新谈判 | → stage 4 谈判 |
| 内部原因 | → 需业务确认（默认 stage 6 或保持） |

**设计**: 新增 Contract cancelled 事件，要求用户选择取消原因：
```
○ 客户取消
○ 商务重新谈判
○ 内部原因
○ 其他
```

**P2.1 实现方向**: 不是简单 `cancel → stage4`，而是 `cancel reason + manual decision`。

### D3: 回款是否影响 Forecast

**不联动**（保持现状）。

**原因**: Opportunity 管销售机会，Payment 管财务兑现，不混合。

**未来 Dashboard 三层指标**（Phase 5.x，非现状）：
| 指标 | 来源 |
|------|------|
| 销售预测 | Opportunity expected_amount |
| 合同收入 | Contract amount |
| 实际收入 | Payment received |

### D4: 合同完成

**保持 stage 5 + 锁定**（同意 Claude 建议，不改）。

```
Opportunity:  Won（保留）
Contract:     Completed
Payment:      Completed
```
三个生命周期独立，合同完成不改变商机终态。

---

## 3. 当前采用规则（立即生效）

| # | 规则 | 触发 | 动作 |
|---|------|------|------|
| R1 | 合同创建→商机成交 | contract/create 带 opportunity_id | advanceStage → 5（5.2.2 已实现） |
| R2 | 回款→合同执行中 | payment add 后 | contract status→2（已实现） |
| R3 | 合同完成 | status→3 | 商机不动（保持 5） |
| R4 | 合同取消 | status→4 | **待 P2.1 实现**（cancel reason + manual） |

## 4. 后续优化规则（Phase 5.x，不立即开发）

| # | 规则 | 阶段 |
|---|------|------|
| O1 | 合同生效→商机成交（替代 R1） | Phase 5.x（D1 长期） |
| O2 | Dashboard 三层指标 | Sales Dashboard / Revenue Analytics / Forecast |
| O3 | 合同取消→商机联动（reason-based） | Phase 5.4 P2.1 |

---

## 5. 不做自动联动（明确排除）

- ❌ 回款完成不自动改商机状态（D3）
- ❌ 合同取消不自动回退 stage（D2，需人工决策）
- ❌ Contract/ Payment 不反向影响 Opportunity 终态（三域独立）

---

## 6. 开发路线（已确认）

```
push main ✅
  ↓
Phase 5.3.1 Business Rules Confirmed（本文档）
  ↓
Phase 5.4 Opportunity Lifecycle Enhancement
  ├── P2.1 合同取消处理（cancel reason + manual decision）
  └── P3 不做状态联动 → 转 Sales Dashboard / Revenue Analytics / Forecast
```

---

*本文档为已确认业务规则，D1-D4 决策固化。后续开发须遵循。*

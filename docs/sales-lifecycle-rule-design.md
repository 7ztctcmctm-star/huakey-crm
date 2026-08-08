# Sales Lifecycle Rule Design

> **设计日期**: 2026-08-07
> **类型**: 业务规则设计（只读，未修改代码/数据库/状态机）
> **范围**: Opportunity → Contract → Payment 业务规则

---

## 1. 当前 Opportunity Stage 语义

### STAGE_MAP
```
1 询盘 → 2 需求确认 → 3 方案报价 → 4 谈判 → 5 成交(终态) → 6 失败(终态)
```

### 关键问题：stage 5（成交）代表什么？

| 候选语义 | 当前实现 | 状态 |
|---------|---------|------|
| 合同创建 | ✅ **是**（5.2.2: contract/create 成功即推进 stage 5） | 当前行为 |
| 合同审批通过 | ❌ 否 | 未实现 |
| 合同生效(active) | ❌ 否 | 未实现 |

**语义模糊**：当前 stage 5 在**合同创建**时触发，但合同创建后还需审批（approval_status）才真正生效（status→2 执行中）。**"成交"应在哪个时点触发需业务决策**。

> **Need Owner Decision**: stage 5 应绑定"合同创建"还是"合同审批通过/合同生效"？

---

## 2. Contract 状态对 Opportunity 的影响

### 当前 Contract 状态
```
1 待执行(默认) → 2 执行中 → 3 已完成(终态) / 4 已取消(终态)
```

### 当前行为分析

| 事件 | Opportunity 当前影响 |
|------|---------------------|
| 合同创建 (status=1) | ✅ 推进 stage 5（5.2.2） |
| 合同审批通过 | ❌ 无影响 |
| 合同执行中 (status=2) | ❌ 无影响 |
| 合同完成 (status=3) | ❌ 无影响 |
| 合同取消 (status=4) | ❌ 无影响 |

---

## 3. Payment 状态影响

### 当前 Payment 状态
```
pending → partial → completed / overdue（基于 paid_amount vs plan_amount）
```

### 当前行为

| 影响面 | 当前状态 |
|--------|---------|
| Contract | ✅ 回款后合同 status→2（执行中） |
| Opportunity | ❌ 无影响 |
| Forecast | ❌ 无商机金额联动 |
| Dashboard | ⚠️ 仅 month_payments（月度回款汇总），无商机/预测联动 |

---

## 4. Sales Lifecycle Matrix（建议规则）

> **C** = Current Behavior, **R** = Recommended Business Rule, **D** = Need Owner Decision

### 事件 → 三域影响矩阵

| 事件 | Opportunity | Contract | Payment |
|------|------------|----------|---------|
| **合同创建** | C: → stage 5<br>D: 是否改为审批后？ | C: status=1 待执行 | — |
| **合同审批通过** | C: 无<br>R: → stage 5（若 D 决定绑定审批） | C: approval_status=2<br>R: → status=2 执行中 | — |
| **合同取消** | C: 无<br>R: stage 5→4 回退（或标记）+ 商机 reopen | C: status=4 已取消 | — |
| **合同完成** | C: 无<br>R: stage 保持 5 + 锁定 | C: status=3 已完成 | — |
| **回款完成** | C: 无<br>D: 是否影响 forecast？ | C: status→2 执行中 | C: plan completed |
| **回款逾期** | C: 无 | C: 无 | C: plan overdue |

### 核心决策点

| # | 决策 | 选项 | 影响 |
|---|------|------|------|
| **D1** | stage 5 触发时点 | A. 合同创建（现状）<br>B. 合同审批通过<br>C. 合同生效(active) | 影响商机"成交"语义准确性 |
| **D2** | 合同取消时商机处理 | A. 回退 stage 4（可重新谈判）<br>B. 保持 stage 5 但标记<br>C. 商机转失败(stage 6) | 影响商机漏斗准确性 |
| **D3** | 回款完成是否联动 forecast | A. 仅合同 status=2（现状）<br>B. 联动商机金额/预测 | 影响销售预测报表 |
| **D4** | 合同完成商机终态 | A. 保持 stage 5（现状）<br>B. 新增锁定状态 | 影响商机"已成交"可信度 |

---

## 5. Recommended Business Rule（推荐规则，待批准）

### 推荐方案（基于最小改动 + 业务合理性）

```
合同创建      → Opportunity stage 5（保持 5.2.2，如 D1 选 A）
合同审批通过  → Contract status=2 执行中
合同取消      → Opportunity stage 5→4 回退（D2 选 A，可重新谈判）
合同完成      → Opportunity 保持 stage 5 + 锁定（D4 选 A）
回款完成      → Contract status=2（保持现状）（D3 选 A）
```

### 理由
- **D1=A**：合同创建即成交（现状）最简，但"审批被拒"时会误标成交——若审批拒绝率高需改 B
- **D2=A**：合同取消回退 stage 4 合理，商机可重新推进
- **D3=A**：回款只推进合同，不联动商机（商机金额已固化在合同）
- **D4=A**：合同完成商机保持成交，无需新状态

---

## 6. Current Behavior / Recommended / Need Decision 汇总

| 项目 | Current | Recommended | Need Owner Decision |
|------|---------|-------------|---------------------|
| 合同创建→商机 | stage 5 | 保持 | D1 时点确认 |
| 合同取消→商机 | 无 | stage 回退 4 | D2 处理方式 |
| 合同完成→商机 | 无 | 保持 5+锁定 | D4 |
| 回款→合同 | status=2 | 保持 | — |
| 回款→商机 | 无 | 不联动 | D3 |
| 回款→forecast | 无 | 不联动 | D3 |

---

## 7. 结论

当前销售生命周期**半联动**：合同创建→商机成交已实现（5.2.2），但合同取消/完成/回款对商机的后续联动**全部缺失**。本设计给出推荐规则矩阵，需业务确认 D1-D4 后进入开发。

**不开发、不修改、不迁移。** 仅设计文档。

---

*本文件为业务规则设计，等待业务决策 D1-D4。批准后转入开发。*

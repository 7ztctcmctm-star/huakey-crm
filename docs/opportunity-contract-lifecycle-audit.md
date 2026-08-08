# Opportunity Contract Lifecycle Audit

> **审计日期**: 2026-08-07
> **类型**: 只读生命周期联动审计（未修改任何代码/数据库）
> **范围**: Customer → Opportunity → Contract → Payment 联动

---

## Current State

| 环节 | 状态 | 说明 |
|------|------|------|
| Opportunity 状态机 | ✅ 6 阶段 | 1询盘→2需求确认→3方案报价→4谈判→5成交→6失败 |
| Opportunity→Contract | ⚠️ 部分 | `createContractFromOpportunity` 存在但**未接路由** |
| Contract 状态变化→Opportunity | ❌ 缺失 | 无 UPDATE crm_opportunity |
| Payment→Contract | ✅ 存在 | 回款后合同 status→2（执行中） |
| Payment→Opportunity | ❌ 缺失 | 不触碰商机 |

---

## Opportunity Lifecycle

### 阶段模型（`opportunityService.js` STAGE_MAP）
```
1 询盘 → 2 需求确认 → 3 方案报价 → 4 谈判 → 5 成交 (终态) / 6 失败 (终态)
```

- **终态**：stage 5（成交）和 6（失败）不可再推进（"商机已成交/失败，不可再推进"）
- **概率**：DEFAULT_STAGE_PROBABILITY（1:10, 2:25, 3:50, 4:75, 5:100, 6:0）
- **stage_log**：`crm_opportunity_stage_log`（opportunity_id, from_stage, to_stage, change_reason, changed_by）
- **回退规则**：BACKWARD_RULES 矩阵校验
- **结束条件**：人工推到 stage 5/6 即结束

---

## Contract Lifecycle

### 创建流程（contract/add）
```
contractController.createContract
  → contractService.createContract
      → 校验 opportunity_id 存在且属于同客户
      → INSERT crm_contract (含 opportunity_id)
      → ❌ 不推进 opportunity stage
```

### 状态变化
```
draft(1) → active(2) → completed(3) / cancelled(4)
```
- `updateContractStatus` 仅改合同 status
- **不触发任何 UPDATE crm_opportunity**

### 审批
- approval 流程独立（approval_status），**不影响商机**

---

## Payment Relationship

### 回款→合同（✅ 存在）
```javascript
// paymentService.js:131
await conn.query('UPDATE crm_contract SET status = 2 WHERE id = ? AND status = 1', [contract_id]);
```
- 回款后合同从「待执行(1)」→「执行中(2)」
- `crm_payment_plan.status`：pending/partial/completed/overdue + paid_amount

### 回款→商机（❌ 缺失）
- paymentService **无任何 opportunity 操作**

---

## Missing Automation

| # | 缺失联动 | 现状 | 影响 |
|---|---------|------|------|
| 1 | **合同创建后商机自动推进成交** | `createContractFromOpportunity` 有推进逻辑，但 **contract/add 路由未调用**；前端转合同走通用 add | 商机停留在旧 stage，不自动成交 |
| 2 | **合同状态变化影响商机** | `updateContractStatus` 不触碰商机 | 合同完成/取消不反映到商机 |
| 3 | **回款完成影响商机** | Payment→Contract 有，Payment→Opportunity 无 | 回款状态不联动商机 |

**根因**：`createContractFromOpportunity`（含 `advanceStage(op, 5)`）已编写但**未被任何路由/前端调用**——前端"创建合同"按钮只是跳转 `/contract` 页面（走通用 add），丢失了自动推进。

---

## Recommended Implementation

### A. 已有逻辑（保留，不动）
- Opportunity 6 阶段 + stage_log + 终态保护 ✅
- Contract 状态机 + 审批 ✅
- Payment→Contract（回款推进执行中）✅
- 前端商机→合同跳转（带 opportunity_id）✅

### B. 缺失逻辑（待开发，按优先级）
| 优先级 | 联动 | 建议实现 |
|--------|------|---------|
| **P1** | 合同创建→商机成交 | 在 `contractService.createContract` 成功后，若带 opportunity_id 且 stage<5，调用 `advanceStage(op, 5)`（复用已有方法）；或为 `createContractFromOpportunity` 添加路由 |
| **P2** | 合同取消→商机回退 | 合同 cancelled 时，商机从 5 回退到 4（谈判）或标记 |
| **P3** | 合同完成→商机终态确认 | 合同 completed 时商机保持在 5（成交）且锁定 |

### C. 不应修改
- Opportunity 6 阶段定义（稳定）
- stage_log 表结构
- 终态保护逻辑（5/6 不可推进）
- Payment→Contract 联动（已正确）

---

## 结论

**Opportunity→Contract 的自动推进逻辑已写好（`createContractFromOpportunity`）但未接通路由**——这是"半成品自动化"。修复方向明确：要么给该入口加路由，要么在通用 contract/add 创建成功后补一次 `advanceStage(op, 5)`。其余联动（合同状态、回款对商机）均缺失，为 P2/P3 增强。

---

*本审计为只读分析。推荐实现待批准后单独开发，不修改现有稳定逻辑。*

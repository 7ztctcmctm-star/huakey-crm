# CRM Core v1 Freeze Audit

> **审计类型**: 全链路冻结审计
> **审计日期**: 2026-08-04
> **审计机构**: HuakeyCRM 架构评审委员会
> **基线文档**: customer-center-freeze-v1.md / opportunity-center-v1-mvp-scope.md / contract-center-v1-freeze-report.md
> **状态**: ✅ AUDIT PASSED — FROZEN

---

## 1. Architecture Overview

### 1.1 CRM 核心业务闭环

```
┌──────────────────────────────────────────────────────────────────┐
│                      CRM Core v1 业务闭环                         │
│                                                                  │
│  ┌──────────────────┐                                           │
│  │  Customer Center │  ← 客户数据唯一拥有者                        │
│  │  crm_customer    │     leads → following → signed → lost       │
│  └────────┬─────────┘     API: /api/v1/leads, /customers, /pool  │
│           │ customer_id                                           │
│           │ (READ-ONLY for downstream modules)                    │
│           ▼                                                      │
│  ┌──────────────────┐                                           │
│  │ Opportunity      │  ← 商机管理                                  │
│  │ crm_opportunity  │     stage 1→2→3→4→5 (WON) / 6 (LOST)       │
│  └────────┬─────────┘     API: /api/v1/opportunity/*              │
│           │ opportunity_id                                        │
│           ▼                                                      │
│  ┌──────────────────┐                                           │
│  │  Quote Center    │  ← 报价管理                                  │
│  │  crm_quote       │     status 1→2→3→4                          │
│  └────────┬─────────┘     API: /api/v1/quote/*                    │
│           │ quote_id (+ opportunity_id)                           │
│           ▼                                                      │
│  ┌──────────────────┐                                           │
│  │ Contract Center  │  ← 合同管理 (含回款)                          │
│  │ crm_contract     │     status 1→2→3→4                          │
│  └──────────────────┘     API: /api/v1/contract/*                 │
│                                                                  │
│  关键约束:                                                        │
│  ────────                                                        │
│  ① Customer Center 是 crm_customer 唯一写入者                     │
│  ② 下游模块 (Opportunity/Quote/Contract) 只读客户数据              │
│  ③ 每个模块独立管理自身状态                                        │
│  ④ 跨模块引用通过 FK (ON DELETE SET NULL 为主)                     │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 模块冻结状态

| 模块 | 版本 | 冻结日期 | 文档 | 状态 |
|------|------|----------|------|------|
| Customer Center | v1.0 | 2026-08-04 | [customer-center-freeze-v1.md](customer-center-freeze-v1.md) | 🔒 FROZEN |
| Opportunity Center | v1 MVP | 2026-08-04 | [opportunity-center-v1-mvp-scope.md](opportunity-center-v1-mvp-scope.md) | 🔒 FROZEN |
| Quote Center | v1 | 2026-08-04 | Integration verified | ✅ STABLE |
| Contract Center | v1 | 2026-08-04 | [contract-center-v1-freeze-report.md](contract-center-v1-freeze-report.md) | 🔒 FROZEN |

### 1.3 数据归属与边界

| 表 | 拥有者 | 写入权限 | 读取权限 |
|----|--------|----------|----------|
| crm_customer | Customer Center | 仅 Customer Center | 全部模块 (SELECT) |
| crm_opportunity | Opportunity Center | 仅 Opportunity Center | Quote/Contract (SELECT) |
| crm_quote | Quote Center | 仅 Quote Center + Opportunity (createQuoteFromOpportunity) | Contract (SELECT) |
| crm_contract | Contract Center | 仅 Contract Center + Quote (convertToContract) | 无下游 |

---

## 2. Data Consistency Audit

### 2.1 customer_id 链路

```
crm_customer.id = 100
        │
        │ FK: fk_opp_customer (SET NULL)
        ▼
crm_opportunity.customer_id = 100     ✅ 一致
        │
        │ FK: fk_quote_customer (SET NULL)
        ▼
crm_quote.customer_id = 100           ✅ 一致
        │
        │ FK: fk_contract_customer (CASCADE)
        ▼
crm_contract.customer_id = 100        ✅ 一致
```

**验证**: 4 张表均有 customer_id 字段，FK 约束保证引用完整性，应用层额外校验一致性。

### 2.2 opportunity_id 链路

```
crm_opportunity.id = 200
        │
        │ FK: fk_quote_opportunity (SET NULL)
        ▼
crm_quote.opportunity_id = 200        ✅ 一致
        │
        │ FK: fk_contract_opportunity (SET NULL)
        │     fk_contract_quote (SET NULL) — Migration 105 新增
        ▼
crm_contract.opportunity_id = 200     ✅ 一致
crm_contract.quote_id = 300           ✅ 一致
```

**验证**: Quote/Contract 正确引用 Opportunity，FK 约束 (SET NULL) 保证商机删除后引用不产生孤儿。

### 2.3 金额字段一致性

| 表 | 字段 | 类型 | 精度 |
|----|------|------|------|
| crm_opportunity | expected_amount | DECIMAL(15,2) | 2 位小数 |
| crm_quote | amount | DECIMAL(15,2) | 2 位小数 |
| crm_quote | final_amount | DECIMAL(15,2) | 2 位小数 |
| crm_contract | amount | DECIMAL(15,2) | 2 位小数 |

**验证**: ✅ 全部使用 DECIMAL(15,2)，无隐式转换风险。`expected_amount` vs `amount` 命名差异体现语义（预估 vs 实际），属于设计意图。

### 2.4 生命周期字段

| 模块 | 生命周期字段 | 类型 | 值域 |
|------|-------------|------|------|
| Customer | business_status | VARCHAR(32) | lead/sea/following/quoted/negotiating/signed/lost/paused |
| Opportunity | stage | TINYINT | 1-6 (STAGE_MAP 映射) |
| Quote | status | TINYINT | 1=草稿, 2=已发送, 3=已确认, 4=已失效 |
| Contract | status | TINYINT | 1=执行中, 2=已完结, 3=已终止, 4=已取消 |

**验证**: ✅ 各自独立管理，无跨模块状态依赖。

---

## 3. Cross-Module Write Audit

> 详见 [cross-module-write-audit.md](cross-module-write-audit.md)

### 审计结果摘要

| 模块 | UPDATE crm_customer | 状态 |
|------|---------------------|------|
| Customer Center (customerService, poolService, etc.) | ✅ 预期内 — 数据拥有者 | 🟢 ALLOWED |
| Opportunity Center | ❌ 0 处 | 🟢 PASS |
| Quote Center | ❌ 0 处 (FIX-2 已修复) | 🟢 PASS |
| Contract Center | ❌ 0 处 | 🟢 PASS |
| cronService | ✅ 预期内 — customer 域定时任务 | 🟢 ALLOWED |
| 其他模块 | ❌ 0 处 | 🟢 PASS |

---

## 4. Permission Model Audit

> 详见 [rbac-business-flow.spec.js](../backend/tests/e2e/rbac-business-flow.spec.js)

### 4.1 角色-权限矩阵

| 操作 | boss | manager | sales | finance | hr | purchaser | engineer |
|------|------|---------|-------|---------|-----|-----------|----------|
| Customer:view | ✅ all | ✅ dept | ✅ self | — | — | — | — |
| Customer:add | ✅ | ✅ | ✅ | — | — | — | — |
| Opportunity:view | ✅ all | ✅ dept | ✅ self | — | — | — | — |
| Opportunity:add | ✅ | ✅ | ✅ | — | — | — | — |
| Quote:view | ✅ all | ✅ dept | ✅ self | ✅ all | — | — | — |
| Quote:add | ✅ | ✅ | ✅ | — | — | — | — |
| Contract:view | ✅ all | ✅ dept | ✅ self | ✅ all | — | — | — |
| Contract:add | ✅ | ✅ | ✅ | — | — | — | — |
| Contract:approve | ✅ | ✅ | ❌ | — | — | — | — |

### 4.2 越权检查结论

- ✅ sales 不能审批合同 (requireAdmin 中间件)
- ✅ sales 数据范围=self，不能查看他人数据
- ✅ finance 可查看全部合同但不能新增/删除
- ✅ 无越权访问路径

---

## 5. Database Integrity Check

> 详见 [database-schema-audit.md](database-schema-audit.md)

### 概要

| 检查项 | 结果 |
|--------|------|
| Migration 总数 | 106 (001-106) |
| 失败 migration | 0 |
| 重复字段 | 0 |
| 孤立 FK | 0 (105/106 已修复历史遗留) |
| 废弃字段 | 0 |

---

## 6. Full Verification Results

| 验证项 | 命令 | 结果 |
|--------|------|------|
| Backend Tests | `npm test` (10 suites) | ✅ 112 passed |
| E2E Tests | `tests/e2e/*.spec.js` | ✅ 24 passed |
| Frontend Build | `npm run build` | ✅ Exit 0 |
| Backend Lint | `eslint services/ routes/ controllers/` | ✅ 0 errors |

---

## 7. Known Technical Debt (v1.1 Backlog)

| # | 模块 | 描述 | 严重度 |
|---|------|------|--------|
| TB-1 | Contract | 无 crm_contract_status_log | P2 |
| TB-2 | Contract | 无状态流转规则矩阵 | P2 |
| TB-3 | Contract | fk_contract_customer CASCADE vs SET NULL 不一致 | P3 |
| TB-4 | 全局 | owner_id vs create_by 命名不统一 | P3 |
| TB-5 | Quote | crm_quote.opportunity_id 应用层校验无 DB FK | P3 (024 已补) |
| TB-6 | Contract | customer.status='signed' 限制过严 | P3 |

---

## 8. Freeze Sign-off

CRM Core v1 (Customer → Opportunity → Quote → Contract) 业务闭环已通过全部验证，正式冻结。

| 签署角色 | 日期 |
|----------|------|
| HuakeyCRM 架构评审委员会 | 2026-08-04 |

---

## 附录: 引用文档

- [customer-center-freeze-v1.md](customer-center-freeze-v1.md)
- [opportunity-center-v1-mvp-scope.md](opportunity-center-v1-mvp-scope.md)
- [opportunity-center-v1-integration-report.md](opportunity-center-v1-integration-report.md)
- [contract-center-audit-report.md](contract-center-audit-report.md)
- [contract-center-v1-freeze-report.md](contract-center-v1-freeze-report.md)
- [cross-module-write-audit.md](cross-module-write-audit.md)
- [database-schema-audit.md](database-schema-audit.md)
- [architecture.md](architecture.md)

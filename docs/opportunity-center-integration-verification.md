# Opportunity Center v1 — 集成验证文档

> **文档类型**: 集成验证计划
> **创建日期**: 2026-08-04
> **基线**: [opportunity-center-v1-mvp-scope.md](opportunity-center-v1-mvp-scope.md) §1-§7
> **关联约束**: [customer-center-freeze-v1.md](customer-center-freeze-v1.md) §领域边界
> **状态**: 执行中

---

## 1. 验证目标

验证 Opportunity Center v1 作为 CRM 核心枢纽模块，与 Customer Center、Quote Center、Contract Center 之间的集成正确性。

### 1.1 核心验证维度

| 维度 | 说明 |
|------|------|
| **数据一致性** | customer_id / opportunity_id / quote_id 跨表引用不产生孤儿数据 |
| **领域边界** | Opportunity/Quote/Contract 不修改 crm_customer 任何字段 |
| **权限隔离** | 数据权限 (self/dept/dept_and_sub/all) 在跨模块查询时正确过滤 |
| **状态机正确性** | 商机 stage 1-6 推进/回退正确记录 stage_log |
| **级联行为** | 客户删除/用户删除后关联模块行为符合 ON DELETE SET NULL 设计 |

### 1.2 不验证的内容

- Customer Center 内部实现（冻结，不属于此次范围）
- Opportunity Center 内部逻辑（MVP 验收已通过）
- Quote/Contract 独立功能（测试各自模块负责）
- 性能/压力测试

---

## 2. 测试范围

### 2.1 API 端点覆盖

| 端点 | 方法 | 集成验证重点 |
|------|------|-------------|
| `/api/v1/opportunity/detail/:id` | GET | 返回数据含 customer_name (JOIN crm_customer) |
| `/api/v1/opportunity/add` | POST | customer_id 引用校验，不修改 crm_customer |
| `/api/v1/opportunity/update-stage` | POST | stage_log INSERT，change_reason 写入 |
| `/api/v1/opportunity/stage-log/:id` | GET | 返回 from_stage/to_stage 映射 |
| `/api/v1/opportunity/timeline/:id` | GET | 聚合 stage_log + quote + contract |
| `/api/v1/quote/add` | POST | opportunity_id 校验，customer_id 一致性 |
| `/api/v1/contract/add` | POST | opportunity_id/quote_id 传递链校验 |

### 2.2 业务流程覆盖

```
┌──────────────────────────────────────────────────────────────┐
│                     CRM 核心业务链                             │
│                                                              │
│  Customer Center          Opportunity Center                 │
│  ┌──────────────┐        ┌──────────────────┐               │
│  │ Create       │──1──▶  │ Create           │               │
│  │ Customer     │        │ Opportunity      │               │
│  │              │        │ (customer_id)    │               │
│  └──────────────┘        └────────┬─────────┘               │
│                                   │2: advanceStage           │
│                                   ▼                          │
│                          ┌──────────────────┐               │
│                          │ Stage 1→2→3→4→5  │               │
│                          │ + stage_log      │               │
│                          └────────┬─────────┘               │
│                                   │3: createQuoteFromOpp     │
│              Quote Center         ▼                          │
│              ┌──────────────────────────────┐               │
│              │ Create Quote                 │               │
│              │ (opportunity_id, customer_id)│               │
│              │ → advances opp to stage 3    │               │
│              └──────────────┬───────────────┘               │
│                             │4: convertToContract            │
│             Contract Center ▼                               │
│             ┌────────────────────────────────┐              │
│             │ Create Contract               │              │
│             │ (opportunity_id, quote_id,     │              │
│             │  customer_id)                 │              │
│             │ → advances opp to stage 5     │              │
│             └────────────────────────────────┘              │
│                                                              │
│  关键约束:                                                    │
│  - 箭头 1-4 均不包含 UPDATE crm_customer                     │
│  - customer_id 在整个链上保持一致                             │
│  - stage_log 记录每次阶段变更                                 │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. 验收标准

### 3.1 数据一致性

| # | 标准 | 验证方式 |
|---|------|----------|
| DC-1 | crm_opportunity.customer_id 必须引用存在的、未删除的客户 | Service 层校验 + FK 约束 |
| DC-2 | crm_quote.opportunity_id 必须引用存在的、未删除的商机 | Service 层校验 |
| DC-3 | crm_quote.customer_id == crm_opportunity.customer_id（通过商机创建报价时） | quoteService.createQuote 校验 |
| DC-4 | crm_contract.opportunity_id 传递自 crm_quote.opportunity_id | convertToContract 逻辑 |
| DC-5 | crm_contract.quote_id 引用正确的报价单 | convertToContract 逻辑 |
| DC-6 | 客户删除后 crm_opportunity.customer_id → NULL (ON DELETE SET NULL) | FK 约束验证 |
| DC-7 | 无孤儿 stage_log (opportunity_id 指向不存在的商机) | FK 约束验证 |

### 3.2 领域边界

| # | 标准 | 验证方式 |
|---|------|----------|
| DB-1 | quoteService.createQuote 不含 UPDATE crm_customer | 源码静态分析 + 运行时 SQL 拦截 |
| DB-2 | opportunityService 所有函数不含 UPDATE crm_customer | 源码静态分析 |
| DB-3 | contractService 所有函数不含 UPDATE crm_customer | 源码静态分析 |
| DB-4 | cronService 不含跨模块同步客户状态逻辑 | 源码静态分析 |

### 3.3 权限隔离

| # | 标准 | 验证方式 |
|---|------|----------|
| PERM-1 | sales 角色仅查看自己负责的商机 (dataScope=self) | E2E 测试 |
| PERM-2 | 商机详情/阶段日志/时间轴均校验数据权限 | 路由中间件检查 |
| PERM-3 | 通过商机创建报价时不绕过数据权限 | 源码分析 |

### 3.4 阶段日志完整性

| # | 标准 | 验证方式 |
|---|------|----------|
| LOG-1 | 每次 advanceStage 写入一条 stage_log | advanceStage 源码 |
| LOG-2 | stage_log 包含 from_stage/to_stage/change_reason/changed_by | Service + Migration |
| LOG-3 | 商机创建时不自动写入初始 stage_log（初始阶段非"变更"） | 源码分析 |
| LOG-4 | 报价创建自动推进商机到 stage 3 时写入 stage_log | createQuoteFromOpportunity 源码 |
| LOG-5 | 报价转合同自动推进商机到 stage 5 时写入 stage_log | convertToContract 源码 |

---

## 4. 已知限制

| # | 限制 | 影响 | 计划 |
|---|------|------|------|
| L-1 | crm_quote.opportunity_id 无 FK 约束 | 报价可能引用已删除的商机（应用层已校验，DB 层无兜底） | v1.1 补 FK |
| L-2 | crm_contract.quote_id 无 FK 约束 | 合同可能引用已删除的报价单 | v1.1 补 FK |
| L-3 | crm_opportunity_stage_log.opportunity_id 无 FK 约束 | stage_log 可能产生孤儿记录 | v1.1 补 FK |
| L-4 | 客户软删除 (deleted_at) 不触发 FK CASCADE | customer_id 保留为已删除客户 ID，`fk_opp_customer` 为 SET NULL 仅对硬删除生效 | 当前设计预期行为 |
| L-5 | stage 推进时 win_rate 使用硬编码 DEFAULT_STAGE_PROBABILITY | 自定义赢率需在 update 接口单独设置 | v2.0 可配置化 |
| L-6 | 无需验证码/登录态即可调用的公开端点不在本次范围 | `/api/v1/health` 等 | N/A |

---

## 5. 测试用例矩阵

### 5.1 E2E 业务链测试

| Case | 流程 | 验证点 |
|------|------|--------|
| Case 1 | 销售创建客户 → 创建商机 → 推进阶段 → 创建报价 | 数据流一致性、customer_id 传递、stage_log 生成 |
| Case 2 | 销售A创建商机 → 销售B尝试访问 | 权限隔离 (dataScope=self) |
| Case 3 | 商机详情页 | 基本信息 + 阶段日志 + 时间轴（含报价/合同） |

### 5.2 边界场景测试

| Case | 场景 | 预期 |
|------|------|------|
| Case 4 | 引用不存在 customer_id 创建商机 | 404 CUSTOMER_NOT_FOUND |
| Case 5 | 引用 status=leads 的客户创建商机 | 400 BUSINESS_VALIDATION |
| Case 6 | 引用不存在 opportunity_id 创建报价 | 400 BUSINESS_VALIDATION |
| Case 7 | opportunity.customer_id ≠ quote.customer_id 时创建报价 | 400 BUSINESS_VALIDATION |
| Case 8 | 已成交商机 (stage=5) 推进阶段 | 400 不可再推进 |
| Case 9 | 已失败商机 (stage=6) 推进阶段 | 400 不可再推进 |

---

## 6. 数据库引用关系图

```
crm_customer (id)
    │
    │ fk_opp_customer: ON DELETE SET NULL
    ├──▶ crm_opportunity (customer_id, owner_id)
    │        │
    │        │ (无 FK — 应用层校验)
    │        ├──▶ crm_opportunity_stage_log (opportunity_id)
    │        │
    │        │ (无 FK — 应用层校验)
    │        ├──▶ crm_quote (opportunity_id, customer_id)
    │        │        │
    │        │        │ (无 FK — 应用层校验)
    │        │        └──▶ crm_contract (quote_id, opportunity_id, customer_id)
    │        │
    │        │ fk_contract_opp: ON DELETE SET NULL
    │        └──▶ crm_contract (opportunity_id, customer_id)
    │
    │ fk_quote_customer: ON DELETE SET NULL
    └──▶ crm_quote (customer_id)

sys_user (id)
    │
    │ fk_opp_owner: ON DELETE SET NULL
    └──▶ crm_opportunity (owner_id)
```

**图例**: 实线 = FK 约束存在, 虚线 = 应用层校验无 DB FK

---

## 7. 执行记录

| 日期 | 活动 | 结果 | 执行人 |
|------|------|------|--------|
| 2026-08-04 | 文档创建 | — | ARB |
| TBD | 业务链 E2E 测试执行 | — | — |
| TBD | 数据一致性验证 | — | — |
| TBD | 最终报告生成 | — | — |

---

## 附录 A: 引用文档

- [opportunity-center-v1-mvp-scope.md](opportunity-center-v1-mvp-scope.md) — MVP 开发基线
- [customer-center-freeze-v1.md](customer-center-freeze-v1.md) — Customer Center 冻结声明 + 领域边界约束
- [architecture.md](architecture.md) — 系统架构概览
- [opportunity-domain-design.md](opportunity-domain-design.md) — 原设计文档（参考）

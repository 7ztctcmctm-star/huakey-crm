# Contract Center v1 Freeze Report

> **文档类型**: 冻结声明
> **冻结日期**: 2026-08-04
> **基线**: [contract-center-audit-report.md](contract-center-audit-report.md) + 本报告
> **关联冻结**: [customer-center-freeze-v1.md](customer-center-freeze-v1.md), [opportunity-center-v1-mvp-scope.md](opportunity-center-v1-mvp-scope.md)
> **状态**: ✅ Freeze Ready

---

## 1. Architecture Status

### 1.1 模块清单

| 层 | 文件 | 行数 | 状态 |
|----|------|------|------|
| 路由聚合 | `routes/contract/index.js` | 11 | ✅ Stable |
| 路由 CRUD | `routes/contract/crud.js` | 169 | ✅ Stable |
| 路由回款 | `routes/contract/payment.js` | — | ✅ Stable |
| 路由审批 | `routes/contract/approval.js` | 18 | ✅ Stable |
| 路由导出 | `routes/contract/export.js` | — | ✅ Stable |
| 核心服务 | `services/contractService.js` | 335 | ✅ Stable (STATUS_MAP 已修复) |
| CRUD 服务 | `services/contractCrudService.js` | 274 | ✅ Stable |
| 回款服务 | `services/contractPaymentService.js` | — | ✅ Stable |
| 控制器 | `controllers/contractController.js` | 322 | ✅ Stable |

### 1.2 API 端点

| 端点 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/api/v1/contract/list` | POST | `contract` | 分页列表 |
| `/api/v1/contract/detail/:id` | GET | — | 详情含回款计划+记录 |
| `/api/v1/contract/add` | POST | `contract:add` | 创建合同 (事务) |
| `/api/v1/contract/update` | POST | `contract:edit` | 更新合同 (事务) |
| `/api/v1/contract/delete` | POST | `contract:delete` | 软删除 + 级联 payment/plan |
| `/api/v1/contract/opportunity-list` | GET | — | 可关联商机列表 |
| `/api/v1/contract/search` | GET | — | 轻量搜索 |
| `/api/v1/contract/approve` | POST | requireAdmin | 审批 |
| `/api/v1/contract/payment/*` | POST/GET | — | 回款 CRUD |
| `/api/v1/contract/export` | GET | — | 导出 Excel |

### 1.3 权限矩阵

| 角色 | 菜单 | add | edit | delete | view | 数据范围 |
|------|------|-----|------|--------|------|----------|
| boss | ✅ | ✅ | ✅ | ✅ | ✅ | all |
| manager | ✅ | ✅ | ✅ | ✅ | ✅ | dept_and_sub |
| sales | ✅ | ✅ | ✅ | ✅ | ✅ | self |
| finance | ✅ | — | ✅ | — | ✅ | all |

---

## 2. Database Status

### 2.1 crm_contract 核心字段

| 字段 | 类型 | 约束 |
|------|------|------|
| id | INT PK | AUTO_INCREMENT |
| contract_no | VARCHAR(50) UNIQUE | CON-YYMMDD-NNN |
| customer_id | INT NOT NULL | FK → crm_customer(id) ON DELETE CASCADE |
| opportunity_id | INT NULL | FK → crm_opportunity(id) ON DELETE SET NULL |
| **quote_id** | INT NULL | **FK → crm_quote(id) ON DELETE SET NULL** (Migration 105, 新增) |
| amount | DECIMAL(15,2) | — |
| status | TINYINT | 1=执行中, 2=已完结, 3=已终止, 4=已取消 |
| approval_status | TINYINT | 1=待审批, 2=已通过, 3=已拒绝 |
| create_by | INT | FK → sys_user(id) ON DELETE SET NULL |
| deleted_at | DATETIME | 软删除 |

### 2.2 FK 约束矩阵 (已修复)

| 约束名 | 列 | 引用 | ON DELETE | Migration |
|--------|-----|------|-----------|-----------|
| fk_contract_customer | customer_id | crm_customer.id | CASCADE | 059 |
| fk_contract_opportunity | opportunity_id | crm_opportunity.id | SET NULL | 059 |
| fk_contract_create_by | create_by | sys_user.id | SET NULL | init-complete |
| **fk_contract_quote** | quote_id | crm_quote.id | **SET NULL** | **105 (NEW)** |
| fk_stagelog_opp | opportunity_id | crm_opportunity.id | SET NULL | 060 (唯一, 106 cleaned) |

### 2.3 已修复的 Schema 问题

| 问题 | 修复 | Migration |
|------|------|-----------|
| quote_id 缺 FK | 新增 fk_contract_quote | 105 ✓ |
| stage_log 双重 FK (CASCADE + SET NULL) | 删除 CASCADE 版本, 保留 SET NULL | 106 ✓ |
| STATUS_MAP vs Joi 语义冲突 | 统一为 `1=执行中 2=已完结 3=已终止 4=已取消` | 源码修复 ✓ |

### 2.4 新增 Migration 清单

| # | 文件 | 变更 | 回滚 |
|---|------|------|------|
| 105 | `105_contract_quote_fk.sql` | ADD CONSTRAINT fk_contract_quote → crm_quote(id) ON DELETE SET NULL | `105_contract_quote_fk_down.sql` |
| 106 | `106_opportunity_stage_log_fk_cleanup.sql` | DROP CONSTRAINT fk_stage_log_opportunity (CASCADE), 保留 fk_stagelog_opp (SET NULL) | `106_opportunity_stage_log_fk_cleanup_down.sql` |

---

## 3. API Status

### 3.1 Contract Status 状态机

```
创建: status 默认 = 1 (执行中)
    │
    ├──▶ status=2 (已完结)  — updateContractStatus 允许
    ├──▶ status=3 (已终止)  — updateContractStatus 允许; 之后锁定不可变更/删除
    └──▶ status=4 (已取消)  — updateContractStatus 允许

approval_status 独立管理:
    1=待审批 → 2=已通过(approve) | 3=已拒绝(approve)
```

### 3.2 与 Customer Center 的边界

| 操作 | 允许 | 说明 |
|------|------|------|
| SELECT crm_customer | ✅ | JOIN 查询客户名称 |
| WHERE customer_id = ? | ✅ | 筛选条件 |
| UPDATE crm_customer | ❌ | 禁止 |
| 自动推进客户状态 | ❌ | 已确认无此逻辑 |

### 3.3 与 Opportunity Center 的集成

| 路径 | 方式 | 说明 |
|------|------|------|
| 创建合同关联商机 | opportunity_id → crm_opportunity.id | FK ON DELETE SET NULL |
| 合同创建时校验商机 | opportunity_id → 校验存在 + customer 一致性 | 应用层 |
| 报价→合同自动推进商机 | quoteService.convertToContract → advanceStage(5) | 不阻塞主流程 |
| 可选商机列表 | GET /opportunity-list | 排除 stage 5, 6 |

---

## 4. Test Status

### 4.1 测试覆盖

| 套件 | 测试数 | 类型 | 状态 |
|------|--------|------|------|
| `contract.test.js` | 5 | HTTP 参数验证 (400) | ✅ PASS |
| `services/contractService.test.js` | 17 | Service 单元测试 | ✅ PASS |
| `contractTemplate.test.js` | 6 | 模板测试 | ✅ PASS |
| `e2e/contract-flow.spec.js` | **10** | **E2E 业务链** | ✅ PASS |
| **合计** | **38** | — | ✅ ALL PASS |

### 4.2 E2E 测试覆盖

| Case | 流程 | 验证点 | 状态 |
|------|------|--------|------|
| 1.1 | 非signed客户创建合同 | 400 拒绝 | ✅ |
| 1.2 | customer_id ≠ opportunity.customer_id | 400 不匹配 | ✅ |
| 1.3 | 完整创建流程 | CON-YYMMDD-NNN 编号 + 不写 crm_customer | ✅ |
| 2.1 | quote_id 传递 | INSERT 包含 quote_id | ✅ |
| 3.1 | sales 不能删除他人合同 | 403 无权 | ✅ |
| 3.2 | admin 可删除非终止合同 | 200 成功 + 级联软删除 | ✅ |
| 边界 | status=3 合同不可删除 | 400 已终止 | ✅ |
| 边界 | 不存在合同 | 404 | ✅ |
| 领域 | contractService/contractCrudService | 不含 UPDATE crm_customer | ✅ |

### 4.3 全量回归

```
Test Suites: 10 passed, 10 total
Tests:       112 passed, 112 total
```

---

## 5. Known Limitations

| # | 类别 | 描述 | 计划版本 |
|---|------|------|----------|
| L-1 | 状态机 | 无合同状态流转规则矩阵 (除 status=3 锁定外无任何校验) | v1.1 |
| L-2 | 日志 | 无 crm_contract_status_log (与 Opportunity 的 stage_log 对比) | v1.1 |
| L-3 | 业务 | customer 必须 status='signed' 才能创建合同 (过严) | v1.1 评估 |
| L-4 | FK | fk_contract_customer ON DELETE CASCADE (与其他表 SET NULL 不一致) | v2.0 |
| L-5 | 命名 | create_by (contract) vs owner_id (opportunity) 不一致 | v2.0 |
| L-6 | 测试 | 无 contractCrudService 独立测试套件 | v1.1 |

---

## 6. Freeze Decision

### 6.1 冻结范围

以下内容自 2026-08-04 起进入冻结状态：

| 范围 | 内容 |
|------|------|
| **数据库** | crm_contract 表结构 (含 105/106 新增 FK) |
| **API** | /api/v1/contract/* 全部端点的请求/响应格式 |
| **权限码** | contract, contract:add, contract:edit, contract:delete, contract:view |
| **状态模型** | STATUS_MAP = { 1: '执行中', 2: '已完结', 3: '已终止', 4: '已取消' } |
| **审批模型** | approval_status (1=待审批, 2=已通过, 3=已拒绝), /approve 端点 |
| **领域边界** | 禁止 UPDATE crm_customer（架构级约束） |

### 6.2 变更控制

冻结后任何变更必须走 RFC 流程，仅以下情况允许修改：

1. **P0 Bug** — 影响生产数据正确性或服务可用性
2. **安全漏洞** — 权限绕过、SQL 注入、XSS 等
3. **数据错误** — 数据损坏、FK 约束错误、状态流转异常
4. **法规要求** — 合规性强制修改

### 6.3 签署

| 角色 | 日期 |
|------|------|
| HuakeyCRM 架构评审委员会 | 2026-08-04 |

---

## 附录 A: 本次审计修复清单

| # | 严重度 | 修复内容 | 文件 |
|---|--------|----------|------|
| F-1 | 🔴 P1 | STATUS_MAP 与 Joi schema 统一 | `contractService.js`, `crud.js`, `contractCrudService.js` |
| F-2 | 🟡 P2 | quote_id FK 约束 | `105_contract_quote_fk.sql` + down |
| F-3 | 🟡 P2 | stage_log 双重 FK 清理 | `106_opportunity_stage_log_fk_cleanup.sql` + down |
| F-4 | 🟡 P2 | Joi schema 缺 quote_id 字段 | `crud.js` |
| F-5 | 🟢 — | E2E 业务链测试 | `tests/e2e/contract-flow.spec.js` (10 tests) |
| F-6 | 🟢 — | 审计报告 | `docs/contract-center-audit-report.md` |

## 附录 B: 引用文档

| 文档 | 路径 |
|------|------|
| Contract 架构审计 | [contract-center-audit-report.md](contract-center-audit-report.md) |
| Customer 冻结声明 | [customer-center-freeze-v1.md](customer-center-freeze-v1.md) |
| Opportunity MVP 基线 | [opportunity-center-v1-mvp-scope.md](opportunity-center-v1-mvp-scope.md) |
| Opportunity 集成报告 | [opportunity-center-v1-integration-report.md](opportunity-center-v1-integration-report.md) |
| 系统架构 | [architecture.md](architecture.md) |

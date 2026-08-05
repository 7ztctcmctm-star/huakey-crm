# Contract Center v1 — 架构审计报告

> **文档类型**: 架构审计
> **审计日期**: 2026-08-04
> **审计人**: HuakeyCRM 架构评审委员会
> **审计范围**: Contract Center 全模块 (DB/Routes/Services/Controller/Tests)
> **关联约束**: [customer-center-freeze-v1.md](customer-center-freeze-v1.md) §领域边界

---

## 1. 模块概览

### 1.1 文件结构

```
backend/
├── routes/contract/
│   ├── index.js          # 聚合路由 (挂载 crud/payment/export/approval)
│   ├── crud.js            # CRUD 路由 + Joi 校验 (7 个端点)
│   ├── payment.js         # 回款路由 (5 个端点)
│   ├── approval.js        # 审批路由 (1 个端点)
│   └── export.js          # 导出/导入路由
├── services/
│   ├── contractService.js         # 核心服务 (list/get/create/status/amount)
│   ├── contractCrudService.js     # CRUD 补充 (含通知/搜索/商机列表)
│   ├── contractPaymentService.js  # 回款服务
│   ├── contractExportService.js   # 导出/导入
│   └── contractTemplateService.js # 合同模板
├── controllers/
│   └── contractController.js      # 22 个 controller 方法
└── tests/
    ├── contract.test.js                  # HTTP 层参数验证 (5 tests)
    └── services/contractService.test.js  # Service 单元测试 (17 tests)
```

### 1.2 API 端点清单

| 端点 | 方法 | 权限 | 数据权限 | 说明 |
|------|------|------|----------|------|
| `/api/v1/contract/list` | POST | `contract` | `contract`(create_by) | 分页列表 + 回款状态筛选 |
| `/api/v1/contract/detail/:id` | GET | — | `contract`(create_by) | 详情含回款计划+记录 |
| `/api/v1/contract/add` | POST | `contract:add` | — | 创建合同 (事务) |
| `/api/v1/contract/update` | POST | `contract:edit` | — | 更新合同 (事务) |
| `/api/v1/contract/delete` | POST | `contract:delete` | — | 软删除 + 级联 payment/plan |
| `/api/v1/contract/opportunity-list` | GET | — | `opportunity`(owner_id) | 可关联商机列表 |
| `/api/v1/contract/search` | GET | — | — | 轻量搜索 |
| `/api/v1/contract/approve` | POST | requireAdmin | — | 审批 (纵深防御) |
| `/api/v1/contract/payment/add` | POST | — | — | 登记回款 |
| `/api/v1/contract/payment/update` | POST | — | — | 修改回款 |
| `/api/v1/contract/payment/delete` | POST | — | — | 删除回款 |
| `/api/v1/contract/payment/list` | POST | — | — | 回款列表 |
| `/api/v1/contract/payment/summary` | POST | — | — | 对账汇总 |
| `/api/v1/contract/export` | GET | — | — | 导出 Excel |
| `/api/v1/contract/payment/export` | GET | — | — | 导出回款 |

---

## 2. 数据模型审计

### 2.1 crm_contract 表结构

| 字段 | 类型 | Nullable | 说明 |
|------|------|----------|------|
| id | INT | NO | PK, AUTO_INCREMENT |
| contract_no | VARCHAR(50) | NO | 合同编号 CON-YYMMDD-NNN |
| customer_id | INT | NO | FK → crm_customer.id |
| opportunity_id | INT | YES | FK → crm_opportunity.id |
| quote_id | INT | YES | **无 FK** (仅 INDEX) |
| amount | DECIMAL(15,2) | YES | 合同金额 |
| currency | VARCHAR(10) | YES | 货币代码, 默认 CNY |
| exchange_rate | DECIMAL(10,4) | YES | 汇率, 默认 1.0000 |
| sign_date | DATE | YES | 签订日期 |
| delivery_date | DATE | YES | 交付日期 |
| payment_terms | VARCHAR(500) | YES | 付款条款 |
| status | TINYINT | YES | 合同状态, 默认 1 |
| approval_status | TINYINT | NO | 审批状态, 默认 2 |
| approver_id | INT | YES | 审批人 |
| approval_remark | VARCHAR(500) | YES | 审批备注 |
| remark | TEXT | YES | 备注 |
| file_url | VARCHAR(500) | YES | 附件 |
| create_by | INT | YES | FK → sys_user.id |
| create_time | DATETIME | YES | 创建时间 |
| deleted_at | DATETIME | YES | 软删除 |

### 2.2 FK 约束矩阵

| 约束名 | 列 | 引用 | ON DELETE | 来源 |
|--------|-----|------|-----------|------|
| fk_contract_customer | customer_id | crm_customer.id | **CASCADE** | 059 |
| fk_contract_opportunity | opportunity_id | crm_opportunity.id | SET NULL | 059 |
| fk_contract_create_by | create_by | sys_user.id | SET NULL | init-complete |
| ❌ 缺失 | quote_id | crm_quote.id | — | — |

### 2.3 关联表

| 表 | 关联 | FK |
|----|------|-----|
| crm_payment_plan | contract_id → crm_contract.id | 需确认 |
| crm_payment | contract_id → crm_contract.id | 需确认 |
| crm_payment | plan_id → crm_payment_plan.id | 需确认 |

---

## 3. 🔴 状态映射不一致 (P1 — 阻塞冻结)

合同状态在两个位置定义了**完全不同**的语义映射：

| 值 | Joi Schema 注释 (crud.js:25) | Service STATUS_MAP (contractService.js:10) |
|----|------------------------------|---------------------------------------------|
| 1 | **执行中** | **待执行** |
| 2 | **已完结** | **执行中** |
| 3 | **已终止** | **已完成** |
| 4 | **待审批** | **已取消** |

**影响分析**:
- 前端/API 文档使用 Joi 注释的语义 (1=执行中, 2=已完结)
- 后端业务逻辑使用 STATUS_MAP 的语义 (1=待执行, 2=执行中)
- `updateContractStatus` 的校验逻辑 (`status===3 不可变更`) 基于 STATUS_MAP (已完成)
- 但 Joi schema 的 `valid(1,2,3,4)` + 注释意味着审批流程的状态
- **两套语义同时存在会导致前端展示与后端校验产生矛盾**

**建议**: 统一为 `STATUS_MAP = { 1: '执行中', 2: '已完结', 3: '已终止', 4: '待审批' }` 并同步更新 `updateContractStatus` 校验逻辑。

---

## 4. Contract 生命周期审计

### 4.1 当前状态流转

```
创建时默认 status=1 (待执行? 执行中?)
    │
    ├──▶ status=2 (已完结? 执行中?)  — 无校验，任意跳转
    ├──▶ status=3 (已终止? 已完成?)  — 仅禁止从 status=3 变更
    └──▶ status=4 (待审批? 已取消?)  — 无校验
```

### 4.2 问题汇总

| # | 严重度 | 问题 | 详情 |
|---|--------|------|------|
| LC-1 | 🔴 P1 | 状态语义不一致 | §3 — Joi 注释 vs STATUS_MAP 完全不同 |
| LC-2 | 🟡 P2 | 无状态流转规则 | 除 status=3→其他禁止外，无任何跳转校验 |
| LC-3 | 🟡 P2 | 无状态变更日志 | 与 Opportunity 的 crm_opportunity_stage_log 对比，Contract 无 status log 表 |
| LC-4 | 🟢 P3 | 创建时客户状态限制过严 | 要求 `customer.status === 'signed'`，但业务上 signed 之前就应有合同草稿 |
| LC-5 | 🟢 P3 | approval_status 与 status 关系不清 | approval_status (1=待审批/2=已通过/3=已拒绝) 与 status (4=待审批?) 重叠 |

### 4.3 与 Opportunity WON 的关系

- `quoteService.convertToContract` 创建合同后自动推进商机到 stage=5 (成交)
- `createContractFromOpportunity` (opportunityService) 同理
- **风险**: 如果合同后来被删除或取消，商机仍停留在 stage=5 (WON)，造成不一致
- **当前缓解**: 合同仅软删除 (deleted_at)，不物理删除

---

## 5. 数据库问题

### 5.1 P2: crm_contract.quote_id 缺 FK

| 项目 | 值 |
|------|-----|
| 当前状态 | INDEX `idx_contract_quote_id` 存在，FK 不存在 |
| 风险 | 🟡 低 — `convertToContract` 应用层已校验 quote 存在性 |
| 修复方案 | 新增 `fk_contract_quote` FOREIGN KEY (quote_id) REFERENCES crm_quote(id) ON DELETE SET NULL |
| 回滚 | DROP FOREIGN KEY fk_contract_quote |

### 5.2 P2: crm_opportunity_stage_log 双重 FK

| 约束名 | ON DELETE | 来源 |
|--------|-----------|------|
| fk_stage_log_opportunity | CASCADE | Migration 011 |
| fk_stagelog_opp | SET NULL | Migration 060 |

**问题**: 同列 `opportunity_id` 存在两个 FK 约束，名称不同，ON DELETE 行为不同。

**MySQL 行为**: 允许同列多 FK。DELETE 时 CASCADE 优先执行（删除行），SET NULL 随后无操作。

**风险**: 🟡 低 — 实际行为由 CASCADE 控制，但 schema 可读性差，未来维护可能误判。

**修复方案**: DROP `fk_stage_log_opportunity` (CASCADE from 011)，保留 `fk_stagelog_opp` (SET NULL from 060)。
- 注意：需要确保 migration 011 的表创建脚本中的 `CONSTRAINT fk_stage_log_opportunity` 已不再被依赖
- `init-complete.sql` 中的 stage_log 表定义不包含 FK（FK 由 migrations 单独管理）

---

## 6. 权限模型

| 角色 | 菜单 | 新增 | 编辑 | 删除 | 查看 | 数据范围 |
|------|------|------|------|------|------|----------|
| boss | ✅ | ✅ | ✅ | ✅ | ✅ | all |
| manager | ✅ | ✅ | ✅ | ✅ | ✅ | dept_and_sub |
| sales | ✅ | ✅ | ✅ | ✅ | ✅ | self |
| finance | ✅ | — | ✅ | — | ✅ | all |
| hr | — | — | — | — | — | — |
| purchaser | — | — | — | — | — | — |
| engineer | — | — | — | — | — | — |

**审计结论**: 权限分配合理，finance 可查看全部合同但只能编辑（不可新增/删除）符合职责分离原则。

---

## 7. 测试覆盖

| 套件 | 测试数 | 覆盖范围 | 状态 |
|------|--------|----------|------|
| `contract.test.js` | 5 | HTTP 参数验证 (400) | ✅ |
| `services/contractService.test.js` | 17 | list/create/status/amount | ✅ |
| **合计** | **22** | 核心 Service 覆盖良好 | ✅ |

**缺失**:
- 路由权限测试 (admin/sales 分支)
- contractCrudService 独立测试
- E2E 业务链 (Opportunity → Quote → Contract)

---

## 8. 修复建议汇总

| # | 严重度 | 类别 | 描述 | 建议 |
|---|--------|------|------|------|
| I-1 | 🔴 P1 | 状态 | STATUS_MAP vs Joi schema 语义冲突 | 统一为 `1=执行中, 2=已完结, 3=已终止`，废弃 status=4 或重新定义为 `4=草稿` |
| I-2 | 🟡 P2 | DB | quote_id 缺 FK | Migration 105: 新增 fk_contract_quote |
| I-3 | 🟡 P2 | DB | stage_log 双重 FK | Migration 106: DROP fk_stage_log_opportunity, 保留 fk_stagelog_opp |
| I-4 | 🟢 P3 | 业务 | 无状态流转规则矩阵 | v1.1 定义合同状态机 |
| I-5 | 🟢 P3 | 业务 | 无合同状态日志 | v1.1 新增 crm_contract_status_log |
| I-6 | 🟢 P3 | 业务 | customer.status='signed' 限制过严 | v1.1 放宽为 following/quoted/negotiating/signed |

---

## 9. 审计结论

Contract Center 核心 CRUD 功能完整，回款/审批/导出子模块齐全。

**可冻结前提条件**:
1. ✅ 修复 I-1 (状态映射统一) — **必须完成才能冻结**
2. ✅ 修复 I-2 (quote_id FK)
3. ✅ 修复 I-3 (stage_log 双重 FK)
4. ✅ 补充 E2E 业务链测试 (Opportunity → Contract)
5. I-4/I-5/I-6 可延后到 v1.1

**冻结建议**: 条件满足后冻结 Contract Center v1，范围覆盖 crud/payment/approval 路由、contractService/contractCrudService、crm_contract 表结构。

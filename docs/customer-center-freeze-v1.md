# Customer Center Freeze v1.0

> 冻结时间：2026-08-04
> 版本：v1.0
> 状态：**已冻结（FROZEN）**

---

## 当前版本

**Customer Center v1.0**

客户中心作为 CRM 基础模块，经过重构、回归修复、权限统一、Dead Code 清理、测试同步五个阶段，已达到稳定可冻结状态。

### 冻结范围

- 潜客池（leads）模块
- 正式客户（customer）模块
- 公海池（pool）模块
- 客户生命周期管理
- 客户权限体系
- 客户相关 API
- 客户相关测试

---

## 已完成功能

### 1. 潜客池（leads）
- 潜客列表（独立路由 `/leads`，独立 API `/api/v1/leads`）
- 新增潜客（`leads:add`）
- 转为正式客户（`leads:convert`）
- 认领线索（`leads:claim`）
- 释放线索（`leads:release`，manager 专属）
- 独立前端页面 `views/leads/List.vue`
- 独立后端路由 `routes/leads.js`

### 2. 正式客户（customer）
- 客户列表（独立路由 `/customer/list`，独立 API `/api/v1/customers`）
- 客户详情（`/customer/detail/:id`）
- 新增/编辑/删除客户（`customer:add` / `customer:edit` / `customer:delete`）
- 客户跟进（`customer:edit`，跟进日历/今日任务/明日计划）
- 客户推进/回退（`customer:edit`）
- 客户分配（`customer:assign`，manager 专属）
- 客户导入/导出（`customer:import` / `customer:export`）
- 释放到公海（`customer:release`）
- 高级管理（`customer:manage`，激活/流失，manager 专属）
- 独立前端页面 `views/customer/List.vue` + `Detail.vue`
- 独立后端路由 `routes/customers.js`

### 3. 公海池（pool）
- 公海列表（独立路由 `/pool`，独立 API `/api/v1/pool`）
- 认领公海客户（`pool:claim`）
- 分配公海客户（`pool:assign`，manager 专属）
- 独立前端页面 `views/pool/List.vue`
- 独立后端路由 `routes/pool.js`

### 4. 客户生命周期
- 状态流转：lead → following → quoted → negotiating → signed / lost / paused
- pool_status 流转：private ↔ sea（通过 release/claim）
- protect_until 保护期机制（认领后 7 天保护）
- 自动释放定时任务（cronService.autoReleaseCustomers）
- 临近回收预警（cronService.getNearRecycleCustomers）

### 5. 权限
- 统一命名规范：全项目 CRUD 使用 `add/edit/delete`，领域动词（claim/convert/release/approve）用于专用操作
- 权限码清单：见 [docs/customer-permission-standard.md](file:///c:/huakey-crm/docs/customer-permission-standard.md)
- 三模块权限码完全独立，无交叉污染
- 旧码 `customer:pool` 已删除（迁移 100）
- 旧码 `backup:create` / `leads:create` / `user:create` 已统一（迁移 101）

### 6. API
- Phase 5 API 独立化：`/customer/*` → `/customers/*`（正式客户）
- 兼容层：旧 `/customer/*` 端点保留，内部调用相同 controller
- 独立端点：`/api/v1/leads`、`/api/v1/pool`、`/api/v1/customers`
- 所有接口均使用 `authenticateToken` + `checkPermission` 双中间件

### 7. 测试
- 后端：100 suites / 978 tests passed
- 前端：9 suites / 37 tests passed
- 覆盖：API 路径、权限码、状态流转、定时任务、客户服务层

---

## 当前数据库模型

### 核心表

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `crm_customer` | 客户主表 | id, company_name, status(VARCHAR), pool_status(VARCHAR), owner_id, protect_until, deleted_at |
| `crm_follow_up` | 跟进记录（含计划 is_plan=1） | id, customer_id, content, next_follow_time, is_plan |
| `crm_contact` | 联系人 | id, customer_id, name, phone, is_primary |
| `crm_customer_score` | 客户评分 | id, customer_id, score |
| `crm_customer_tag` | 客户标签关联 | customer_id, tag_id |

### 状态枚举（迁移 097）

**status（业务状态）：**
- `lead` - 潜客
- `following` - 跟进中
- `quoted` - 已报价
- `negotiating` - 谈判中
- `signed` - 已签约
- `lost` - 已流失
- `paused` - 暂停跟进

**pool_status（池状态）：**
- `private` - 私有（有 owner）
- `sea` - 公海（无 owner）

### 权限表

| 表名 | 说明 |
|------|------|
| `sys_permission` | 权限定义（code/name/type/parent_id/path） |
| `sys_role` | 角色定义 |
| `sys_role_permission` | 角色-权限关联 |

---

## API 清单

### 潜客池（/api/v1/leads）

| 方法 | 端点 | 权限码 | 说明 |
|------|------|--------|------|
| POST | `/api/v1/leads` | `leads:view` | 潜客列表 |
| POST | `/api/v1/leads/convert` | `leads:convert` | 转为正式客户 |

### 正式客户（/api/v1/customers）

| 方法 | 端点 | 权限码 | 说明 |
|------|------|--------|------|
| POST | `/api/v1/customers` | `customer:view` | 正式客户列表 |
| POST | `/api/v1/customers/list` | `customer:view` | 全量列表（兼容） |
| POST | `/api/v1/customers/add` | `customer:add` | 新增 |
| POST | `/api/v1/customers/update` | `customer:edit` | 编辑 |
| POST | `/api/v1/customers/delete` | `customer:delete` | 删除 |
| GET | `/api/v1/customers/detail/:id` | `customer:view` | 详情 |
| POST | `/api/v1/customers/forward` | `customer:edit` | 推进 |
| POST | `/api/v1/customers/backward` | `customer:edit` | 回退 |
| POST | `/api/v1/customers/export` | `customer:view` | 导出 |

### 公海池（/api/v1/pool）

| 方法 | 端点 | 权限码 | 说明 |
|------|------|--------|------|
| POST | `/api/v1/pool` | `pool:view` | 公海列表 |
| POST | `/api/v1/pool/claim` | `pool:claim` | 认领 |
| POST | `/api/v1/pool/release` | `customer:release` | 释放到公海 |

### 兼容层（/api/v1/customer/*）

旧端点保留，内部调用相同 controller，权限码已同步统一。详见后端路由文件。

---

## 权限清单

完整权限树见 [docs/customer-permission-standard.md](file:///c:/huakey-crm/docs/customer-permission-standard.md)。

### 客户中心权限码汇总

| 模块 | 权限码 | 说明 |
|------|--------|------|
| customer | `customer:view` | 查看客户 |
| customer | `customer:add` | 新增客户 |
| customer | `customer:edit` | 编辑/跟进/推进/回退 |
| customer | `customer:delete` | 删除客户 |
| customer | `customer:assign` | 分配负责人 |
| customer | `customer:import` | 导入客户 |
| customer | `customer:export` | 导出客户 |
| customer | `customer:release` | 释放到公海 |
| customer | `customer:manage` | 高级管理 |
| leads | `leads:view` | 查看线索 |
| leads | `leads:add` | 录入线索 |
| leads | `leads:claim` | 认领线索 |
| leads | `leads:convert` | 转化为客户 |
| leads | `leads:release` | 释放线索 |
| pool | `pool:view` | 查看公海 |
| pool | `pool:claim` | 认领公海客户 |
| pool | `pool:assign` | 分配公海客户 |

---

## 测试结果

| 验证项 | 结果 |
|--------|------|
| 后端测试 | 100 suites / **978 passed** |
| 前端测试 | 9 suites / **37 passed** |
| 前端 Build | exit 0，**无编译警告**（23.84s） |
| 后端 Lint | **0 errors**，8 warnings（均为既有，非本次引入） |

---

## 已知技术债（仅记录，不修改）

以下技术债经评估不阻塞冻结，记录备查，后续迭代处理：

1. **`leadsService.js` @deprecated 标注矛盾**：文件头标 @deprecated 但仍被 customerController 活跃调用 7 个方法。需业务确认迁移方向。
2. **`legacyStatusToCode` 旧数字状态兼容映射**：customerService.js 和 customerDetailService.js 各有一份，用于迁移 070/097 过渡期。旧前端全量切换后可删除。
3. **`/customer/*` 兼容层端点**：前后端均保留，旧书签/外链过渡期保留。
4. **`customer:assign` 类型冲突**：init_role_permissions.js（button）与 098（api）重复定义，以 button 为准。
5. **`customer:list` 旧菜单码保留**：098 已映射到 `leads:view` + `customer:view`，未删除。
6. **未使用的权限码**：`leads:release` / `pool:assign` / `customer:manage` 已定义分配但路由未使用，为未来功能预留。
7. **migration 020 遗留 `api:*:update`**：7 个 api 类型权限码未被路由使用，属历史死代码。
8. **既有 lint warnings**：pool.js / customerService.js 未使用变量 + tmp/ 临时脚本，非客户中心引入。

---

## 后续模块依赖

客户中心作为 CRM 基础模块，以下后续模块将依赖其数据与 API：

| 后续模块 | 依赖点 | 依赖方式 |
|----------|--------|----------|
| 商机（opportunity） | 客户 id | `opportunity.customer_id` → `crm_customer.id` |
| 报价（quotation） | 客户 id | `quotation.customer_id` → `crm_customer.id` |
| 合同（contract） | 客户 id | `contract.customer_id` → `crm_customer.id` |
| 订单（order） | 客户 id | `order.customer_id` → `crm_customer.id` |
| 回款（payment） | 客户 id（通过合同） | `payment.contract_id` → `contract.id` → `contract.customer_id` |
| 服务工单（service） | 客户 id | `service_ticket.customer_id` → `crm_customer.id` |

**依赖约束**：后续模块只能读取客户中心数据，不得修改客户中心表结构、权限码、API 契约。

---

## 领域边界（Domain Boundary）— 架构约束

> 本节为**架构级约束**，适用于所有非客户中心模块（商机/报价/合同/订单/回款/服务工单等），不限于本次 Bug 修复。

### 约束 1：禁止跨模块写 crm_customer

**任何模块不得直接或间接修改 `crm_customer` 表的任何字段**，包括但不限于：
- `status` / `business_status` / `pool_status`
- `owner_id` / `protect_until`
- `last_follow_time` / `follow_status`
- 其他所有字段

**禁止的实现形式**：
- 直接 `UPDATE crm_customer SET ...`
- 调用 `customerService.forwardStatus` / `customerService.updateCustomer` 等任何修改方法
- 通过 cron / 定时任务 / 事件监听异步同步客户状态
- 通过触发器、存储过程间接写入

**允许的操作**：
- `SELECT` 读取客户数据（用于校验、关联查询、展示）
- 通过外键关联读取（JOIN）

### 约束 2：客户状态推进由客户中心自治

客户的状态流转（following → quoted → negotiating → signed 等）**只能由客户中心模块自身触发**：
- 用户在客户模块内手动操作
- 客户中心内部服务调用（如 `customerService.forwardStatus`）
- 客户中心的 cron 任务（如 `cronService.autoReleaseCustomers`）

后续模块若需要客户状态推进，**必须由用户在客户模块内手动完成**，不得由商机/报价/合同模块自动触发。

### 约束 3：违反边界的代码视为 P0 Bug

任何违反约束 1 / 2 的代码，视为 **P0 级架构违反**，必须立即修复。修复方式为**移除跨模块写 Customer 的逻辑**，不得以任何"替代方案"（如 cron 同步、事件监听）绕过。

### 历史违反记录

| 编号 | 文件:行号 | 违反描述 | 修复状态 |
|------|-----------|----------|----------|
| DB-1 | quoteService.js:103-121 | 报价创建后自动调用 `customerService.forwardStatus` 推进客户状态 | ✅ 已修复（Opportunity Center v1 MVP，2026-08-04）。FIX-2 移除跨模块写逻辑，[quoteService.test.js](file:///c:/huakey-crm/backend/tests/quoteService.test.js) 静态 + 运行时双重验证 |
| DB-2 | opportunityService.js:297 | 商机创建时检查 `customer.status`（字段名违反 + 业务规则违反） | ✅ 已修复（Opportunity Center v1 MVP，2026-08-04）。FIX-1 放宽状态校验为 `following/quoted/negotiating/signed`，仅 SELECT 不修改客户数据，[opportunityService.test.js](file:///c:/huakey-crm/backend/tests/opportunityService.test.js) 验证无 UPDATE crm_customer |

---

## 冻结声明

**客户中心已作为 CRM 基础模块冻结。**

除以下情况外，禁止继续修改客户中心：

1. **P0 Bug** - 影响生产数据正确性或服务可用性的严重缺陷
2. **安全漏洞** - 权限绕过、SQL 注入、XSS 等安全问题
3. **数据错误** - 数据损坏、状态流转错误、级联删除异常
4. **法规要求** - 合规性要求的强制修改

**禁止因为后续商机、报价、合同、订单、回款开发而再次修改客户中心架构。**

如确需修改，必须先提交 **RFC（架构变更说明）**，内容包括：
- 变更原因与背景
- 影响范围评估
- 兼容性方案
- 回滚方案
- 测试方案

经团队确认后才能实施。

---

## 冻结边界文件清单

以下文件属于客户中心冻结范围，修改需走 RFC 流程：

**后端路由：**
- `backend/routes/leads.js`
- `backend/routes/pool.js`
- `backend/routes/customers.js`
- `backend/routes/customer/`（整个目录）

**后端服务：**
- `backend/services/customerService.js`
- `backend/services/customerDetailService.js`
- `backend/services/leadsService.js`
- `backend/services/cronService.js`（客户相关部分）

**前端页面：**
- `frontend/src/views/leads/`
- `frontend/src/views/customer/`
- `frontend/src/views/pool/`
- `frontend/src/views/followup/`

**权限定义：**
- `backend/scripts/init_role_permissions.js`（客户相关权限码）
- `database/seeds/permission_data.sql`（客户相关权限）
- `database/migrations/098_leads_pool_permissions.sql`
- `database/migrations/100_unify_customer_permissions.sql`
- `database/migrations/101_unify_permission_naming.sql`

**文档：**
- `docs/customer-permission-standard.md`
- `docs/customer-center-freeze-v1.md`

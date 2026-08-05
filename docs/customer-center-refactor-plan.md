# 客户中心重构实施计划

> 制定日期：2026-08-04
> 依据文档：[docs/customer-domain-audit.md](file:///c:/huakey-crm/docs/customer-domain-audit.md)
> 当前分支：`refactor/customer-module-template`
> 最新迁移编号：096（下一编号从 097 起）
> 核心策略：**单表 `crm_customer` + 统一 `status` 生命周期模型**，渐进式 5 期改造，禁止一次性大范围重构
> 优先级约束：**保证现有客户、商机、合同、报价模块稳定**

---

## 实施状态（2026-08-04 Delta Audit 更新）

> 本计划已**全部执行完毕**，客户中心于 2026-08-04 冻结为 Customer Center v1.0。
> 下方原始 5 期方案保留作为执行依据，本节仅记录实际实施与原方案的偏离。

### 1. 5 期执行闭环

| 期次 | 原目标 | 实际状态 | 实施偏离说明 |
|------|--------|----------|--------------|
| 第 1 期 | P0 BUG 修复 + 097 迁移 | ✅ 完成 | 097 迁移实际范围**超出原方案**：原方案仅修复 `pool_status` 等价关系，实际 097 同时将 `status` 重命名为 `business_status`，并将 `pool_status` 从 TINYINT(0/1) 改为 VARCHAR('private'/'sea')。原 P0-2「releaseCustomer 不更新 status」因此**自动消解**——`sea` 已移出 `business_status`，由 `pool_status` 单独表达 |
| 第 2 期 | 架构统一（claim/release/assign 收敛 + 删死代码） | ✅ 完成 | `leadsService.js` 因仍被 `customerController` 调用 7 个方法，未整文件删除，仅标记为已知技术债 #1 |
| 第 3 期 | 状态字段统一（废弃 customer_type/lifecycle_status） | ✅ 完成 | 实际采用**双字段模型**（`business_status` + `pool_status`）而非原方案 §3.1 的单 `status` 字段模型，详见 [docs/customer-domain-audit.md](file:///c:/huakey-crm/docs/customer-domain-audit.md) Delta Audit §3 |
| 第 4 期 | 前端独立化（拆分 List.vue 为 leads/customer/pool） | ✅ 完成 | 路由 `/customer/list?tab=xxx` 已被 `/leads`、`/customers`、`/pool` 三条独立路由替代 |
| 第 5 期 | API 独立化（新增 /api/v1/leads、/pool、/customers） | ✅ 完成 | 旧 `/api/v1/customer/*` 端点保留为兼容层，内部转发到新 controller；权限码经 098/100/101 三次迁移完成统一 |

### 2. 迁移编号实际对应

| 原计划编号 | 原计划名称 | 实际编号 | 实际范围 |
|------------|------------|----------|----------|
| 097 | 修复客户状态字段不一致 | 097 | ✅ 包含原计划 + `status` → `business_status` 重命名 + `pool_status` 类型升级 |
| 098 | 客户查询索引优化 | 098 | ⚠️ 实际 098 用于新增 leads/pool 独立权限码（原计划 100 的内容） |
| 099 | 废弃 customer_type/lifecycle_status | — | 未单独迁移，通过 097 + 应用层停用实现 |
| 100 | 新增 leads/pool 独立权限码 | 100 | ✅ 删除旧码 `customer:pool` |
| 101 | 状态流转规则补全 | 101 | ⚠️ 实际 101 用于权限命名统一（`backup:create` → `backup:add`、`leads:create` → `leads:add`、删 `user:create`） |

> **重要**：原计划的迁移编号与实际执行存在错位。冻结版本以实际迁移文件为准：`database/migrations/097_*`、`098_*`、`100_*`、`101_*`。

### 3. 测试与构建结果（冻结时刻）

| 验证项 | 结果 |
|--------|------|
| 后端测试 | 100 suites / **978 passed** |
| 前端测试 | 9 suites / **37 passed** |
| 前端 Build | exit 0，无 Vue 编译警告（23.84s） |
| 后端 Lint | 0 errors，8 warnings（均为既有，非本次引入） |

### 4. 已知技术债（冻结时记录，不阻塞）

详见 [docs/customer-center-freeze-v1.md](file:///c:/huakey-crm/docs/customer-center-freeze-v1.md) §「已知技术债」共 8 项，其中与原计划相关的：
- `leadsService.js` @deprecated 标注矛盾（原计划第 2 期未完成项）
- `/customer/*` 兼容层端点保留（原计划 §6.2 兼容层设计的执行结果）
- `customer:list` 旧菜单码保留（原计划 §5.5 兼容策略的执行结果）

### 5. 后续模块开发约束

按冻结声明，商机 / 报价 / 合同 / 订单 / 回款 / 服务工单等后续模块**只能读取**客户中心数据，**不得修改**客户中心表结构、权限码、API 契约。如确需变更，必须先提交 RFC。

---

## 1. 改造目标

### 1.1 业务目标

| 目标 | 衡量标准 |
|---|---|
| 实现潜客池/客户管理/公海池三页面数据真正隔离 | 三个菜单点击后显示数据集无交集 |
| 统一客户生命周期状态机 | 单一 `status` 字段表达完整销售漏斗 |
| 支持完整 B2B CRM 流程 | lead → following → quoted → negotiating → signed → 回款 |
| 支持客户释放/认领闭环 | customer → sea → claim → 新负责人 |
| 消除三份重复实现 | claim/release/assign 仅保留一份实现 |
| 删除死代码 | leadsService.js 等未挂载代码清理 |

### 1.2 技术目标

| 目标 | 当前 | 目标 |
|---|---|---|
| 客户状态字段 | 3 个重叠（status/customer_type/lifecycle_status） | 1 个统一（status） |
| 列表 API 端点 | 1 个复用 | 3 个独立（leads/customers/pool） |
| 前端列表组件 | 1 个 List.vue 复用 | 3 个独立组件 |
| 权限码 | customer:list 复用 | leads:view / customer:view / pool:view 独立 |
| 公海实现 | 3 份不一致 | 1 份统一 |

### 1.3 不可逾越的红线

- 🔴 **不得破坏现有客户/商机/合同/报价模块的外键关联**
- 🔴 **不得在未备份情况下执行不可逆数据迁移**
- 🔴 **不得在同一 PR 中混合多个期次的改动**
- 🔴 **不得跳过测试直接上线**

---

## 2. 当前问题清单

### 2.1 P0 级问题（7 个，影响业务正确性）

| 编号 | 问题 | 文件:行号 | 修复期次 |
|---|---|---|---|
| P0-1 | `listCustomers` 传 status 时丢失 `deleted_at IS NULL` | [customerService.js:154](file:///c:/huakey-crm/backend/services/customerService.js#L154) | 第 1 期 |
| P0-2 | `customerService.releaseCustomer` 不更新 status | [customerService.js:579-581](file:///c:/huakey-crm/backend/services/customerService.js#L579-L581) | 第 1 期 |
| P0-3 | `convertToCustomer` 不更新 status | [customerService.js:710-738](file:///c:/huakey-crm/backend/services/customerService.js#L710-L738) | 第 1 期 |
| P0-4 | 088 迁移破坏 `owner_id IS NULL ⟺ pool_status=1` 等价关系 | [088_add_lead_pool.sql:27](file:///c:/huakey-crm/database/migrations/088_add_lead_pool.sql#L27) | 第 1 期 |
| P0-5 | 前端 List.vue watch 将 sea/customer tab 重置为 all | [List.vue:398-412](file:///c:/huakey-crm/frontend/src/views/customer/List.vue#L398-L412) | 第 1 期 |
| P0-6 | 潜客视图默认 status='following' 与 customer_type='prospect' 矛盾 | [List.vue:235](file:///c:/huakey-crm/frontend/src/views/customer/List.vue#L235) | 第 1 期 |
| P0-7 | `followUpService` 混用 status 和 lifecycle_status | [followUpService.js:78](file:///c:/huakey-crm/backend/services/followUpService.js#L78) | 第 1 期 |

### 2.2 P1 级问题（8 个，影响未来扩展）

| 编号 | 问题 | 文件 | 修复期次 |
|---|---|---|---|
| P1-1 | 三份重复的 claim/release/assign 实现 | customerService.js / poolService.js / assignService.js | 第 2 期 |
| P1-2 | 两套客户状态常量并存 | constants/customer.js vs customerStatus.js | 第 2 期 |
| P1-3 | leadsService.js 死代码 | backend/services/leadsService.js | 第 2 期 |
| P1-4 | 三个状态字段语义重叠 | crm_customer 表 | 第 3 期 |
| P1-5 | 前端两套 Tab 并存 | CustomerFilter.vue | 第 4 期 |
| P1-6 | 没有独立权限码 | Sidebar.vue | 第 5 期 |
| P1-7 | 没有独立 API 端点 | api/customer.js | 第 5 期 |
| P1-8 | assignService 角色码硬编码 | assignService.js:90 | 第 2 期 |

### 2.3 P2 级问题（4 个，体验优化）

| 编号 | 问题 | 修复期次 |
|---|---|---|
| P2-1 | "潜客"Tab 名 prospect 与维度混淆 | 第 4 期 |
| P2-2 | 状态选项含 lead 但编辑选项不含 | 第 4 期 |
| P2-3 | 菜单结构不合理 | 第 4 期 |
| P2-4 | 无 Pinia store 管理状态 | 第 5 期 |

---

## 3. 数据模型调整方案

### 3.1 总体策略

**保持 `crm_customer` 单表结构不变**，通过以下手段统一语义：

1. **`status` 字段升为唯一生命周期表达**：lead / sea / following / quoted / negotiating / signed / lost / paused
2. **`customer_type` 字段降级为只读派生字段**：根据 status 自动派生，不再写入
3. **`lifecycle_status` 字段废弃**：保留列但不读写，未来迁移删除
4. **`pool_status` 字段降级为缓存标记**：以 `owner_id IS NULL AND status IN ('lead','sea')` 为公海唯一标准
5. **新增 `is_lead` 派生列（可选）**：用于加速 lead 查询，由触发器或应用层维护

### 3.2 字段语义重定义

| 字段 | 旧语义 | 新语义 | 写入权限 |
|---|---|---|---|
| `status` | 销售漏斗阶段 | **唯一生命周期字段** | 仅 service 层写入 |
| `customer_type` | prospect/customer | **派生字段**：status=lead → prospect，其他 → customer | 应用层派生，禁止手动写 |
| `lifecycle_status` | 生命周期阶段 | **废弃**，保留列不读写 | 无 |
| `pool_status` | 0=私有/1=公海 | **缓存标记**：owner_id IS NULL AND status IN ('lead','sea') → 1 | 触发器或批量修复 |
| `owner_id` | 负责人 | **公海唯一判定标准**：NULL = 公海/线索 | service 层 |
| `protect_until` | 公海保护期 | 仅 sea 状态有值，lead 无保护期 | service 层 |

### 3.3 派生规则

```
客户类型判定：
  status = 'lead'                        → 潜客（线索池）
  status = 'sea'                         → 公海客户
  status IN ('following','quoted','negotiating','signed') AND owner_id IS NOT NULL → 正式客户
  status IN ('lost','paused')            → 流失/暂停（按 owner_id 判断归属）

公海判定（唯一标准）：
  owner_id IS NULL AND status IN ('lead', 'sea')
```

### 3.4 不新增的表

- ❌ 不新增 `crm_lead` 表
- ❌ 不新增 `crm_customer_pool` 表
- ❌ 不新增 `crm_public_pool` 表

### 3.5 索引优化

新增复合索引支撑高频查询：

```sql
-- 状态+归属联合索引（支撑三个列表页查询）
CREATE INDEX idx_customer_status_owner ON crm_customer(status, owner_id, deleted_at);
-- 公海查询索引
CREATE INDEX idx_customer_pool ON crm_customer(owner_id, status, protect_until, deleted_at);
```

---

## 4. 状态机设计

### 4.1 状态定义

| 状态码 | 名称 | 业务含义 | 终态 | owner_id |
|---|---|---|---|---|
| `lead` | 线索 | 新录入/导入，未被认领跟进 | 否 | NULL |
| `sea` | 公海 | 被释放回收的客户，等待重新认领 | 否 | NULL |
| `following` | 跟进中 | 已认领，正在跟进 | 否 | 非 NULL |
| `quoted` | 已报价 | 已生成报价单 | 否 | 非 NULL |
| `negotiating` | 谈判中 | 进入商务谈判 | 否 | 非 NULL |
| `signed` | 已签约 | 已签合同 | **是** | 非 NULL |
| `lost` | 已流失 | 客户流失 | **是** | 保留原值 |
| `paused` | 暂停跟进 | 暂停跟进，不计入逾期 | 否 | 保留原值 |

### 4.2 状态流转图

```
                    ┌─────────────────────────────────────────┐
                    ↓                                         │
[录入/导入] → lead(线索) ──认领──→ following(跟进中) ──释放──→ sea(公海)
                    │                       │                  │
                    │                       │                  │
                    └──直接释放──→ sea(公海) │                  │
                                            ↓                  ↓
                                       quoted(已报价) ←──认领──┘
                                            ↓
                                    negotiating(谈判中)
                                       │        │
                                       ↓        ↓
                                  signed(已签约) lost(已流失)
                                       │        ↑
                                       ↓        │
                                  lost(已流失)──┘
                                            ↑
                                       paused(暂停跟进)
                                            ↓
                                       following(恢复跟进)
```

### 4.3 流转规则表（驱动 `sys_customer_status_transition`）

| from | to | 触发动作 | require_permission | require_reason |
|---|---|---|---|---|
| lead | following | 认领线索 | `leads:claim` | 否 |
| lead | sea | 线索直接释放到公海 | `leads:release` | 否 |
| sea | following | 认领公海客户 | `pool:claim` | 否 |
| following | sea | 释放到公海 | `customer:release` | 否 |
| following | quoted | 创建报价时自动推进 | - | 否 |
| following | negotiating | 手动推进 | `customer:edit` | 否 |
| following | paused | 暂停跟进 | `customer:edit` | 是 |
| following | lost | 标记流失 | `customer:edit` | 是 |
| quoted | following | 回退到跟进中 | `customer:edit` | 否 |
| quoted | negotiating | 推进到谈判 | `customer:edit` | 否 |
| quoted | lost | 流失 | `customer:edit` | 是 |
| negotiating | signed | 签约（合同创建触发） | - | 否 |
| negotiating | quoted | 回退 | `customer:edit` | 否 |
| negotiating | lost | 流失 | `customer:edit` | 是 |
| paused | following | 恢复跟进 | `customer:edit` | 否 |
| lost | following | 重新激活 | `customer:manage` | 是 |
| signed | following | 退回跟进（需管理员） | `customer:manage` | 是 |
| signed | negotiating | 回退谈判 | `customer:manage` | 是 |

### 4.4 业务触发点

| 触发动作 | 状态变化 | 实现位置 |
|---|---|---|
| 录入线索 | (无) → lead | `leadsService.createLead` |
| 导入线索 | (无) → lead | `leadsService.importLeads` |
| 认领线索 | lead → following | `leadsService.claimLead` |
| 认领公海客户 | sea → following（设 7 天保护期） | `poolService.claimCustomer` |
| 释放客户 | following → sea | `poolService.releaseCustomer` |
| 创建报价 | following → quoted | `quoteService.createQuote` |
| 创建合同 | negotiating → signed | `contractService.createContract` |
| 跟进驱动 | lead/sea → following | `followUpService.addFollowUp` |

---

## 5. 前端页面拆分方案

### 5.1 目录结构（目标）

```
frontend/src/
├── views/
│   ├── leads/                    # 新增：潜客池
│   │   ├── List.vue
│   │   └── components/
│   │       └── LeadFilter.vue
│   ├── customer/                 # 重构：仅客户管理
│   │   ├── List.vue              # 仅显示正式客户
│   │   ├── Detail.vue
│   │   ├── AssignRules.vue
│   │   └── components/
│   │       ├── CustomerFilter.vue
│   │       ├── CustomerTable.vue
│   │       └── ... (保留现有)
│   └── pool/                     # 新增：公海池
│       ├── List.vue
│       └── components/
│           └── PoolFilter.vue
├── router/index.js               # 更新路由
├── components/layout/Sidebar.vue # 更新菜单
└── api/
    ├── leads.js                  # 新增
    ├── customer.js               # 瘦身
    └── pool.js                   # 新增
```

### 5.2 路由设计

| path | name | component | meta.permission | 说明 |
|---|---|---|---|---|
| `/leads` | LeadsList | `views/leads/List.vue` | `leads:view` | 潜客池 |
| `/customers` | CustomerList | `views/customer/List.vue` | `customer:view` | 客户管理 |
| `/customer/detail/:id` | CustomerDetail | `views/customer/Detail.vue` | `customer:view` | 客户详情（保留旧路径兼容） |
| `/customer/list` | (重定向) | - | - | 302 → `/customers` |
| `/customer/prospects` | (重定向) | - | - | 302 → `/leads` |
| `/pool` | PoolList | `views/pool/List.vue` | `pool:view` | 公海池 |
| `/followup/calendar` | FollowupCalendar | 保留 | `followup:calendar` | 跟进日历 |
| `/followup/template` | FollowupTemplate | 保留 | `followup:template` | 跟进模板 |

### 5.3 菜单结构（目标）

```
客户中心
├── 潜客池        (/leads)           [权限: leads:view]
├── 客户管理      (/customers)       [权限: customer:view]
├── 公海池        (/pool)            [权限: pool:view]
├── 跟进日历      (/followup/calendar)
└── 跟进模板      (/followup/template)
```

### 5.4 各页面数据范围

| 页面 | 数据范围（SQL 等价） | 独立功能 |
|---|---|---|
| 潜客池 | `status='lead' AND owner_id IS NULL AND deleted_at IS NULL` | 录入线索、导入线索、认领线索、批量认领 |
| 客户管理 | `status IN ('following','quoted','negotiating','signed','paused','lost') AND owner_id IS NOT NULL AND deleted_at IS NULL` | 编辑客户、跟进、转商机、转报价、签合同、释放到公海 |
| 公海池 | `status='sea' AND owner_id IS NULL AND deleted_at IS NULL` | 认领公海客户、批量认领、查看保护期 |

### 5.5 兼容策略

- 旧路径 `/customer/list?tab=xxx` 302 重定向到新路径，保留 6 个月
- 旧 API `/api/customer/list` 保留兼容层，内部按参数转发到新端点
- 旧权限码 `customer:list` 保留，映射到新权限码

---

## 6. API 拆分方案

### 6.1 新 API 端点设计

#### 线索管理 `/api/leads`

| Method | Path | 权限码 | 说明 |
|---|---|---|---|
| GET | `/api/leads` | `leads:view` | 线索列表（status='lead'） |
| POST | `/api/leads` | `leads:create` | 录入线索 |
| POST | `/api/leads/import` | `leads:create` | 批量导入线索 |
| POST | `/api/leads/:id/claim` | `leads:claim` | 认领线索（lead→following） |
| POST | `/api/leads/batch-claim` | `leads:claim` | 批量认领 |
| POST | `/api/leads/:id/convert` | `leads:convert` | 转化为客户（lead→following+customer_type=customer） |
| POST | `/api/leads/:id/release` | `leads:release` | 线索释放到公海（lead→sea） |

#### 客户管理 `/api/customers`

| Method | Path | 权限码 | 说明 |
|---|---|---|---|
| GET | `/api/customers` | `customer:view` | 客户列表（正式客户） |
| POST | `/api/customers` | `customer:add` | 新增客户 |
| GET | `/api/customers/:id` | `customer:view` | 客户详情 |
| PUT | `/api/customers/:id` | `customer:edit` | 编辑客户 |
| DELETE | `/api/customers/:id` | `customer:delete` | 删除客户 |
| POST | `/api/customers/:id/release` | `customer:release` | 释放到公海（following→sea） |
| POST | `/api/customers/:id/forward` | `customer:edit` | 状态推进 |
| POST | `/api/customers/:id/backward` | `customer:edit` | 状态回退 |
| POST | `/api/customers/assign` | `customer:assign` | 分配负责人 |
| POST | `/api/customers/export` | `customer:view` | 导出 |

#### 公海池 `/api/pool`

| Method | Path | 权限码 | 说明 |
|---|---|---|---|
| GET | `/api/pool` | `pool:view` | 公海列表（status='sea'） |
| POST | `/api/pool/:id/claim` | `pool:claim` | 认领公海客户（7天保护期） |
| POST | `/api/pool/batch-claim` | `pool:claim` | 批量认领 |
| POST | `/api/pool/:id/assign` | `pool:assign` | 管理员分配 |
| GET | `/api/pool/logs` | `pool:view` | 公海操作日志 |

### 6.2 兼容层设计

旧端点保留 6 个月（至 2027-02-04），内部转发规则：

| 旧端点 | 新端点 | 转发规则 |
|---|---|---|
| `POST /api/customer/list` | `GET /api/leads` 或 `/api/customers` 或 `/api/pool` | 按 `customer_type` / `unassigned` 参数路由 |
| `POST /api/customer/add` | `POST /api/leads` 或 `POST /api/customers` | 按 `customer_type` 参数路由 |
| `POST /api/customer/claim` | `POST /api/pool/:id/claim` 或 `/api/leads/:id/claim` | 按 `status` 字段路由 |
| `POST /api/customer/release` | `POST /api/customers/:id/release` | 直接转发 |
| `POST /api/customer/convert-to-customer` | `POST /api/leads/:id/convert` | 直接转发 |
| `POST /api/customer/forward` | `POST /api/customers/:id/forward` | 直接转发 |

### 6.3 文件组织

```
backend/routes/
├── leads.js              # 新增
├── customers.js          # 新增（替代 customer/detail.js 的列表/CRUD）
├── pool.js               # 新增（替代 customer/assign.js 的公海部分）
└── customer/             # 旧目录保留兼容
    ├── index.js          # 兼容层，内部转发
    ├── detail.js         # 兼容层
    ├── assign.js         # 兼容层
    ├── contact.js        # 保留（联系人独立模块）
    └── import.js         # 兼容层

backend/services/
├── leadsService.js       # 重写（清理死代码，实现真实逻辑）
├── customerService.js    # 瘦身（移除 claim/release/manualAssign）
├── poolService.js        # 保留（统一公海实现）
└── assignService.js      # 保留（统一分配实现）
```

---

## 7. 数据修复迁移方案

### 7.1 迁移编号规划

| 迁移编号 | 名称 | 期次 | 风险 |
|---|---|---|---|
| 097 | 修复客户状态字段不一致 | 第 1 期 | 🔴 高 |
| 098 | 客户查询索引优化 | 第 1 期 | 🟢 低 |
| 099 | 废弃 customer_type/lifecycle_status 字段（保留列，停用） | 第 3 期 | 🟡 中 |
| 100 | 新增 leads/pool 独立权限码 | 第 5 期 | 🟡 中 |
| 101 | 状态流转规则补全 | 第 3 期 | 🟢 低 |

### 7.2 迁移 097：修复客户状态字段不一致

**文件**：`database/migrations/097_fix_customer_status_consistency.sql`

```sql
-- 097: 修复客户状态字段不一致
-- 1. 修复 088 迁移破坏的 pool_status 等价关系
-- lead 客户 owner_id IS NULL 但 pool_status=0，统一设为 pool_status=1
UPDATE crm_customer
SET pool_status = 1
WHERE status = 'lead' AND owner_id IS NULL AND pool_status = 0 AND deleted_at IS NULL;

-- 2. 修复 customerService.releaseCustomer 产生的脏数据
-- owner_id IS NULL 但 status 不是 sea/lead 的客户，统一设为 sea
UPDATE crm_customer
SET status = 'sea', pool_status = 1
WHERE owner_id IS NULL AND status NOT IN ('sea', 'lead') AND deleted_at IS NULL;

-- 3. 修复 convertToCustomer 产生的脏数据
-- customer_type='customer' 但 status='lead' 的客户，统一设为 status='following'
UPDATE crm_customer
SET status = 'following', pool_status = 0
WHERE customer_type = 'customer' AND status = 'lead' AND deleted_at IS NULL;

-- 4. 修复 owner_id 不为空但 pool_status=1 的不一致
UPDATE crm_customer
SET pool_status = 0
WHERE owner_id IS NOT NULL AND pool_status = 1 AND deleted_at IS NULL;

-- 5. 验证查询
SELECT '=== 修复后状态分布 ===' AS step;
SELECT status, COUNT(*) AS cnt FROM crm_customer WHERE deleted_at IS NULL GROUP BY status ORDER BY status;
SELECT '=== 公海一致性检查 ===' AS step;
SELECT 
  SUM(CASE WHEN owner_id IS NULL AND pool_status = 1 THEN 1 ELSE 0 END) AS pool_consistent,
  SUM(CASE WHEN owner_id IS NULL AND pool_status = 0 THEN 1 ELSE 0 END) AS pool_inconsistent,
  SUM(CASE WHEN owner_id IS NOT NULL AND pool_status = 0 THEN 1 ELSE 0 END) AS owner_consistent,
  SUM(CASE WHEN owner_id IS NOT NULL AND pool_status = 1 THEN 1 ELSE 0 END) AS owner_inconsistent
FROM crm_customer WHERE deleted_at IS NULL;
```

**回滚**：`097_fix_customer_status_consistency_down.sql`（仅记录修复前后快照，无法逆向恢复原脏数据）

### 7.3 迁移 098：客户查询索引优化

**文件**：`database/migrations/098_customer_query_indexes.sql`

```sql
-- 098: 客户查询索引优化
-- 检查并创建复合索引

-- 索引 1: 支撑三个列表页查询（status + owner_id + deleted_at）
SET @idx1_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_customer_status_owner');
SET @sql1 = IF(@idx1_exists = 0,
  'CREATE INDEX idx_customer_status_owner ON crm_customer(status, owner_id, deleted_at)',
  'SELECT 1');
PREPARE stmt1 FROM @sql1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

-- 索引 2: 支撑公海查询（owner_id + status + protect_until）
SET @idx2_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_customer_pool');
SET @sql2 = IF(@idx2_exists = 0,
  'CREATE INDEX idx_customer_pool ON crm_customer(owner_id, status, protect_until, deleted_at)',
  'SELECT 1');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
```

### 7.4 迁移 099：废弃冗余字段

**文件**：`database/migrations/099_deprecate_redundant_fields.sql`（第 3 期）

```sql
-- 099: 废弃 customer_type 和 lifecycle_status 字段
-- 不删除列（避免影响旧代码），仅修改注释标记废弃
ALTER TABLE crm_customer MODIFY COLUMN customer_type VARCHAR(32) NULL 
  COMMENT '已废弃-统一用 status 字段';
ALTER TABLE crm_customer MODIFY COLUMN lifecycle_status VARCHAR(32) NULL 
  COMMENT '已废弃-统一用 status 字段';

-- 同步派生 customer_type（根据 status）
UPDATE crm_customer SET customer_type = 'prospect' 
  WHERE status = 'lead' AND deleted_at IS NULL;
UPDATE crm_customer SET customer_type = 'customer' 
  WHERE status IN ('following','quoted','negotiating','signed','lost','paused') AND deleted_at IS NULL;
```

### 7.5 迁移 100：新增权限码

**文件**：`database/migrations/100_add_leads_pool_permissions.sql`（第 5 期）

```sql
-- 100: 新增 leads/pool 独立权限码
INSERT IGNORE INTO sys_permission (code, name, type, is_visible, parent_id) VALUES
('leads', '潜客池', 'menu', 1, <客户中心父ID>),
('leads:view', '查看线索', 'api', 0, NULL),
('leads:create', '录入线索', 'api', 0, NULL),
('leads:claim', '认领线索', 'api', 0, NULL),
('leads:convert', '转化为客户', 'api', 0, NULL),
('leads:release', '释放线索', 'api', 0, NULL),
('pool', '公海池', 'menu', 1, <客户中心父ID>),
('pool:view', '查看公海', 'api', 0, NULL),
('pool:claim', '认领公海客户', 'api', 0, NULL),
('pool:assign', '分配公海客户', 'api', 0, NULL);

-- 权限映射：原 customer:list → customer:view + leads:view + pool:view
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'customer:list'
JOIN sys_permission p_dst ON p_dst.code IN ('leads:view', 'customer:view', 'pool:view')
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);

-- 原 customer:pool → pool:view + pool:claim
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'customer:pool'
JOIN sys_permission p_dst ON p_dst.code IN ('pool:view', 'pool:claim')
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);
```

### 7.6 迁移 101：状态流转规则补全

**文件**：`database/migrations/101_complete_status_transitions.sql`（第 3 期）

```sql
-- 101: 补全状态流转规则
INSERT IGNORE INTO sys_customer_status_transition (from_code, to_code, require_permission, require_reason) VALUES
('lead', 'following', 'leads:claim', 0),
('lead', 'sea', 'leads:release', 0),
('following', 'sea', 'customer:release', 0),
('following', 'paused', 'customer:edit', 1),
('paused', 'following', 'customer:edit', 0);
```

---

## 8. 每阶段修改文件列表

### 第 1 期：P0 BUG 修复（1-2 天，风险 🔴 高）

**目标**：修复 7 个 P0 问题，零架构变更，保证业务正确性

#### 后端修改

| 文件 | 修改内容 | 行号 | 风险 |
|---|---|---|---|
| [backend/services/customerService.js](file:///c:/huakey-crm/backend/services/customerService.js) | L154：`whereClause` 补充 `AND c.deleted_at IS NULL` | L154 | 🔴 |
| [backend/services/customerService.js](file:///c:/huakey-crm/backend/services/customerService.js) | L579-581：releaseCustomer 补充 `status = 'sea'` | L579-581 | 🔴 |
| [backend/services/customerService.js](file:///c:/huakey-crm/backend/services/customerService.js) | L710-738：convertToCustomer 补充 `status = 'following'` | L710-738 | 🔴 |
| [backend/services/followUpService.js](file:///c:/huakey-crm/backend/services/followUpService.js) | L78：修正 `'new'` 比较，改为检查 `lifecycle_status` 而非 `status` | L78 | 🔴 |

#### 前端修改

| 文件 | 修改内容 | 行号 | 风险 |
|---|---|---|---|
| [frontend/src/views/customer/List.vue](file:///c:/huakey-crm/frontend/src/views/customer/List.vue) | L398-412：watch 补充 `sea` 和 `customer` 分支处理 | L398-412 | 🔴 |
| [frontend/src/views/customer/List.vue](file:///c:/huakey-crm/frontend/src/views/customer/List.vue) | L235：移除 `isProspectView ? 'following' : ''` 默认值 | L235 | 🔴 |

#### 数据库迁移

| 迁移 | 文件 | 风险 |
|---|---|---|
| 097 | `database/migrations/097_fix_customer_status_consistency.sql` | 🔴 高（需先备份） |
| 098 | `database/migrations/098_customer_query_indexes.sql` | 🟢 低 |

#### 不修改的文件

- ❌ 不修改 routes 层
- ❌ 不修改 controllers 层
- ❌ 不修改 opportunityService/quoteService/contractService
- ❌ 不修改 Sidebar.vue 菜单结构

### 第 2 期：架构统一（3-5 天，风险 🟡 中）

**目标**：消除三份重复实现，删除死代码，统一状态常量

#### 后端修改

| 文件 | 修改内容 | 风险 |
|---|---|---|
| [backend/services/customerService.js](file:///c:/huakey-crm/backend/services/customerService.js) | 删除 L445-588 的 claimCustomer/releaseCustomer/manualAssign/batchAssignCustomers | 🟡 |
| [backend/services/customerService.js](file:///c:/huakey-crm/backend/services/customerService.js) | 删除 L710-738 的 convertToCustomer（迁移到 leadsService） | 🟡 |
| [backend/services/leadsService.js](file:///c:/huakey-crm/backend/services/leadsService.js) | 重写：实现 createLead/importLeads/claimLead/convertLead/releaseLead | 🟡 |
| [backend/services/poolService.js](file:///c:/huakey-crm/backend/services/poolService.js) | 保留作为唯一公海实现 | 🟢 |
| [backend/services/assignService.js](file:///c:/huakey-crm/backend/services/assignService.js) | 保留作为唯一分配实现，L90 修正角色码硬编码 | 🟡 |
| [backend/controllers/customerController.js](file:///c:/huakey-crm/backend/controllers/customerController.js) | 删除 L25-31 leadsService 引用，删除 L166-231 未挂载的 leads handler | 🟡 |
| [backend/constants/customer.js](file:///c:/huakey-crm/backend/constants/customer.js) | 删除文件（旧版数值常量） | 🟡 |
| [backend/constants/customerStatus.js](file:///c:/huakey-crm/backend/constants/customerStatus.js) | 保留作为唯一状态常量源 | 🟢 |

#### 检查依赖

需扫描全项目 `require('../constants/customer')` 引用并迁移到 `customerStatus.js`：

```bash
# 搜索命令
grep -rn "require.*constants/customer'" backend/
grep -rn "require.*constants/customer\"" backend/
```

#### 不修改的文件

- ❌ 不修改 routes 层
- ❌ 不修改前端
- ❌ 不修改数据库 schema

### 第 3 期：状态字段统一（5-7 天，风险 🟡 中）

**目标**：废弃 customer_type/lifecycle_status，统一用 status

#### 后端修改

| 文件 | 修改内容 | 风险 |
|---|---|---|
| [backend/services/customerService.js](file:///c:/huakey-crm/backend/services/customerService.js) | listCustomers 移除 customer_type/lifecycle_status 筛选分支（L191-198） | 🟡 |
| [backend/services/customerService.js](file:///c:/huakey-crm/backend/services/customerService.js) | getCustomer 查询移除 customer_type/lifecycle_status 字段 | 🟡 |
| [backend/routes/customer/detail.js](file:///c:/huakey-crm/backend/routes/customer/detail.js) | customerListSchema 移除 customer_type/lifecycle_status 校验（L22-23） | 🟡 |
| [backend/routes/customer/detail.js](file:///c:/huakey-crm/backend/routes/customer/detail.js) | addCustomerSchema/updateCustomerSchema 移除相关字段 | 🟡 |
| [backend/services/followUpService.js](file:///c:/huakey-crm/backend/services/followUpService.js) | L47-57：移除 follow_status/lifecycle_status 更新，仅更新 last_follow_time | 🟡 |
| [backend/services/customerDetailService.js](file:///c:/huakey-crm/backend/services/customerDetailService.js) | 检查并移除 customer_type/lifecycle_status 写入 | 🟡 |
| [backend/services/quoteService.js](file:///c:/huakey-crm/backend/services/quoteService.js) | 检查 status 引用，确保兼容新状态机 | 🟡 |
| [backend/services/contractService.js](file:///c:/huakey-crm/backend/services/contractService.js) | 检查 status 引用 | 🟡 |
| [backend/services/opportunityService.js](file:///c:/huakey-crm/backend/services/opportunityService.js) | 检查 status 引用 | 🟡 |

#### 数据库迁移

| 迁移 | 文件 | 风险 |
|---|---|---|
| 099 | `database/migrations/099_deprecate_redundant_fields.sql` | 🟡 中 |
| 101 | `database/migrations/101_complete_status_transitions.sql` | 🟢 低 |

#### 不修改的文件

- ❌ 不修改前端
- ❌ 不修改 routes 层路由路径

### 第 4 期：前端页面拆分（5-7 天，风险 🟡 中）

**目标**：拆分 List.vue 为三个独立页面，实现真正数据隔离

#### 前端新增

| 文件 | 说明 | 风险 |
|---|---|---|
| `frontend/src/views/leads/List.vue` | 新增：潜客池页面 | 🟡 |
| `frontend/src/views/leads/components/LeadFilter.vue` | 新增：潜客筛选器 | 🟡 |
| `frontend/src/views/pool/List.vue` | 新增：公海池页面 | 🟡 |
| `frontend/src/views/pool/components/PoolFilter.vue` | 新增：公海筛选器 | 🟡 |
| `frontend/src/api/leads.js` | 新增：线索 API | 🟡 |
| `frontend/src/api/pool.js` | 新增：公海 API | 🟡 |

#### 前端修改

| 文件 | 修改内容 | 风险 |
|---|---|---|
| [frontend/src/views/customer/List.vue](file:///c:/huakey-crm/frontend/src/views/customer/List.vue) | 瘦身：移除 tab 切换逻辑，仅显示正式客户 | 🟡 |
| [frontend/src/views/customer/components/CustomerFilter.vue](file:///c:/huakey-crm/frontend/src/views/customer/components/CustomerFilter.vue) | 移除快捷 Tab 的"线索池/公海"选项，仅保留"我的客户/全部客户/久未跟进" | 🟡 |
| [frontend/src/router/index.js](file:///c:/huakey-crm/frontend/src/router/index.js) | 新增 `/leads`、`/pool` 路由，旧路由设为重定向 | 🟡 |
| [frontend/src/components/layout/Sidebar.vue](file:///c:/huakey-crm/frontend/src/components/layout/Sidebar.vue) | 菜单结构调整：潜客池/客户管理/公海池三个独立菜单项 | 🟡 |
| [frontend/src/api/customer.js](file:///c:/huakey-crm/frontend/src/api/customer.js) | 瘦身：移除 claim/release/batchClaim 等公海相关 API | 🟡 |

#### 不修改的文件

- ❌ 不修改后端
- ❌ 不修改数据库

### 第 5 期：API 独立化（7-10 天，风险 🟡 中）

**目标**：提供独立 API 端点，旧端点保留兼容层

#### 后端新增

| 文件 | 说明 | 风险 |
|---|---|---|
| `backend/routes/leads.js` | 新增：线索路由 | 🟡 |
| `backend/routes/customers.js` | 新增：客户管理路由 | 🟡 |
| `backend/routes/pool.js` | 新增：公海路由 | 🟡 |
| `backend/controllers/leadsController.js` | 新增：线索控制器 | 🟡 |
| `backend/controllers/poolController.js` | 新增：公海控制器 | 🟡 |

#### 后端修改

| 文件 | 修改内容 | 风险 |
|---|---|---|
| [backend/routes/customer/index.js](file:///c:/huakey-crm/backend/routes/customer/index.js) | 改为兼容层：内部转发到新路由 | 🟡 |
| [backend/routes/customer/detail.js](file:///c:/huakey-crm/backend/routes/customer/detail.js) | 改为兼容层 | 🟡 |
| [backend/routes/customer/assign.js](file:///c:/huakey-crm/backend/routes/customer/assign.js) | 公海部分迁移到 pool.js，保留分配部分 | 🟡 |
| [backend/app.js](file:///c:/huakey-crm/backend/app.js) | 挂载新路由 `/api/leads`、`/api/customers`、`/api/pool` | 🟡 |

#### 数据库迁移

| 迁移 | 文件 | 风险 |
|---|---|---|
| 100 | `database/migrations/100_add_leads_pool_permissions.sql` | 🟡 中 |

#### 前端修改

| 文件 | 修改内容 | 风险 |
|---|---|---|
| [frontend/src/api/leads.js](file:///c:/huakey-crm/frontend/src/api/leads.js) | 切换到新端点 `/api/leads` | 🟢 |
| [frontend/src/api/pool.js](file:///c:/huakey-crm/frontend/src/api/pool.js) | 切换到新端点 `/api/pool` | 🟢 |
| [frontend/src/api/customer.js](file:///c:/huakey-crm/frontend/src/api/customer.js) | 切换到新端点 `/api/customers` | 🟢 |

---

## 9. 每阶段测试方案

### 9.1 第 1 期测试方案

#### 9.1.1 单元测试

| 测试项 | 测试文件 | 验证内容 |
|---|---|---|
| listCustomers deleted_at 修复 | `backend/tests/customerService.test.js` | 传 status 时返回结果不含已删除客户 |
| releaseCustomer status 更新 | `backend/tests/customerService.test.js` | 释放后 status='sea' |
| convertToCustomer status 更新 | `backend/tests/customerService.test.js` | 转化后 status='following' |
| followUpService 状态推进 | `backend/tests/followUpService.test.js` | 'new' lifecycle_status 不再被当作 status 比较 |

#### 9.1.2 E2E 测试

| 测试场景 | 验证步骤 |
|---|---|
| 公海池菜单显示公海客户 | 点击"公海池"菜单 → 列表只显示 owner_id IS NULL 的客户 |
| 正式客户菜单显示正式客户 | 点击"正式客户"菜单 → 列表只显示 owner_id IS NOT NULL 的客户 |
| 潜客池菜单显示潜客 | 点击"潜客池"菜单 → 列表只显示 status='lead' 的客户 |
| 潜客转化 | 点击转化按钮 → 客户 status 变为 following，customer_type 变为 customer |
| 释放到公海 | 点击释放按钮 → 客户 status 变为 sea，owner_id 变为 NULL |

#### 9.1.3 数据验证脚本

```sql
-- 验证 097 迁移后数据一致性
SELECT 
  '公海一致性' AS check_item,
  SUM(CASE WHEN owner_id IS NULL AND pool_status = 1 THEN 1 ELSE 0 END) AS consistent,
  SUM(CASE WHEN owner_id IS NULL AND pool_status = 0 THEN 1 ELSE 0 END) AS inconsistent
FROM crm_customer WHERE deleted_at IS NULL AND status IN ('lead', 'sea')
UNION ALL
SELECT 
  '私有客户一致性',
  SUM(CASE WHEN owner_id IS NOT NULL AND pool_status = 0 THEN 1 ELSE 0 END),
  SUM(CASE WHEN owner_id IS NOT NULL AND pool_status = 1 THEN 1 ELSE 0 END)
FROM crm_customer WHERE deleted_at IS NULL AND status NOT IN ('lead', 'sea');
```

#### 9.1.4 回归测试

- ✅ 运行现有 E2E 测试套件（40 个测试）
- ✅ 手动验证商机/报价/合同创建流程
- ✅ 验证跟进记录创建后状态推进

### 9.2 第 2 期测试方案

#### 9.2.1 重复实现消除验证

| 测试项 | 验证内容 |
|---|---|
| claimCustomer 统一 | 认领操作走 poolService，不再走 customerService |
| releaseCustomer 统一 | 释放操作走 poolService |
| manualAssign 统一 | 分配操作走 assignService |
| leadsService 重写 | createLead/claimLead/convertLead 正常工作 |

#### 9.2.2 死代码删除验证

```bash
# 验证 leadsService 旧 handler 不再被引用
grep -rn "listLeads\|convertLead\|batchConvertLeads\|importLeads\|claimLead\|markLeadLost\|getLeadsStats" backend/routes/
# 应返回空
```

#### 9.2.3 常量统一验证

```bash
# 验证旧常量不再被引用
grep -rn "require.*constants/customer'" backend/
# 应返回空（除非兼容层）
```

### 9.3 第 3 期测试方案

#### 9.3.1 状态字段统一验证

| 测试项 | 验证内容 |
|---|---|
| listCustomers 不再支持 customer_type 筛选 | 传 customer_type 参数无效 |
| listCustomers 不再支持 lifecycle_status 筛选 | 传 lifecycle_status 参数无效 |
| followUpService 不再更新 lifecycle_status | 跟进后 lifecycle_status 不变 |
| 状态流转规则完整 | 所有状态转换符合 101 迁移定义 |

#### 9.3.2 关联模块回归

| 模块 | 验证内容 |
|---|---|
| 商机模块 | 创建商机时 customer.status 查询正常 |
| 报价模块 | 创建报价时 following→quoted 推进正常 |
| 合同模块 | 创建合同时 negotiating→signed 推进正常 |
| 跟进模块 | 跟进后 last_follow_time 更新正常 |

### 9.4 第 4 期测试方案

#### 9.4.1 页面隔离验证

| 测试场景 | 验证内容 |
|---|---|
| 潜客池页面数据范围 | 列表仅显示 status='lead' 的客户 |
| 客户管理页面数据范围 | 列表仅显示 status IN ('following','quoted','negotiating','signed','paused','lost') 且 owner_id IS NOT NULL |
| 公海池页面数据范围 | 列表仅显示 status='sea' AND owner_id IS NULL |
| 三个页面数据无交集 | 三个列表的客户 ID 集合无交集 |

#### 9.4.2 路由兼容验证

| 测试场景 | 验证内容 |
|---|---|
| 旧路径 `/customer/list?tab=prospect` | 302 重定向到 `/leads` |
| 旧路径 `/customer/list?tab=sea` | 302 重定向到 `/pool` |
| 旧路径 `/customer/list` | 302 重定向到 `/customers` |

### 9.5 第 5 期测试方案

#### 9.5.1 新端点功能测试

| 端点 | 验证内容 |
|---|---|
| `GET /api/leads` | 返回 status='lead' 的客户 |
| `GET /api/customers` | 返回正式客户 |
| `GET /api/pool` | 返回 status='sea' AND owner_id IS NULL |
| `POST /api/leads/:id/claim` | lead → following |
| `POST /api/pool/:id/claim` | sea → following + 7天保护期 |

#### 9.5.2 兼容层测试

| 旧端点 | 验证内容 |
|---|---|
| `POST /api/customer/list` | 按参数转发到新端点，返回结果一致 |
| `POST /api/customer/claim` | 转发到 `/api/pool/:id/claim` 或 `/api/leads/:id/claim` |
| `POST /api/customer/release` | 转发到 `/api/customers/:id/release` |

#### 9.5.3 权限测试

| 测试项 | 验证内容 |
|---|---|
| 仅有 leads:view 权限的角色 | 只能访问 /api/leads，不能访问 /api/customers |
| 仅有 pool:view 权限的角色 | 只能访问 /api/pool |
| 有 customer:view 权限的角色 | 只能访问 /api/customers |

---

## 10. 回滚方案

### 10.1 代码回滚

每期独立 PR，回滚策略：

```bash
# 第 N 期回滚
git revert <第N期最后commit SHA>
git push origin <branch>
```

### 10.2 数据库回滚

每个迁移配套 `_down.sql`：

| 迁移 | 回滚文件 | 回滚策略 |
|---|---|---|
| 097 | `097_fix_customer_status_consistency_down.sql` | ⚠️ 仅记录修复前快照，**无法逆向恢复原脏数据**，回滚需从快照恢复 |
| 098 | `098_customer_query_indexes_down.sql` | `DROP INDEX idx_customer_status_owner; DROP INDEX idx_customer_pool;` |
| 099 | `099_deprecate_redundant_fields_down.sql` | 恢复 customer_type/lifecycle_status 注释 |
| 100 | `100_add_leads_pool_permissions_down.sql` | DELETE 新增权限 + 恢复 customer:pool 可见性 |
| 101 | `101_complete_status_transitions_down.sql` | DELETE 新增流转规则 |

### 10.3 第 1 期回滚特殊说明

⚠️ **097 迁移不可逆**：修复前的脏数据状态无法恢复。

**回滚前必须**：
1. 执行 097 迁移前先全量备份 `crm_customer` 表：
   ```bash
   mysqldump -u root -p huakey_crm crm_customer > backups/crm_customer_pre_097_$(date +%Y%m%d).sql
   ```
2. 记录修复前状态快照：
   ```sql
   CREATE TABLE crm_customer_pre_097_snapshot AS 
   SELECT id, status, customer_type, lifecycle_status, pool_status, owner_id, deleted_at 
   FROM crm_customer WHERE deleted_at IS NULL;
   ```
3. 回滚时从快照恢复：
   ```sql
   UPDATE crm_customer c 
   JOIN crm_customer_pre_097_snapshot s ON c.id = s.id
   SET c.status = s.status, 
       c.customer_type = s.customer_type, 
       c.lifecycle_status = s.lifecycle_status, 
       c.pool_status = s.pool_status;
   ```

### 10.4 灰度发布策略

| 期次 | 灰度方式 | 灰度比例 |
|---|---|---|
| 第 1 期 | 功能开关：`FEATURE_CUSTOMER_FIX_V1=true` | 100%（BUG 修复必须全量） |
| 第 2 期 | 不需要灰度（架构统一，行为等价） | 100% |
| 第 3 期 | 功能开关：`FEATURE_STATUS_UNIFY=true` | 先 10% → 50% → 100% |
| 第 4 期 | 路由重定向灰度：按用户角色分批 | 先销售组 → 经理组 → 全员 |
| 第 5 期 | API 灰度：新端点先内测 | 先 10% → 50% → 100% |

### 10.5 监控告警

每期上线后监控以下指标：

| 指标 | 告警阈值 | 实现 |
|---|---|---|
| 客户列表查询错误率 | > 1% | Prometheus + Grafana |
| 认领/释放操作失败率 | > 0.5% | 同上 |
| 状态推进失败率 | > 0.5% | 同上 |
| 前端 404 错误（路由重定向失败） | > 5% | Sentry |
| 数据一致性检查 | 公海不一致数 > 0 | 定时任务每小时检查 |

---

## 附录 A：改造路线甘特图

```
2026-08-04 ─┬─ 第 1 期：P0 BUG 修复（1-2 天）
            │   ├─ 后端 4 处修改
            │   ├─ 前端 2 处修改
            │   ├─ 迁移 097 + 098
            │   └─ 测试：单元 + E2E + 数据校验
            │
2026-08-06 ─┼─ 第 2 期：架构统一（3-5 天）
            │   ├─ 删除 customerService 重复实现
            │   ├─ 重写 leadsService
            │   ├─ 删除死代码
            │   └─ 测试：重复实现消除 + 死代码验证
            │
2026-08-11 ─┼─ 第 3 期：状态字段统一（5-7 天）
            │   ├─ 移除 customer_type/lifecycle_status 读写
            │   ├─ 迁移 099 + 101
            │   ├─ 关联模块回归
            │   └─ 测试：状态字段统一 + 关联回归
            │
2026-08-18 ─┼─ 第 4 期：前端页面拆分（5-7 天）
            │   ├─ 新建 leads/pool 页面
            │   ├─ 重构 customer/List.vue
            │   ├─ 路由 + 菜单更新
            │   └─ 测试：页面隔离 + 路由兼容
            │
2026-08-25 ─┼─ 第 5 期：API 独立化（7-10 天）
            │   ├─ 新建 leads/customers/pool 路由
            │   ├─ 旧端点改兼容层
            │   ├─ 迁移 100
            │   └─ 测试：新端点 + 兼容层 + 权限
            │
2026-09-04 ─┴─ 完成
```

## 附录 B：风险等级说明

| 等级 | 含义 | 应对措施 |
|---|---|---|
| 🔴 高 | 影响业务正确性，可能导致数据泄露/丢失 | 必须备份、灰度、人工验证 |
| 🟡 中 | 影响功能可用性，但可回滚 | 灰度发布、监控告警 |
| 🟢 低 | 影响可维护性/性能 | 常规发布 |

## 附录 C：依赖关系矩阵

```
第 1 期（P0 修复）──┐
                    ├─→ 第 2 期（架构统一）──→ 第 3 期（字段统一）──┐
                    │                                                  ├─→ 第 5 期（API 独立化）
                    └──────────────────────────→ 第 4 期（前端拆分）──┘
```

- 第 2 期依赖第 1 期（先修复 BUG 再重构）
- 第 3 期依赖第 2 期（先统一实现再统一字段）
- 第 4 期可与第 3 期并行（前端独立于后端字段统一）
- 第 5 期依赖第 3 期和第 4 期（API 拆分需要字段统一和前端就绪）

---

**本计划遵循"渐进式改造、优先保证稳定性"原则，禁止跨期混合改动。每期完成后需通过完整测试并经用户确认，方可进入下一期。**

**等待用户确认后，再开始执行第 1 期 P0 BUG 修复。**

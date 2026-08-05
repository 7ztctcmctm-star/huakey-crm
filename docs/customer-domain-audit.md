# 客户中心领域审计报告

> 审计日期：2026-08-04
> 审计范围：huakey-crm 客户管理模块（前端 + 后端 + 数据库）
> 审计分支：`refactor/customer-module-template`
> 审计方法：基于实际代码静态分析，所有结论引用具体文件路径与行号
> 严重等级：**P0** 影响业务正确性 ｜ **P1** 影响未来扩展 ｜ **P2** 体验优化

---

## Delta Audit 更新（2026-08-04，Customer Center v1.0 冻结后）

> 本节为 **增量审计（Delta Audit）**，仅记录冻结后发生的变化，不重写下方原始审计内容。
> 原始审计（§1–§8）保留作为重构前快照，供回溯使用。

### 1. 冻结状态

客户中心已于 2026-08-04 冻结为 **Customer Center v1.0**。
冻结声明见 [docs/customer-center-freeze-v1.md](file:///c:/huakey-crm/docs/customer-center-freeze-v1.md)。
除 P0 Bug / 安全漏洞 / 数据错误 / 法规要求外，禁止修改客户中心架构、表结构、权限码、API 契约。

### 2. 原审计问题闭环状态

| 编号 | 原等级 | 当前状态 | 关闭依据 |
|------|--------|----------|----------|
| P0-1 | P0 | ✅ 已关闭 | `customerService.js:775` 现实现为 `WHERE ${permissionWhere} AND c.business_status = ? AND c.deleted_at IS NULL`，`deleted_at IS NULL` 已并入主 whereClause |
| P0-2 | P0 | ✅ 已关闭 | 架构调整：`releaseCustomer`（customerService.js:586-589）现只更新 `pool_status=POOL_STATUS.SEA`，**不再需要改 status**——`sea` 已从 `business_status` 移除，公海归属改由 `pool_status` 单独表达（迁移 097） |
| P0-3 | P0 | ✅ 已关闭 | 潜客转化路径已重写为 `/api/v1/leads/convert`（routes/leads.js），不再走旧 `convertToCustomer` 旧字段路径 |
| P0-4 | P0 | ✅ 已关闭 | 迁移 097 重设 `pool_status`，并改为 VARCHAR('private'/'sea')，原 TINYINT(0/1) 语义重定义。等价关系改为 `pool_status='sea' ⟺ owner_id IS NULL AND business_status != 'lead'` |
| P0-5 | P0 | ✅ 已关闭 | 前端 List.vue 拆分为三个独立页面 `views/leads/List.vue`、`views/customer/List.vue`、`views/pool/List.vue`，watch 缺陷随组件拆分消除 |
| P0-6 | P0 | ✅ 已关闭 | 同上，潜客视图独立为 `views/leads/List.vue`，不再与正式客户复用同一组件 |
| P0-7 | P0 | ✅ 已关闭 | 状态字段拆分后，`business_status` 只承载销售漏斗阶段，`pool_status` 承载池归属，原 `status`/`lifecycle_status` 混用问题不复存在 |
| P1-1 | P1 | ✅ 已关闭 | 三份重复实现已收敛：claim/release 走 `poolService` / `routes/pool.js`，分配走 `assignService` |
| P1-2 | P1 | ✅ 已关闭 | 新增 `constants/poolStatus.js` 统一 `POOL_STATUS` + `BUSINESS_STATUS`；旧 `constants/customer.js` 数值常量已停用 |
| P1-3 | P1 | ⚠️ 部分关闭 | `leadsService.js` 仍存在但路由已迁移到 `routes/leads.js`；文件头 `@deprecated` 标注与 `customerController` 7 处活跃调用矛盾，列为已知技术债 #1 |
| P1-4 | P1 | ✅ 已关闭 | 三字段语义重叠问题通过架构拆分解决：`customer_type` / `lifecycle_status` 废弃，`business_status` + `pool_status` 双字段表达 |
| P1-5 | P1 | ✅ 已关闭 | `CustomerFilter.vue` 随 List.vue 拆分一并消除 |
| P1-6 | P1 | ✅ 已关闭 | 098 迁移新增 `leads:*` / `pool:*` / `customer:release` / `customer:manage` 独立权限码 |
| P1-7 | P1 | ✅ 已关闭 | API 端点拆分为 `/api/v1/leads`、`/api/v1/customers`、`/api/v1/pool`，旧 `/api/v1/customer/*` 保留为兼容层 |
| P1-8 | P1 | ✅ 已关闭 | `assignService` 角色码已对齐 `roles.js`，并由 098/100/101 迁移统一权限命名 |
| P2-1 | P2 | ✅ 已关闭 | 拆分后 `views/leads/List.vue` 不再使用 prospect 命名 |
| P2-2 | P2 | ✅ 已关闭 | 状态选项由独立常量文件统一管理 |
| P2-3 | P2 | ✅ 已关闭 | 菜单结构改为「客户中心 → 潜客池 / 客户管理 / 公海池」平级 |
| P2-4 | P2 | ⚠️ 部分关闭 | 仍未引入 Pinia store 管理客户领域状态，列为已知技术债，不阻塞冻结 |

### 3. 架构实施偏离说明（重要）

原审计 §6.1 推荐**方案 B：单 `status` 字段模型**（取值 lead/sea/following/quoted/negotiating/signed/lost/paused）。

实际冻结版本采用了**更优的双字段模型**：

| 字段 | 取值 | 职责 |
|------|------|------|
| `business_status` | lead / following / quoted / negotiating / signed / lost | 销售漏斗阶段（不含 `sea`，不含 `paused`） |
| `pool_status` | private / sea | 资源归属（私有 / 公海） |

**优势**：
- 销售阶段与资源归属解耦，释放客户（following → sea）不再需要回退销售阶段
- 公海池查询条件简化为 `pool_status = 'sea'`，无需 `owner_id IS NULL AND status IN (...)` 复合判断
- 与原 P0-2「releaseCustomer 不更新 status」的修复方向天然兼容

**对照关系**：

| 业务概念 | 原审计判定式 | 现行判定式 |
|----------|--------------|------------|
| 线索池 | `status='lead'` | `business_status='lead'`（pool_status 不参与） |
| 公海池 | `owner_id IS NULL AND status IN ('lead','sea')` | `pool_status='sea' AND business_status != 'lead'` |
| 正式客户 | `status IN ('following',...) AND owner_id IS NOT NULL` | `business_status IN ('following',...) AND pool_status='private'` |

### 4. 新发现的残留不一致（Delta Audit 新增项）

| 编号 | 等级 | 问题 | 建议 |
|------|------|------|------|
| Δ-1 | P2 | `constants/customerStatus.js` 的 `CUSTOMER_STATUS` 仍包含 `SEA: 'sea'` 和 `PAUSED: 'paused'`，与 `constants/poolStatus.js` 的 `BUSINESS_STATUS`（6 值，无 sea/paused）不一致 | 冻结范围内文件，按 RFC 流程评估：要么在 `customerStatus.js` 标注 `@deprecated` 并迁移调用方到 `poolStatus.js`，要么明确两文件的职责边界 |
| Δ-2 | P2 | `customerService.js` 文件名仍为单数 `customer`，但实际承载了 leads/pool/customer 三模块的共享逻辑 | 仅命名层面的技术债，不阻塞功能，后续重构迭代处理 |

> 上述 Δ-1、Δ-2 属冻结范围内的代码组织问题，非业务正确性问题，按冻结声明 §「冻结声明」需走 RFC 流程，本次 Delta Audit 仅记录不修改。

### 5. 不再适用的章节

原审计下述章节已因冻结而**整体失效**，保留原文仅供回溯：

- §4.1 P0 级问题清单 → 全部关闭（见本节 §2）
- §4.2 P1 级问题清单 → 全部关闭（见本节 §2）
- §4.3 P2 级问题清单 → 全部关闭（见本节 §2）
- §6.1 方案 B 推荐字段定义 → 已被双字段模型替代（见本节 §3）
- §7 数据迁移方案 → 已由 097/098/100/101 迁移实际执行，且 097 实际范围超出原方案
- §8 实施步骤 → 已由 5 期重构实际执行完毕，详见 [docs/customer-center-refactor-plan.md](file:///c:/huakey-crm/docs/customer-center-refactor-plan.md) 实施状态节

### 6. 仍适用的章节

原审计下述章节**结论仍然有效**，无需变更：

- §1 当前架构分析 → 作为重构前快照保留
- §2 数据模型分析 → ER 关系图、字段清单仍为当前结构（字段名 `status` → `business_status` 已在 §3 标注）
- §3 API 分析（历史快照） → 用于理解兼容层 `/api/v1/customer/*` 的来源
- §5 CRM 标准模型对比 → B2B CRM 三阶段框架仍有效，仅"当前系统实现"列已更新
- 附录 A 审计证据索引 → 作为历史证据保留

---

## 1. 当前架构分析

### 1.1 前端目录结构

```
frontend/src/
├── views/customer/
│   ├── List.vue              # 唯一的列表组件（潜客/正式/公海全部复用）
│   ├── Detail.vue            # 客户详情
│   ├── AssignRules.vue       # 分配规则
│   └── components/
│       ├── CustomerFilter.vue    # 筛选器（含两套 Tab）
│       ├── CustomerTable.vue     # 表格
│       ├── CustomerFormDialog.vue
│       ├── CustomerPagination.vue
│       ├── AssignDialog.vue
│       ├── FollowDialog.vue
│       └── BatchFollowDialog.vue
├── router/index.js           # 路由配置
├── components/layout/Sidebar.vue  # 菜单
└── api/customer.js           # API 封装
```

**关键事实**：`views/customer/` 目录下**没有独立的 `Pool.vue`、`Leads.vue`、`Prospect.vue` 组件**，所有客户视图都复用 `List.vue`。

### 1.2 路由配置（[router/index.js](file:///c:/huakey-crm/frontend/src/router/index.js)）

| 行号 | path | name | component | meta.permission |
|---|---|---|---|---|
| L60-64 | `/customer/prospects` | ProspectPool | `List.vue` | `customer:list` |
| L66-70 | `/customer/list` | CustomerList | `List.vue` | `customer:list` |
| L72-76 | `/customer/detail/:id` | CustomerDetail | `Detail.vue` | `customer:view` |
| L78-82 | `/customer/assign-rules` | AssignRules | `AssignRules.vue` | `customer:assign` |

**发现 1.1（P1）**：`/customer/prospects` 和 `/customer/list` 两条路由**指向同一个组件 `List.vue`**，且 `meta.permission` 都是 `customer:list`，**没有独立权限码区分潜客池与正式客户**。

**发现 1.2（P1）**：**没有 `/customer/pool` 路由**。CLAUDE.md 第 17.1 节记录"独立公海池页面 `/customer/pool` 已废弃"，公海入口被合并到 `/customer/list?tab=sea`。

### 1.3 菜单配置（[Sidebar.vue](file:///c:/huakey-crm/frontend/src/components/layout/Sidebar.vue)）

```vue
<!-- L30-40 -->
<el-sub-menu index="/customer" v-if="hasAnyMenuPermission(['customer:list', 'customer:pool', 'followup:calendar', 'followup:template'])">
  <template #title>...客户管理...</template>
  <el-menu-item index="/customer/list?tab=prospect" v-if="hasMenuPermission('customer:list')">潜客池</el-menu-item>
  <el-menu-item index="/customer/list?tab=customer" v-if="hasMenuPermission('customer:list')">正式客户</el-menu-item>
  <el-menu-item index="/customer/list?tab=sea" v-if="hasMenuPermission('customer:pool')">公海池</el-menu-item>
  ...
</el-sub-menu>
```

**发现 1.3（P0，用户反馈问题的根因）**：三个菜单项的 `index` 全部指向 `/customer/list`，**仅靠 query 参数 `tab` 区分**：

| 菜单项 | index | 期望行为 | 实际行为 |
|---|---|---|---|
| 潜客池 | `/customer/list?tab=prospect` | 显示潜客 | ✅ 正常（watch 处理了 prospect） |
| 正式客户 | `/customer/list?tab=customer` | 显示正式客户 | ❌ 跳全部客户 |
| 公海池 | `/customer/list?tab=sea` | 显示公海 | ❌ 跳全部客户 |

### 1.4 List.vue 组件复用问题（[List.vue](file:///c:/huakey-crm/frontend/src/views/customer/List.vue)）

**根因分析**——`List.vue` 第 398-412 行的 `watch` 存在逻辑缺陷：

```javascript
// L398-412
watch(() => route.fullPath, (newFull, oldFull) => {
  if (newFull === oldFull) return
  if (route.path.includes('customer/list')) {
    const tab = route.query.tab
    if (tab === 'prospect') {
      activeTab.value = 'prospect'
      searchForm.status = ''
    } else {
      activeTab.value = 'all'      // ← BUG：sea/customer 都被重置为 'all'
      searchForm.status = ''
    }
    searchForm.page = 1
    fetchList()
  }
})
```

**只有 `tab === 'prospect'` 走专门分支，`tab === 'sea'` 和 `tab === 'customer'` 全部落入 `else` 分支被重置为 `'all'`**，导致点击"公海池"和"正式客户"菜单时显示全部客户。

**第 342-358 行的 `fetchList` 参数映射**：

```javascript
if (activeTab.value === 'prospect') {
  params.customer_type = 'prospect'   // 按客户类型筛
} else if (activeTab.value === 'sea') {
  params.unassigned = true            // 按 owner_id IS NULL 筛
} else if (activeTab.value === 'following') {
  params.status = 'following'         // 按状态筛
}
// ... 其他状态
```

**发现 1.4（P1）**：三个 Tab 使用**三个不同维度的筛选条件**：
- 潜客 → `customer_type = 'prospect'`（类型维度）
- 公海 → `unassigned = true`（归属维度，`owner_id IS NULL`）
- 正式客户 → **没有对应分支**，落入默认全量查询

**发现 1.5（P0）**：第 235 行 `status: isProspectView.value ? 'following' : ''`——潜客视图默认查询 `status='following'`，但第 343 行又设置 `customer_type='prospect'`。**两个条件叠加意味着"潜客 = customer_type=prospect AND status=following"**，而数据库中潜客的 status 实际是 `lead`（见第 2 节），导致潜客池查询结果为空或错乱。

### 1.5 API 封装（[api/customer.js](file:///c:/huakey-crm/frontend/src/api/customer.js)）

```javascript
// L4
export const getCustomerList = (params) => request.post('/customer/list', params)
```

**发现 1.6（P1）**：**只有一个 `getCustomerList` 接口**，没有独立的 `getLeads`、`getPool`、`getProspect` API。所有列表查询都复用同一端点，靠 `params` 区分。

### 1.6 状态管理

项目使用 composables（`useUser`、`useTable`）+ localStorage/sessionStorage 管理状态，**没有使用 Pinia store 管理客户领域状态**。客户列表状态完全封装在 `List.vue` 组件内部（`searchForm` reactive 对象），跨页面无法共享筛选状态。

### 1.7 组件复用关系图

```
菜单"潜客池"   ─┐
菜单"正式客户" ─┼──→ /customer/list?tab=xxx ──→ List.vue ──→ POST /api/customer/list
菜单"公海池"   ─┘                                    │
菜单"线索池"(快捷Tab) ─→ /customer/list ─────────────┤
                                                       ↓
                                            CustomerFilter.vue（两套 Tab）
                                                       ↓
                                            CustomerTable.vue
```

**结论**：用户反馈的"3 个菜单实际页面都跳转到全部客户，没有真正的数据隔离"**完全属实**，根因是 `List.vue` 的 watch 逻辑缺陷 + 维度不一致的筛选条件。

---

## 2. 数据模型分析

### 2.1 数据库 ER 关系

```
crm_customer (主表，所有客户类型混合)
  ├── owner_id ──→ sys_user.id (负责人，NULL=公海)
  ├── dept_id  ──→ sys_dept.id
  ├── original_lead_id (自引用，线索溯源)
  │
  ├── crm_contact (联系人，1:N)
  ├── crm_follow_up (跟进记录，1:N)
  ├── crm_customer_tag (标签关联，N:M via crm_tag)
  ├── crm_opportunity (商机，1:N)
  ├── crm_quote (报价，1:N)
  ├── crm_contract (合同，1:N)
  │
  ├── crm_pool_log (公海操作日志，1:N)
  └── crm_assign_log (分配日志，1:N)

sys_customer_status (状态配置表)
sys_customer_status_transition (状态流转规则表)
crm_assign_rule (分配规则表)
```

### 2.2 crm_customer 表关键字段

通过迁移文件推断的字段结构（070/037/073/074/088 迁移）：

| 字段 | 类型 | 说明 | 来源迁移 |
|---|---|---|---|
| `status` | VARCHAR(32) | 状态码：lead/sea/following/quoted/negotiating/signed/lost/paused | 070 |
| `old_status_int` | TINYINT | 旧数值状态备份（0/1/2/3/5） | 070 |
| `customer_type` | VARCHAR | 客户类型：prospect/customer | 037 |
| `lifecycle_status` | VARCHAR | 生命周期：new/nurturing/intent/active/lost/inactive | 037 |
| `pool_status` | TINYINT | 公海标记：0=私有/1=公海 | 003 |
| `owner_id` | INT | 负责人ID，NULL=公海 | 原始 |
| `protect_until` | DATETIME | 公海保护期截止时间 | 003 |
| `original_lead_id` | INT | 原始线索ID（线索转客户溯源） | 074 |
| `last_follow_time` | DATETIME | 最后跟进时间 | 原始 |
| `follow_status` | VARCHAR | 跟进状态（初次联系/跟进中...） | 原始 |
| `lead_level` | VARCHAR | 线索等级 | 005 |
| `pool_type` | VARCHAR | 池类型：public/private | 021 |
| `deleted_at` | DATETIME | 软删除标记 | 原始 |

### 2.3 关键问题：潜客是否和客户共用同一张表？

**是的**。`crm_customer` 是单表设计，所有客户类型（线索/潜客/正式客户/公海客户）都存储在同一张表中，通过 3 个字段交叉区分：

| 业务概念 | status | customer_type | lifecycle_status | owner_id | pool_status |
|---|---|---|---|---|---|
| 线索（新导入） | `lead` | `prospect` | `new` | NULL | 0（088 迁移后） |
| 公海客户（被回收） | `sea` | `customer` 或 `prospect` | 任意 | NULL | 1 |
| 潜客（跟进中） | `following` | `prospect` | `nurturing` | 非 NULL | 0 |
| 正式客户 | `signed` 或 `following` | `customer` | `active` | 非 NULL | 0 |

### 2.4 公海池实现机制（确切答案）

**公海池通过"修改 owner_id 为 NULL + 修改 pool_status 为 1 + 修改 status 为 sea"实现**，不是单独表，不是复制数据。

但存在**三份不一致的实现**：

| 文件 | 行号 | 释放到公海的 SQL | 问题 |
|---|---|---|---|
| [customerService.js](file:///c:/huakey-crm/backend/services/customerService.js#L570-L588) | L579-581 | `SET pool_status=1, owner_id=NULL, protect_until=NULL` | **P0：不更新 status** |
| [poolService.js](file:///c:/huakey-crm/backend/services/poolService.js#L218-L221) | L218-221 | `SET pool_status=1, owner_id=NULL, protect_until=NULL, status='sea'` | 完整 |
| [assignService.js](file:///c:/huakey-crm/backend/services/assignService.js#L204-L213) | L204-213 | `SET owner_id=?, pool_status=?, protect_until=NULL, status='sea'`（to_user_id=null 时） | 完整 |

**发现 2.1（P0）**：`customerService.releaseCustomer` 第 579-581 行**只更新 pool_status 和 owner_id，没有更新 status**。释放后客户 `status` 仍是 `following`，但 `owner_id=NULL`，导致状态字段与归属字段不一致，后续按 status 查询会漏掉/错误包含这类客户。

### 2.5 088 迁移破坏了 073 建立的等价关系

**073 迁移**（[073_unify_pool_owner_id.sql](file:///c:/huakey-crm/database/migrations/073_unify_pool_owner_id.sql)）建立了等价关系：
```
owner_id IS NULL  ⟺  pool_status = 1
```

**088 迁移**（[088_add_lead_pool.sql](file:///c:/huakey-crm/database/migrations/088_add_lead_pool.sql#L23-L31)）第 23-31 行：

```sql
UPDATE crm_customer
SET status = 'lead',
    customer_type = 'prospect',
    lifecycle_status = 'new',
    pool_status = 0          -- ← 破坏等价关系：owner_id IS NULL 但 pool_status=0
WHERE status = 'sea'
  AND owner_id IS NULL
  AND protect_until IS NULL
  AND pool_status = 1;
```

**发现 2.2（P0）**：088 迁移将 lead 客户的 `pool_status` 设为 0，但 `owner_id` 仍是 NULL，**破坏了 073 建立的等价关系**。这导致：
- `listCustomers` 第 213-214 行 `unassigned` 筛选 `c.owner_id IS NULL` 会把 lead 客户也包含进公海池
- `poolService.listPoolCustomers` 第 30 行 `WHERE c.owner_id IS NULL` 同样会混入 lead 客户
- 数据权限中间件 `self` 范围（permission.js L134）`OR (${column} IS NULL AND ${tableAlias}.status IN ('lead', 'sea'))` 依赖 status 区分，但 pool_status 不一致会干扰其他查询

### 2.6 三个状态字段语义重叠

**发现 2.3（P1）**：`status`、`customer_type`、`lifecycle_status` 三个字段语义高度重叠且转换关系不明确：

| 字段 | 取值 | 用途 |
|---|---|---|
| `status` | lead/sea/following/quoted/negotiating/signed/lost/paused | 销售漏斗状态机 |
| `customer_type` | prospect/customer | 客户分类（潜客/正式） |
| `lifecycle_status` | new/nurturing/intent/active/lost/inactive | 生命周期阶段 |

例如：一个"正在跟进的潜客"应该是什么？
- `status = following` + `customer_type = prospect` + `lifecycle_status = nurturing`？
- 还是 `status = following` + `customer_type = prospect` + `lifecycle_status = intent`？
- `convertToCustomer`（customerService.js L710-738）只更新 `customer_type='customer'` + `lifecycle_status='active'`，**不更新 status**，导致转化后 status 仍是 lead/following

### 2.7 两套状态常量并存

**发现 2.4（P1）**：

| 文件 | 常量名 | 取值 | 状态 |
|---|---|---|---|
| [constants/customer.js](file:///c:/huakey-crm/backend/constants/customer.js) | `CUSTOMER_STATUS` | `DELETED:0, PROSPECT:1, CUSTOMER:2, LOST:3, LEAD:5` | 旧版（数值） |
| [constants/customerStatus.js](file:///c:/huakey-crm/backend/constants/customerStatus.js) | `CUSTOMER_STATUS` | `lead/sea/following/...` | 新版（字符串） |

两个文件**导出同名常量 `CUSTOMER_STATUS`**，极易 require 错误导致逻辑混乱。

---

## 3. API 分析

### 3.1 客户相关 API 端点清单

| Method | Path | 中间件 | 权限码 | 来源 |
|---|---|---|---|---|
| POST | `/api/customer/list` | auth + checkPermission + cache + checkDataPermission + validate | `customer:list` | detail.js L207-214 |
| POST | `/api/customer/add` | auth + checkPermission + validate | `customer:add` | detail.js L217 |
| POST | `/api/customer/update` | auth + checkPermission + validate | `customer:edit` | detail.js L220 |
| POST | `/api/customer/delete` | auth + checkPermission + validate | `customer:delete` | detail.js L223 |
| GET | `/api/customer/detail/:id` | auth + checkDataPermission | - | detail.js L226 |
| GET | `/api/customer/:id/360` | auth + checkPermission | `customer:list` | detail.js L229 |
| POST | `/api/customer/export` | auth + checkPermission + checkDataPermission + validate | `customer:list` | detail.js L232 |
| POST | `/api/customer/forward` | auth + checkPermission + validate | `customer:edit` | detail.js L235 |
| POST | `/api/customer/backward` | auth + checkPermission + validate | `customer:edit` | detail.js L238 |
| GET | `/api/customer/overdue` | auth + checkPermission + checkDataPermission | `customer:view` | detail.js L241-256 |
| GET | `/api/customer/near-recycle` | auth + checkPermission + checkDataPermission | `customer:view` | detail.js L259-274 |
| POST | `/api/customer/assign` | auth + checkPermission + requireManager + validate | `customer:assign` | assign.js L58 |
| POST | `/api/customer/batch-assign` | auth + checkPermission + requireManager + validate | `customer:assign` | assign.js L61 |
| POST | `/api/customer/claim` | auth + checkPermission + validate | `customer:pool` | assign.js L114 |
| POST | `/api/customer/batch-claim` | auth + checkPermission + validate | `customer:pool` | assign.js L117 |
| POST | `/api/customer/release` | auth + checkPermission + validate | `customer:pool` | assign.js L120 |
| POST | `/api/customer/batch-release` | auth + checkPermission + validate | `customer:pool` | assign.js L123 |
| POST | `/api/customer/convert-to-customer` | auth + checkPermission + validate | `customer:edit` | index.js L25 |
| POST | `/api/customer/import` | - | - | import.js |
| GET | `/api/customer/sales-users` | auth + checkPermission | `customer:assign` | assign.js L67 |
| GET | `/api/customer/my-subordinates` | auth | - | assign.js L70 |

### 3.2 为什么三个页面返回相同数据

**根因 1：API 层面只有一个列表端点**

`POST /api/customer/list` 是唯一的列表接口，没有 `/leads`、`/public-pool`、`/prospect` 独立端点。

**根因 2：`listCustomers` 服务的筛选逻辑缺陷**（[customerService.js](file:///c:/huakey-crm/backend/services/customerService.js#L112-L273)）

```javascript
// L146-158：status 筛选分支
if (status !== undefined && status !== null && status !== '') {
  const mappedStatus = isValidCustomerStatus(status) ? status : legacyStatusToCode(status);
  if (!mappedStatus) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '无效的客户状态');
  }
  whereClause = `WHERE ${permissionWhere} AND c.status = ?`;   // ← P0：丢失 deleted_at IS NULL
  queryParams.push(mappedStatus);
} else {
  whereClause = `WHERE ${permissionWhere} AND c.deleted_at IS NULL`;
}
```

**发现 3.1（P0，数据泄露）**：当传入 `status` 参数时，WHERE 条件**只有 `c.status = ?`，丢失了 `c.deleted_at IS NULL`**，会查出已软删除的客户！这是一个严重的数据泄露/正确性 BUG。

**根因 3：前端 `unassigned` 参数的歧义**

```javascript
// L213-214
if (unassigned) {
  whereClause += ' AND c.owner_id IS NULL';
}
```

前端"公海池"菜单发送 `unassigned=true`，后端筛选 `owner_id IS NULL`，但如第 2.5 节所述，这会**同时返回 lead 客户和 sea 客户**，无法区分。

**根因 4：前端 watch 重置 activeTab**

如第 1.4 节所述，前端点击"公海池"和"正式客户"菜单时，`activeTab` 被 watch 重置为 `'all'`，导致 `fetchList` 不带任何区分参数，返回全部客户。

### 3.3 缺少的独立接口

**发现 3.2（P1）**：当前缺少以下独立接口：

| 期望接口 | 当前实现 | 问题 |
|---|---|---|
| `GET /api/leads` | 复用 `/customer/list?customer_type=prospect` | 无法独立配置权限、缓存、数据范围 |
| `GET /api/public-pool` | 复用 `/customer/list?unassigned=true` | lead 和 sea 混在一起 |
| `GET /api/customers` | 复用 `/customer/list`（无参数） | 无法区分正式客户与潜客 |

---

## 4. 当前问题列表

### 4.1 P0 级问题（影响业务正确性）

| 编号 | 问题 | 文件:行号 | 影响 |
|---|---|---|---|
| P0-1 | `listCustomers` 传 status 时丢失 `deleted_at IS NULL` | customerService.js:154 | 软删除客户被查出，数据泄露 |
| P0-2 | `customerService.releaseCustomer` 不更新 status | customerService.js:579-581 | 释放后 status 仍是 following，状态不一致 |
| P0-3 | `convertToCustomer` 不更新 status | customerService.js:710-738 | 潜客转化后 status 仍是 lead，状态机割裂 |
| P0-4 | 088 迁移破坏 owner_id IS NULL ⟺ pool_status=1 等价关系 | 088_add_lead_pool.sql:27 | lead 客户混入公海查询 |
| P0-5 | 前端 List.vue watch 将 sea/customer tab 重置为 all | List.vue:398-412 | 用户反馈"3个菜单跳全部客户"的根因 |
| P0-6 | 潜客视图默认 status='following' 与 customer_type='prospect' 矛盾 | List.vue:235, 343 | 潜客池查询结果错乱 |
| P0-7 | `followUpService` 混用 status 和 lifecycle_status | followUpService.js:78 | `'new'` 是 lifecycle 值，被当作 status 比较，状态推进逻辑错误 |

### 4.2 P1 级问题（影响未来扩展）

| 编号 | 问题 | 文件:行号 | 影响 |
|---|---|---|---|
| P1-1 | 三份重复的 claim/release/assign 实现 | customerService.js / poolService.js / assignService.js | 维护困难，行为不一致 |
| P1-2 | 两套客户状态常量并存 | constants/customer.js vs customerStatus.js | require 错误风险 |
| P1-3 | leadsService 仍存在但路由已废弃 | customerController.js:25-31 | 死代码，listLeads/convertLead 等 handler 无路由挂载 |
| P1-4 | 三个状态字段语义重叠（status/customer_type/lifecycle_status） | crm_customer 表 | 业务语义混乱 |
| P1-5 | 前端两套 Tab 并存（快捷Tab + 状态Tab） | CustomerFilter.vue:4-10, 84-94 | 交互逻辑混乱，两个 Tab 互相干扰 |
| P1-6 | 没有独立权限码区分 lead/pool/customer | Sidebar.vue:35-37 | 都用 customer:list，无法细粒度授权 |
| P1-7 | 没有独立 API 端点区分 lead/pool/customer | api/customer.js:4 | 单一端点承担过多职责 |
| P1-8 | `assignService.getSalesUsers` 角色码硬编码 | assignService.js:90 | `sales_manager/sales/tech` 与 roles.js 定义不一致 |

### 4.3 P2 级问题（体验优化）

| 编号 | 问题 | 文件:行号 | 影响 |
|---|---|---|---|
| P2-1 | "潜客"Tab 名 prospect 与后端 customer_type='prospect'、status='lead' 两个维度混淆 | CustomerFilter.vue:87 | 用户认知负担 |
| P2-2 | 状态选项含 'lead' 但编辑状态选项不含 | List.vue:252 vs 262-269 | 创建/编辑时无法选 lead 状态 |
| P2-3 | 菜单"潜客池"在"客户管理"下，与用户心智模型不符 | Sidebar.vue:35 | 用户反馈"潜客池作为客户管理子菜单不合理" |
| P2-4 | 无 Pinia store 管理客户领域状态 | - | 跨页面无法共享筛选状态 |

---

## 5. CRM 标准模型对比

### 5.1 标准 B2B CRM 三阶段模型

| 阶段 | 定义 | 负责人 | 数据特征 |
|---|---|---|---|
| **A. Lead（线索）** | 未形成业务关系的销售线索，来源：展会、广告、转介绍、主动咨询 | 无负责人或团队共享 | 信息不完整，需要清洗、验证、培育 |
| **B. Customer（客户）** | 已确认合作关系的企业客户 | 有明确负责人 | 信息完整，有合同/订单历史 |
| **C. Pool（公海）** | 无人负责但仍保留价值的客户资源 | 无负责人 | 曾被跟进过，因各种原因被释放 |

### 5.2 当前系统与标准模型的差距

| 标准模型 | 当前系统实现 | 差距分析 | 严重等级 |
|---|---|---|---|
| **Lead 独立实体** | `crm_customer` 单表，`status='lead'` + `customer_type='prospect'` | 线索与客户混在一张表，字段语义混乱 | P1 |
| **Customer 独立实体** | `crm_customer` 单表，`customer_type='customer'` | 与线索共享表结构，无法独立扩展字段 | P1 |
| **Pool 独立语义** | `owner_id IS NULL` + `pool_status=1` + `status='sea'` | lead 客户也是 owner_id=NULL，公海池查询混入 lead | P0 |
| **Lead → Customer 转化** | `convertToCustomer` 只改 customer_type，不改 status | 转化后 status 仍是 lead，状态机割裂 | P0 |
| **Customer → Pool 释放** | 三份实现，其中一份不更新 status | 状态不一致 | P0 |
| **Pool → Customer 认领** | `claimCustomer` 设置 owner_id + status='following' + 保护期 | 基本符合标准，但 lead 认领无保护期，sea 认领有 7 天保护期 | 符合 |

### 5.3 当前系统是否符合 B2B CRM 模型？

**不符合**。主要差距：

1. **线索与客户没有清晰边界**：共用 `crm_customer` 表，靠 `customer_type` + `status` + `lifecycle_status` 三个字段交叉区分，业务语义混乱
2. **公海池定义不严谨**：`owner_id IS NULL` 同时包含 lead 和 sea 两种业务实体，没有独立字段区分
3. **状态机割裂**：`status` 字段承担了"销售漏斗阶段"和"客户类型"双重职责，convertToCustomer 不更新 status 导致转化后状态错误
4. **菜单结构不合理**：潜客池作为客户管理子菜单，与"线索是客户的前置阶段"的心智模型不符

---

## 6. 推荐重构方案

### 6.1 数据库方案对比

#### 方案 A：三表模型（lead / customer / customer_pool）

```
crm_lead          -- 线索表
crm_customer      -- 正式客户表
crm_customer_pool -- 公海池表（或用 customer.is_in_pool 字段）
```

**优点**：
- 业务实体边界清晰，符合 B2B CRM 标准模型
- 各表可独立扩展字段（lead 可加 scoring/source_quality；customer 可加 credit_level）
- 查询性能高，无需多字段交叉筛选
- 权限可独立配置（leads:view / customer:view / pool:view）

**缺点**：
- 线索转化客户需要数据迁移（INSERT INTO customer SELECT FROM lead）
- 历史关联数据（跟进、商机、合同）需要外键迁移
- 改造工作量极大，影响 followUp/opportunity/quote/contract 等模块
- 现有 86 个迁移、65 个 service 文件需要大规模修改

#### 方案 B：单表模型 + 生命周期字段（推荐）

保持 `crm_customer` 单表，但**统一状态字段语义，消除冗余**：

```sql
-- 废弃 customer_type 和 lifecycle_status，统一用 status 表达
-- status 取值：lead / sea / following / quoted / negotiating / signed / lost / paused
-- 公海判断：owner_id IS NULL AND status IN ('lead', 'sea')
-- 线索判断：status = 'lead'
-- 正式客户判断：status IN ('following','quoted','negotiating','signed') AND owner_id IS NOT NULL
```

**优点**：
- 改造成本低，无需迁移表结构
- 现有 followUp/opportunity/quote/contract 关联无需改动
- 只需修复 service 层逻辑一致性
- 符合 070/073/088 迁移的演进方向

**缺点**：
- 单表数据量大时需 good index 支持
- 线索与客户的字段差异无法通过 schema 体现（需靠业务校验）

#### 推荐：方案 B

**理由**：
1. 当前项目已有 088 迁移将 lead 引入 status 字段，演进方向已定
2. 改造风险低，不影响 followUp/opportunity/quote/contract 等关联模块
3. 用户反馈的核心问题是"数据隔离"而非"表结构"，方案 B 能解决
4. 方案 A 的表拆分成本过高，且外贸 CRM 场景下线索与客户字段差异不大

### 6.2 推荐前端菜单结构

```
客户中心
├── 潜客池        (/leads)           -- status='lead'
├── 客户管理      (/customers)       -- status IN ('following','quoted','negotiating','signed') AND owner_id IS NOT NULL
├── 公海池        (/pool)            -- status='sea' AND owner_id IS NULL
├── 跟进日历      (/followup/calendar)
└── 跟进模板      (/followup/template)
```

**原因**：
1. **潜客池独立**：线索是销售漏斗的最上游，与"客户管理"平级更符合销售工作流（先处理线索，再管理客户）
2. **公海池独立**：公海是资源回收站，独立入口便于销售定期捡漏
3. **客户管理专注正式客户**：去除"全部客户"概念，避免销售被无关数据干扰
4. **权限独立**：`leads:view` / `customer:view` / `pool:view` 三个权限码，支持细粒度授权

### 6.3 推荐 API 设计

```
# 线索管理
GET    /api/leads              -- 线索列表（status='lead'）
POST   /api/leads              -- 录入线索
POST   /api/leads/:id/claim    -- 认领线索（lead → following）
POST   /api/leads/:id/convert  -- 转化为客户（lead → following + customer_type=customer）
POST   /api/leads/import       -- 批量导入线索

# 客户管理
GET    /api/customers          -- 客户列表（status IN following/quoted/negotiating/signed）
POST   /api/customers          -- 新增客户
GET    /api/customers/:id      -- 客户详情
PUT    /api/customers/:id      -- 编辑客户
DELETE /api/customers/:id      -- 删除客户
POST   /api/customers/:id/release  -- 释放到公海（following → sea）

# 公海池
GET    /api/pool               -- 公海列表（status='sea' AND owner_id IS NULL）
POST   /api/pool/:id/claim     -- 认领公海客户（sea → following，7天保护期）
POST   /api/pool/:id/assign    -- 分配公海客户（管理员）
GET    /api/pool/logs          -- 公海操作日志
```

**与当前 API 的兼容策略**：
- 保留 `/api/customer/*` 旧端点作为兼容层，内部转发到新端点
- 新前端使用新端点，旧端点在 2026-12-01 后下线

### 6.4 推荐状态流转

```
                    ┌─────────────────────────────────────┐
                    ↓                                     │
[录入/导入] → lead(线索) ──认领──→ following(跟进中) ──释放──→ sea(公海)
                    │                       │              │
                    │                       │              │
                    └──直接释放──→ sea(公海) │              │
                                            ↓              ↓
                                       quoted(已报价) ←──认领──┘
                                            ↓
                                    negotiating(谈判中)
                                            ↓
                                       signed(已签约) [终态]
                                            │
                                            ↓
                                       lost(已流失) [终态]
```

**关键规则**：
1. `lead → following`：认领线索，设置 owner_id，无保护期
2. `following → sea`：释放客户，清空 owner_id，设置 7 天保护期
3. `sea → following`：认领公海客户，设置 owner_id，7 天保护期
4. `lead → sea`：线索直接释放到公海（跳过跟进）
5. `following → quoted`：创建报价时自动推进
6. `quoted → negotiating → signed`：手动推进或合同创建时自动推进

---

## 7. 数据迁移方案

### 7.1 数据修复迁移（修复现有不一致数据）

```sql
-- 迁移 097: 修复客户状态字段不一致
-- 1. 修复 088 迁移破坏的 pool_status 等价关系
-- lead 客户 owner_id IS NULL 但 pool_status=0，统一设为 pool_status=1
UPDATE crm_customer
SET pool_status = 1
WHERE status = 'lead' AND owner_id IS NULL AND pool_status = 0 AND deleted_at IS NULL;

-- 2. 修复 customerService.releaseCustomer 产生的脏数据
-- owner_id IS NULL 但 status 不是 sea/lead 的客户，统一设为 sea
UPDATE crm_customer
SET status = 'sea'
WHERE owner_id IS NULL AND status NOT IN ('sea', 'lead') AND deleted_at IS NULL;

-- 3. 修复 convertToCustomer 产生的脏数据
-- customer_type='customer' 但 status='lead' 的客户，统一设为 status='following'
UPDATE crm_customer
SET status = 'following'
WHERE customer_type = 'customer' AND status = 'lead' AND deleted_at IS NULL;

-- 4. 废弃 customer_type 和 lifecycle_status（保留字段但停止使用）
ALTER TABLE crm_customer MODIFY COLUMN customer_type VARCHAR(32) NULL COMMENT '已废弃，统一用 status';
ALTER TABLE crm_customer MODIFY COLUMN lifecycle_status VARCHAR(32) NULL COMMENT '已废弃，统一用 status';
```

### 7.2 索引优化迁移

```sql
-- 迁移 098: 客户查询索引优化
-- 高频查询：WHERE status=? AND owner_id IS NULL AND deleted_at IS NULL
CREATE INDEX idx_customer_status_owner ON crm_customer(status, owner_id, deleted_at);
CREATE INDEX idx_customer_owner_status ON crm_customer(owner_id, status, deleted_at);
```

### 7.3 权限码迁移

```sql
-- 迁移 099: 新增 lead/pool 独立权限码
INSERT IGNORE INTO sys_permission (code, name, parent_id, type, is_visible) VALUES
('leads', '潜客池', <客户中心父ID>, 'menu', 1),
('leads:view', '查看线索', NULL, 'api', 0),
('leads:claim', '认领线索', NULL, 'api', 0),
('leads:convert', '转化为客户', NULL, 'api', 0),
('pool', '公海池', <客户中心父ID>, 'menu', 1),
('pool:view', '查看公海', NULL, 'api', 0),
('pool:claim', '认领公海客户', NULL, 'api', 0),
('pool:assign', '分配公海客户', NULL, 'api', 0);

-- 将原 customer:pool 权限映射到 pool:*
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'customer:pool'
JOIN sys_permission p_dst ON p_dst.code IN ('pool:view', 'pool:claim', 'pool:assign')
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);
```

---

## 8. 实施步骤

### 8.1 低风险改造路径（推荐分 4 期执行）

#### 第一期：P0 BUG 修复（1-2 天，零破坏性）

**目标**：修复影响业务正确性的 7 个 P0 问题，不改变架构

| 步骤 | 文件 | 修改内容 |
|---|---|---|
| 1 | customerService.js:154 | `whereClause` 补充 `AND c.deleted_at IS NULL` |
| 2 | customerService.js:579-581 | releaseCustomer 补充 `status = 'sea'` |
| 3 | customerService.js:710-738 | convertToCustomer 补充 `status = 'following'` |
| 4 | List.vue:398-412 | watch 补充 `sea` 和 `customer` 分支处理 |
| 5 | List.vue:235 | 移除 `isProspectView ? 'following' : ''` 默认值 |
| 6 | followUpService.js:78 | 修正 `'new'` 比较，改为检查 `lifecycle_status` 而非 `status` |
| 7 | 097 迁移 | 执行数据修复 SQL |

**验证**：
- 运行 E2E 测试套件
- 手动验证：点击"公海池"菜单显示公海客户，点击"潜客池"显示潜客，点击"正式客户"显示正式客户

#### 第二期：架构统一（3-5 天，向后兼容）

**目标**：消除三份重复实现，统一公海/认领/释放逻辑

| 步骤 | 修改内容 |
|---|---|
| 1 | 删除 customerService.js 中的 claimCustomer/releaseCustomer/manualAssign（L445-588） |
| 2 | 统一使用 poolService.js + assignService.js |
| 3 | 删除 leadsService.js（死代码） |
| 4 | 删除 customerController.js 中未挂载的 leads handler（L166-231） |
| 5 | 删除 constants/customer.js（旧版常量） |
| 6 | 088 迁移补充：lead 客户 pool_status 统一设为 1 |

**验证**：
- 全量回归测试客户模块所有接口
- 验证认领/释放/分配/批量操作正常

#### 第三期：前端独立化（5-7 天，UI 重构）

**目标**：拆分 List.vue 为独立页面，实现真正的数据隔离

| 步骤 | 修改内容 |
|---|---|
| 1 | 新建 `views/leads/List.vue`（潜客池，status='lead'） |
| 2 | 新建 `views/pool/List.vue`（公海池，status='sea' AND owner_id IS NULL） |
| 3 | 重构 `views/customer/List.vue`（客户管理，status IN following/quoted/negotiating/signed） |
| 4 | 更新 router/index.js：新增 `/leads`、`/pool` 路由 |
| 5 | 更新 Sidebar.vue：菜单结构调整为"客户中心"父级 |
| 6 | 新增 api/leads.js、api/pool.js |
| 7 | 拆分 CustomerFilter.vue 为 LeadFilter/PoolFilter/CustomerFilter |

**验证**：
- 三个页面数据完全隔离
- 权限码独立配置（leads:view / customer:view / pool:view）

#### 第四期：API 独立化（7-10 天，后端重构）

**目标**：提供独立 API 端点，旧端点保留兼容

| 步骤 | 修改内容 |
|---|---|
| 1 | 新建 routes/leads.js（GET /api/leads, POST /api/leads/:id/claim, /convert） |
| 2 | 新建 routes/pool.js（GET /api/pool, POST /api/pool/:id/claim） |
| 3 | 重构 routes/customer/list.js 为 /api/customers |
| 4 | 旧 /api/customer/* 保留，内部转发到新端点 |
| 5 | 执行 099 迁移：新增权限码 |
| 6 | 更新前端 api 层切换到新端点 |

**验证**：
- 新端点功能完整
- 旧端点兼容正常
- 权限码独立生效

### 8.2 改造风险评估

| 改造对象 | 风险等级 | 影响范围 | 缓解措施 |
|---|---|---|---|
| **customerService.listCustomers** | 🔴 高 | 所有客户列表查询 | 修复 deleted_at 后全量回归测试 |
| **releaseCustomer/claimCustomer** | 🟡 中 | 公海操作 | 统一实现后对比测试 |
| **convertToCustomer** | 🟡 中 | 潜客转化流程 | 补充 status 更新后验证状态机 |
| **List.vue 拆分** | 🟡 中 | 前端所有客户页面 | 保留旧 List.vue 直到新页面验证完成 |
| **followUpService** | 🔴 高 | 跟进驱动状态推进 | 修复 status/lifecycle_status 混用后全量测试跟进流程 |
| **opportunityService** | 🟢 低 | 商机模块 | 商机只读 customer.status，不修改，风险低 |
| **quoteService** | 🟢 低 | 报价模块 | 同上 |
| **contractService** | 🟢 低 | 合同模块 | 同上 |
| **权限码变更** | 🟡 中 | 所有用户角色 | 099 迁移做权限映射，保留旧权限兼容 |
| **历史数据** | 🔴 高 | 全部客户数据 | 097 迁移前必须备份，迁移后数据校验脚本 |

### 8.3 回滚策略

1. **代码回滚**：`git revert` 对应提交
2. **数据库回滚**：每个迁移配套 `_down.sql`
   - 097_down.sql：恢复 customer_type/lifecycle_status 原值（从 old_status_int 反推）
   - 098_down.sql：DROP INDEX
   - 099_down.sql：DELETE 新增权限码 + 恢复 customer:pool 可见性
3. **配置回滚**：保留 .env 备份

---

## 附录 A：审计证据索引

### 前端证据
- [router/index.js:60-70](file:///c:/huakey-crm/frontend/src/router/index.js#L60-L70) — 两条路由复用 List.vue
- [Sidebar.vue:35-37](file:///c:/huakey-crm/frontend/src/components/layout/Sidebar.vue#L35-L37) — 三个菜单跳同一路由
- [List.vue:117](file:///c:/huakey-crm/frontend/src/views/customer/List.vue#L117) — activeTab 默认 'all'
- [List.vue:235](file:///c:/huakey-crm/frontend/src/views/customer/List.vue#L235) — 潜客视图默认 status='following'
- [List.vue:342-358](file:///c:/huakey-crm/frontend/src/views/customer/List.vue#L342-L358) — fetchList 参数映射
- [List.vue:398-412](file:///c:/huakey-crm/frontend/src/views/customer/List.vue#L398-L412) — watch 重置 activeTab 为 'all'
- [CustomerFilter.vue:4-10](file:///c:/huakey-crm/frontend/src/views/customer/components/CustomerFilter.vue#L4-L10) — 快捷 Tab
- [CustomerFilter.vue:84-94](file:///c:/huakey-crm/frontend/src/views/customer/components/CustomerFilter.vue#L84-L94) — 状态 Tab
- [api/customer.js:4](file:///c:/huakey-crm/frontend/src/api/customer.js#L4) — 唯一列表接口

### 后端证据
- [customerService.js:154](file:///c:/huakey-crm/backend/services/customerService.js#L154) — P0：丢失 deleted_at IS NULL
- [customerService.js:213-214](file:///c:/huakey-crm/backend/services/customerService.js#L213-L214) — unassigned 筛选 owner_id IS NULL
- [customerService.js:579-581](file:///c:/huakey-crm/backend/services/customerService.js#L579-L581) — P0：releaseCustomer 不更新 status
- [customerService.js:710-738](file:///c:/huakey-crm/backend/services/customerService.js#L710-L738) — P0：convertToCustomer 不更新 status
- [poolService.js:218-221](file:///c:/huakey-crm/backend/services/poolService.js#L218-L221) — 完整的 release 实现
- [assignService.js:204-213](file:///c:/huakey-crm/backend/services/assignService.js#L204-L213) — 第三份 release 实现
- [customerController.js:25-31](file:///c:/huakey-crm/backend/controllers/customerController.js#L25-L31) — leadsService 死代码
- [customerController.js:166-231](file:///c:/huakey-crm/backend/controllers/customerController.js#L166-L231) — 未挂载的 leads handler
- [permission.js:134](file:///c:/huakey-crm/backend/middleware/permission.js#L134) — self 范围 SQL
- [followUpService.js:78](file:///c:/huakey-crm/backend/services/followUpService.js#L78) — P0：混用 status 和 lifecycle_status
- [constants/customer.js](file:///c:/huakey-crm/backend/constants/customer.js) — 旧版数值状态常量
- [constants/customerStatus.js](file:///c:/huakey-crm/backend/constants/customerStatus.js) — 新版字符串状态常量
- [routes/customer/index.js:10-11](file:///c:/huakey-crm/backend/routes/customer/index.js#L10-L11) — 已废弃路由说明

### 数据库证据
- [070_unify_customer_status.sql](file:///c:/huakey-crm/database/migrations/070_unify_customer_status.sql) — status 改 VARCHAR
- [073_unify_pool_owner_id.sql](file:///c:/huakey-crm/database/migrations/073_unify_pool_owner_id.sql) — owner_id ⟺ pool_status 等价
- [074_add_original_lead_id.sql](file:///c:/huakey-crm/database/migrations/074_add_original_lead_id.sql) — 线索整合到客户
- [075_map_leads_to_customer_permission.sql](file:///c:/huakey-crm/database/migrations/075_map_leads_to_customer_permission.sql) — leads 权限映射
- [088_add_lead_pool.sql:23-31](file:///c:/huakey-crm/database/migrations/088_add_lead_pool.sql#L23-L31) — P0：破坏 pool_status 等价关系

---

## 附录 B：用户反馈问题对照

| 用户反馈 | 审计结论 | 根因 | 严重等级 |
|---|---|---|---|
| 潜客池作为客户管理子菜单不合理 | ✅ 确认 | Sidebar.vue:35 潜客池在"客户管理"下 | P2 |
| 点击正式客户/公海池/潜客池都跳全部客户 | ✅ 确认 | List.vue:398-412 watch 重置 activeTab | P0 |
| 没有真正的数据隔离 | ✅ 确认 | 单一 API + 维度不一致的筛选条件 | P0 |
| 客户生命周期逻辑混乱（潜客/正式/公海） | ✅ 确认 | 三字段语义重叠 + convertToCustomer 不更新 status | P0 |
| 希望支持完整 CRM 流程 | 需重构 | 当前状态机割裂，无法支撑 lead→customer→opportunity→quote→contract→order→payment 完整链路 | P1 |

---

**审计结论**：当前客户管理模块存在 7 个 P0 级业务正确性问题，3 个 P0 级问题的根因是"三份不一致的实现 + 状态字段语义重叠 + 前端 watch 逻辑缺陷"。推荐采用"方案 B：单表模型 + 生命周期字段统一"进行渐进式重构，分 4 期执行，总工期约 16-24 天，期间保持向后兼容。

**等待用户确认后，再开始执行任何代码修改。**

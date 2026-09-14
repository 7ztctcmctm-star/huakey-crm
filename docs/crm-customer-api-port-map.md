# 客户管理「逻辑端口」全景图与收敛建议

> 生成时间：2026-09-12
> 范围：`/api/v1/customer`、`/api/v1/customers`、`/api/v1/leads`、`/api/v1/pool` 四条客户域路由树
> 依据：`backend/app.js`（挂载点）、`backend/routes/**`（端点定义）、`frontend/src/api/*.js`（前端消费面）
> 性质：**只读盘点 + 收敛建议**，未改动任何代码

---

## 一、结论速览

客户域**同时存在 4 条已挂载的路由树、共 61 个端点**，其中 **31 个是前端 0 引用的兼容层/重复端口**。

| 路由树 | 挂载点 | 来源文件 | 挂载方式 | 端点数 | 前端在用 | 0 引用 |
|---|---|---|---|---|---|---|
| A 新树 | `/api/v1/customers` | `routes/customers.js` | 直接 `use` | 9 | 9 | 0 |
| B 老树 | `/api/v1/customer` | `routes/customer/`（6 文件） | **ModuleRegistry 自动挂载** | 41 | 10 | 31 |
| C 线索 | `/api/v1/leads` | `routes/leads.js` | 直接 `use` | 2 | 2 | 0 |
| D 公海 | `/api/v1/pool` | `routes/pool.js` | 直接 `use` | 9 | 9 | 0 |
| **合计** | | | | **61** | **30** | **31** |

**核心判断**：老树 `/api/v1/customer` **不是**整体死代码——它是「一半僵尸 + 一半一等公民」的混合体：

- **僵尸部分（31 个）**：客户 CRUD、导出、状态机、池化视图、认领/释放、批量操作、导入入队、分配日志、自动分配、公海日志——这些能力**已被 A/C/D 三条新树完整取代**，且前端 0 引用。
- **一等公民部分（10 个）**：分配、联系人、360 视图、分配规则、导入预览/确认、逾期、临期回收、销售列表——**新树尚未覆盖**，前端仍在用。

---

## 二、挂载机理（易踩坑点）

```js
// backend/app.js
// 173-178 行：注册模块（副作用注册）
const registry = require('./core/ModuleRegistry');
require('./routes/customer/module');   // → registry.register('customer', { routes: routes/customer/index.js })

// 306-309 行：自动挂载
for (const { prefix, router } of registry.getAllRoutes()) {
  apiRouter.use(prefix, router);       // prefix = '/' + name = '/customer'
}

// 311-314 行：Phase 5 三条独立树
apiRouter.use('/leads',     require('./routes/leads'));
apiRouter.use('/pool',      require('./routes/pool'));
apiRouter.use('/customers', require('./routes/customers'));
```

> ⚠️ **坑点**：`ModuleRegistry.getAllRoutes()` 用 `prefix = '/' + name` 生成挂载前缀。`module.js` 注册名是 `'customer'`（单数），所以老树挂在 **`/customer`**。**任何 `grep routes/customer` 的静态排查都会漏掉这条自动挂载**——只有读到 `app.js:307` 的 for 循环才能确认它在线。

---

## 三、端点明细（按逻辑操作归类）

### 3.1 客户列表 / 正式客户 —— ⚠️ 4 个端口做同一件事

| 逻辑操作 | Method | 路径 | 权限码 | 处理器 | 前端 |
|---|---|---|---|---|---|
| 全量列表 | POST | `/customers/list` | `customer:view` | `list` | ✅ `getCustomerList` |
| 全量列表 | POST | `/customer/list` | ~~`customer:list`~~ → `customer:view` ✅已对齐 | `list` | ❌ 僵尸 |
| 正式客户列表 | POST | `/customers` | `customer:view` | `listFormal` | ✅ `getFormalCustomers` |
| 正式客户列表 | POST | `/customer/formal` | ~~`customer:list`~~ → `customer:view` ✅已对齐 | `listFormal` | ❌ 僵尸 |

### 3.2 客户 CRUD —— ⚠️ 全部双份

| 逻辑操作 | 新树（在用） | 老树（僵尸） |
|---|---|---|
| 新增 | POST `/customers/add` | POST `/customer/add` |
| 编辑 | POST `/customers/update` | POST `/customer/update` |
| 删除 | POST `/customers/delete` | POST `/customer/delete` |
| 详情 | GET `/customers/detail/:id` 🔒 | GET `/customer/detail/:id` ⚠️**无权限校验** |
| 导出 | POST `/customers/export` | POST `/customer/export` |
| 状态推进 | POST `/customers/forward` | POST `/customer/forward` |
| 状态回退 | POST `/customers/backward` | POST `/customer/backward` |

### 3.3 池化视图（线索池 / 公海池）—— ⚠️ 3 套并存

| 逻辑操作 | 新树 | 老树（僵尸） |
|---|---|---|
| 潜客池列表 | POST `/leads`（`leads:view`） | POST `/customer/leads-pool`（~~`customer:list`~~ → `customer:view`） |
| 潜客转正式 | POST `/leads/convert`（`leads:convert`） | POST `/customer/convert-lead`、POST `/customer/convert-to-customer` |
| 公海池列表 | POST `/pool`（`pool:view`） | POST `/customer/pool-list`（~~`customer:list`~~ → `customer:view`） |
| 认领公海 | POST `/pool/claim`（`pool:claim`） | POST `/customer/claim-pool`、POST `/customer/claim` |
| 释放到公海 | POST `/pool/release`（`customer:release`） | POST `/customer/release-to-pool`、POST `/customer/release` ✅ |

> 注：`/customer/release` 是**唯一仍在用的**池化老端点（前端 `releaseCustomer`），与 `/pool/release` 功能重叠但前端保留了两条调用口，属**待决策项**。

### 3.4 老树独占能力（新树未覆盖，前端在用）—— 10 个，**不可删**

| Method | 路径 | 权限码 | 前端函数 |
|---|---|---|---|
| POST | `/customer/assign` | `customer:assign` | `assignCustomer` |
| POST | `/customer/batch-assign` | `customer:assign` | `batchAssignCustomer` |
| GET | `/customer/sales-users` | `customer:assign` | `getSalesUsers` |
| GET | `/customer/my-subordinates` | 仅登录 | `getMySubordinates` |
| GET | `/customer/:id/360` | ~~`customer:list`~~ → `customer:view` ✅已对齐 | `getCustomer360` |
| GET | `/customer/overdue` | `customer:view` | `getOverdueCustomers` |
| GET | `/customer/near-recycle` | `customer:view` | `getNearRecycleCustomers` |
| GET | `/customer/assign-rules` | `manager` | `getAssignRules` |
| POST | `/customer/assign-rules/{add,update,delete}` | `manager` | 3 个 |
| POST | `/customer/contact/{add,update,delete}` | `customer:edit` | 3 个 |
| GET | `/customer/template` | 仅登录 | `getCustomerTemplate` |
| POST | `/customer/import-preview` | `customer:import` | `importPreview` |
| POST | `/customer/import-confirm` | `customer:import` | `importConfirm` |

### 3.5 老树 0 引用端点清单（31 个，下线候选）

```
POST /customer/list              POST /customer/add               POST /customer/update
POST /customer/delete            GET  /customer/detail/:id        POST /customer/export
POST /customer/forward           POST /customer/backward          POST /customer/formal
POST /customer/leads-pool        POST /customer/pool-list         POST /customer/convert-lead
POST /customer/convert-to-customer                                 POST /customer/release-to-pool
POST /customer/claim-pool        POST /customer/claim             POST /customer/batch-claim
POST /customer/batch-release     POST /customer/auto-assign       POST /customer/assign-log
POST /customer/pool-log          POST /customer/contact/list      POST /customer/import
```

（共 23 项；另有 `/customer/assign-rules/*` 等 8 项属"在用"，不计入）

---

## 四、发现的 4 个实质问题

| # | 严重度 | 状态 | 问题 | 证据 | 影响 |
|---|---|---|---|---|---|
| **P1** | 中 | ✅ 已修复 2026-09-14 | **权限码双轨**：同一「查看客户」动作，新树用 `customer:view`，老树用 `customer:list` | `customers.js:133` vs `customer/detail.js:209` | 角色只授其一 → 一端 403、一端 200，表现为"偶发权限异常" |
| **P2** | **高** | ✅ 已修复 2026-09-14 | **老树详情缺权限校验**：`GET /customer/detail/:id` 只有 `authenticateToken + checkDataPermission`，**无 `checkPermission`** | `customer/detail.js:228` | 同一数据两条端口密级不一致；只要 `customer:edit/delete`（无 view）的角色也能读全量详情 |
| **P3** | 中 | 备忘 | **`customer:view` 曾是幽灵权限码**：迁移注释明载"被多处路由引用但从未创建"，后靠补丁迁移补建 | `ci-remaining-migrations.sql:1231` | 权限矩阵存在"代码先于数据"的历史债，同类风险可能复发 |
| **P4** | 低 | ✅ 已修复 2026-09-14 | **兼容层注释已过期**：`customers.js` 头注释称"前端逐步切换"，实际前端**已切换完毕** | `customers.js:18-19` vs `api/customer.js:6-17` | 读者误判老树还在服务，阻碍清理决策 |

---

## 五、收敛建议（分三阶段，按风险递增）

### 阶段 1 —— 零风险修补 ✅ 已完成（2026-09-14，按新树口径统一为 `customer:view`）

1. ✅ **统一列表类权限码**：老树 `detail.js`（`/list`、`/:id/360`、`/export`）、`center.js`（`/leads-pool`、`/formal`、`/pool-list`）共 6 处 `checkPermission('customer:list')` → `customer:view`。
2. ✅ **补齐 `GET /customer/detail/:id` 的 `checkPermission('customer:view')`**（P2 越权），与 `/customers/detail/:id` 密级对齐。
3. ✅ **订正 `customers.js` 头注释**（P4）。
4. ✅ **连带同步**：`module.js` 权限清单、`views/system/role.vue` 角色预设、2 个后端测试夹具 + 1 个前端 mock。

**安全性依据（数据层已保证，非"顺带改"）**：迁移 **098** 明确约定「保留旧码 `customer:list`；**拥有旧码 `customer:list` 的角色自动获得 `customer:view`**」，且其权限矩阵已把 `customer:view` 授予 sales(✓)/manager(✓)/boss(manage_all=1 自动绕过)。故切换到 `customer:view` 不会锁死任何既有角色。

### 阶段 2 —— 清理重复 CRUD（中风险，需回归测试）

删除老树中已被新树取代的 23 个 0 引用端点（§3.5），此阶段需同步：
- 检查 `tests/` 下 9 个直接 `require('routes/customer/*')` 的用例是否断言这些端口（`customer.test.js`、`boundary.test.js`、`permissionMatrix.test.js` 等）；
- 更新 `docs/API_VERSIONING.md` 的端点台账。

### 阶段 3 —— 单树归拢（长期，可延后）

把老树剩余 10 个「能力型」端点迁到 `/customers/*` 命名空间（如 `/customers/:id/contacts`、`/customers/assign`），最终让 `/api/v1/customer` 整树下线。此阶段同时改造前端 `api/customer.js` 与 9 个测试夹具。

> **推荐路径**：先做阶段 1（本回合可交付），阶段 2 并入下一次「客户域专项清理」，阶段 3 待 Core v1 发布后的架构迭代窗口。**Core v1 冻结期内不建议动阶段 3。**

---

## 六、附：前端消费面权威清单

前端**唯一**的 API 出口是 `frontend/src/api/{customer,leads,pool}.js`；页面中的 `/customer/detail/:id`、`/customer/list` 均为 **Vue Router 前端路由**，与 HTTP 端口无关（易误判为端口，特此注明）。

```
customer.js → 新树 9 个（/customers/*）
            → 老树 14 个（/customer/{assign,batch-assign,contact/*,sales-users,
                                  my-subordinates,:id/360,release,assign-rules*,
                                  template,import-preview,import-confirm,overdue,near-recycle}）
leads.js    → POST /leads, POST /leads/convert
pool.js     → POST /pool, /pool/claim, /pool/release, /pool/transfer/*
```

---

## 七、本次变更记录（2026-09-14 · 阶段 1 落地）

**原则**：按新树口径统一为 `customer:view`（用户指定）。

| 文件 | 变更 |
|---|---|
| `backend/routes/customer/detail.js` | 3 处 `customer:list` → `customer:view`；**`GET /detail/:id` 补 `checkPermission('customer:view')`** |
| `backend/routes/customer/center.js` | 3 处 `customer:list` → `customer:view`；头注释同步 |
| `backend/routes/customer/module.js` | 权限清单移除 `'customer:list'`（保留 `'customer:view'`） |
| `backend/routes/customers.js` | 头注释订正（前端已切换完毕；老树剩余能力端口清单） |
| `backend/tests/e2e/permission-real.integration.test.js` | `PERMISSIONS` + `ROLE_PERMISSIONS` 中 `customer:list` → `customer:view` |
| `backend/tests/customerDetail.test.js` | 权限 mock 同步为 `customer:view` |
| `backend/tests/unit/core/ModuleRegistry.test.js` | 测试内自注册权限串统一为 `customer:view`（一致性） |
| `frontend/src/views/system/role.vue` | 角色预设 `sales` / `service` 中 `customer:list` → `customer:view` |
| `frontend/src/tests/mocks/handlers.js` | `MOCK_USER.permissions` 同步 |

**刻意未改**：`detail.js` 的缓存键 `customer:list:${userId}:${body}`（属"操作命名空间"而非权限码；`customerController.test.js` 有 3 处断言依赖它，且 controller 的 `invalidateCache(['customer:list:*'])` 与之配对）。

**行为影响**：无。boss=`manageAll` 绕过、manager/sales 已持有 `customer:view`、其余角色本无 `customer:list`；且迁移 098 已强制 `customer:list ⊂ customer:view` 的持有关系。

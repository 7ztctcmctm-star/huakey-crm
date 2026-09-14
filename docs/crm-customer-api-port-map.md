# 客户管理「逻辑端口」全景图与收敛建议

> 生成时间：2026-09-12
> 范围：`/api/v1/customer`、`/api/v1/customers`、`/api/v1/leads`、`/api/v1/pool` 四条客户域路由树
> 依据：`backend/app.js`（挂载点）、`backend/routes/**`（端点定义）、`frontend/src/api/*.js`（前端消费面）
> 性质：**只读盘点 + 收敛建议**，未改动任何代码

---

## 一、结论速览

客户域原有 **4 条已挂载的路由树、共 61 个端点**。
经 **阶段 2（2026-09-14）移除 7 个零依赖重复端点**后，现为 **54 个端点**（下表为阶段2后口径）。
经 **阶段 3（2026-09-14）「只扩不收」**后，老树的 **10 个能力型端点**已**同时**挂载到
`/api/v1/customers/*`（复用同一 router 对象，**无重复实现**），前端 18 处调用全部切到 `/customers/*`；
`/api/v1/customer/*` 作为**兼容层原样保留至 v2**。故**端点定义数不变（54）**，但**权威命名空间收敛为 `/customers`**。

| 路由树 | 挂载点 | 来源文件 | 挂载方式 | 端点数 | 前端在用 | 0 引用 |
|---|---|---|---|---|---|---|
| A 新树 | `/api/v1/customers` | `routes/customers.js` + 阶段3 复挂的 4 个能力路由 | 直接 `use` | 9（+10 能力端点复挂） | 19 | 0 |
| B 老树 | `/api/v1/customer` | `routes/customer/`（**5 文件**） | **ModuleRegistry 自动挂载** | **34** | 0（阶段3 后仅作兼容层） | **34** |
| C 线索 | `/api/v1/leads` | `routes/leads.js` | 直接 `use` | 2 | 2 | 0 |
| D 公海 | `/api/v1/pool` | `routes/pool.js` | 直接 `use` | 9 | 9 | 0 |
| **合计** | | | | **54** | **30** | **34** |

> 阶段3 后 B 树「前端在用」降为 **0**——所有消费面已切到 A 树；B 树仍在线以承接
> 已发布的外部 API 集成（`api-platform` 契约），故保留。

**核心判断**：老树 `/api/v1/customer` **不是**整体死代码——它是「一半僵尸 + 一半一等公民」的混合体：

- **僵尸部分（阶段2前 31 个 → 现 24 个）**：客户 CRUD、导出、状态机、认领/释放、批量操作、导入入队、分配日志、自动分配、公海日志——这些能力**已被 A/C/D 三条新树完整取代**，且前端 0 引用。
  （**池化视图 6 个 + convert-to-customer 1 个已于阶段2移除**，见 §七）
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

// 316-322 行：阶段3「只扩不收」——把老树的能力型子路由复用挂到 /customers 下
// （同一 router 对象，无重复实现；老树 /customer/* 兼容层保留至 v2）
apiRouter.use('/customers/contact', require('./routes/customer/contact'));
apiRouter.use('/customers',         require('./routes/customer/assign'));
apiRouter.use('/customers',         require('./routes/customer/import'));
apiRouter.use('/customers',         require('./routes/customer/detailExtras'));
```

> ⚠️ **坑点**：`ModuleRegistry.getAllRoutes()` 用 `prefix = '/' + name` 生成挂载前缀。`module.js` 注册名是 `'customer'`（单数），所以老树挂在 **`/customer`**。**任何 `grep routes/customer` 的静态排查都会漏掉这条自动挂载**——只有读到 `app.js:307` 的 for 循环才能确认它在线。
>
> 💡 **阶段3 关键手法**：能力型端点**不是复制粘贴**到新树，而是**把同一个 router 对象再 `use` 一次**——同一份中间件与处理器被两个前缀共享，因此不存在"两套实现漂移"的风险。`detail.js` 中抽出的 3 个端点（360/overdue/near-recycle）亦同理。

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

### 3.3 池化视图（线索池 / 公海池）—— ✅ 已收敛（阶段2 移除老树端口）

| 逻辑操作 | 新树（唯一端口） | 老树（已移除 2026-09-14） |
|---|---|---|
| 潜客池列表 | POST `/leads`（`leads:view`） | ~~POST `/customer/leads-pool`~~ |
| 潜客转正式 | POST `/leads/convert`（`leads:convert`） | ~~POST `/customer/convert-lead`~~、~~`/customer/convert-to-customer`~~ |
| 公海池列表 | POST `/pool`（`pool:view`） | ~~POST `/customer/pool-list`~~ |
| 认领公海 | POST `/pool/claim`（`pool:claim`） | ~~POST `/customer/claim-pool`~~ |
| 释放到公海 | POST `/pool/release`（`customer:release`） | ~~POST `/customer/release-to-pool`~~ |

> 残留待决策：`POST /customer/claim`（assign.js，已被 `/pool/claim` 取代，仅 assign.test.js 引用）
> 与 `POST /customer/release`（**前端仍在用**，`releaseCustomer`）——二者属 `assign.js`，本轮未动。

### 3.4 能力型端点（阶段3 后**双前缀可用**，前端已切新树）

**阶段3（2026-09-14）处置**：以下 10 个能力端点**未迁走、未复制**，而是把承载它们的
`assign.js` / `contact.js` / `import.js` + 新抽出的 `detailExtras.js` **同一 router 对象
再挂一次到 `/customers`**。因此同一份实现同时响应 `/customers/*` 与 `/customer/*`，
**无重复实现、无漂移风险**；前端 18 处调用已全部改指 `/customers/*`。

| Method | 权威路径（前端在用） | 兼容路径（保留至 v2） | 权限码 | 前端函数 |
|---|---|---|---|---|
| POST | `/customers/assign` | `/customer/assign` | `customer:assign` | `assignCustomer` |
| POST | `/customers/batch-assign` | `/customer/batch-assign` | `customer:assign` | `batchAssignCustomer` |
| GET | `/customers/sales-users` | `/customer/sales-users` | `customer:assign` | `getSalesUsers` |
| GET | `/customers/my-subordinates` | `/customer/my-subordinates` | 仅登录 | `getMySubordinates` |
| GET | `/customers/:id/360` | `/customer/:id/360` | `customer:view` | `getCustomer360` |
| GET | `/customers/overdue` | `/customer/overdue` | `customer:view` | `getOverdueCustomers` |
| GET | `/customers/near-recycle` | `/customer/near-recycle` | `customer:view` | `getNearRecycleCustomers` |
| GET | `/customers/assign-rules` | `/customer/assign-rules` | `manager` | `getAssignRules` |
| POST | `/customers/assign-rules/{add,update,delete}` | 同左 | `manager` | 3 个 |
| POST | `/customers/contact/{add,update,delete}` | 同左 | `customer:edit` | 3 个 |
| GET | `/customers/template` | `/customer/template` | 仅登录 | `getCustomerTemplate` |
| POST | `/customers/import-preview` | `/customer/import-preview` | `customer:import` | `importPreview` |
| POST | `/customers/import-confirm` | `/customer/import-confirm` | `customer:import` | `importConfirm` |

> **实现与验证**：`GET /customers/:id/360`、`/customers/overdue`、`/customers/near-recycle`
> 由 `routes/customer/detail.js` 抽出为独立 `detailExtras.js`（原 `detail.js` 内联实现删除，
> `detail.js` 改为 `router.use('/', detailExtras)`），再由 `app.js` 同时挂到两个前缀。
> supertest 实测：新路径 401（存在、需鉴权）、旧路径 401（兼容层在线）、阶段2 删除端点 404。

### 3.5 老树 0 引用端点清单（阶段2 后 24 个，剩余下线候选）

**已于阶段2（2026-09-14）移除 —— 7 个「零测试 + 零前端 + 已被新树取代」：**

```
POST /customer/leads-pool        POST /customer/pool-list         POST /customer/convert-lead
POST /customer/convert-to-customer                                POST /customer/release-to-pool
POST /customer/claim-pool        POST /customer/formal
```
（含 `routes/customer/center.js` 整体删除 + `index.js` 的 `convert-to-customer`）

**剩余 24 个（本轮未动，各自有阻塞原因）：**

```
POST /customer/list ✱            POST /customer/add ✱             POST /customer/update ✱
POST /customer/delete ✱          GET  /customer/detail/:id ✱      POST /customer/export ✱
POST /customer/forward ✱         POST /customer/backward ✱        POST /customer/claim ✱
POST /customer/assign-log ✱      POST /customer/batch-claim       POST /customer/batch-release
POST /customer/auto-assign       POST /customer/pool-log          POST /customer/contact/list
POST /customer/import
```
✱ = 有测试文件断言（删则需同步改写测试）；其余为**唯一能力、新树无替代**（批量认领/批量释放/自动分配/公海日志/联系人列表/异步导入），删除会丢失功能。

> **`/customer/list` 等 CRUD 端点额外阻塞**：应用内「API 开放平台」页
> （`frontend/src/views/settings/api-platform.vue:74`）把它作为**对外集成示例**宣传，
> 硬删会破坏已公开的 API 契约 → 建议 v2 再做。

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

### 阶段 2 —— 清理重复端点 ✅ 已执行（2026-09-14，**收窄为 7 个零依赖端点**）

原计划删 23 个，实测影响面后**收窄为 7 个**（§3.5），原因：
1. 其中 8 个 CRUD/claim/assign-log/import 端点被 **11 个测试文件**断言 → 删除须改写 Core v1 的 QA 证据；
2. `/customer/list` 被**应用内「API 开放平台」页作为对外集成示例宣传** → 属已公开 API 契约；
3. 另有 6 个（batch-claim / batch-release / auto-assign / pool-log / contact/list / async import）是**唯一能力**，新树无替代 → 删除会丢功能。

**实际执行**：删除 `routes/customer/center.js`（6 端点）+ `index.js` 的 `convert-to-customer`，
均为零测试引用、零前端调用、已由 `/customers`、`/leads`、`/pool` 完整取代。同步更新 `leads.js`/`pool.js`/`api/*.js` 注释与 2 份文档。

> 原计划中「更新 `docs/API_VERSIONING.md` 端点台账」一项作废——该文档是**路径前缀策略**，并无端点台账。

### 阶段 3 —— 命名空间归拢 ✅ 已执行（2026-09-14，**范围=「只扩不收」**）

**决策**：用户选定「**只扩不收**」——在 `/customers/*` 下建立能力端点的**权威地址**，
前端全部切过去；老树 `/api/v1/customer/*` **原样保留**（已发布的外部 API 契约，直至 v2）。
**不删除任何老树端点、不改写任何断言老树的测试**，因此**零破坏性**。

**做法（关键：不是复制实现）**：
1. 抽出 `routes/customer/detailExtras.js`（`/:id/360`、`/overdue`、`/near-recycle`），
   `detail.js` 内联实现删除、改为 `router.use('/', detailExtras)`；
2. `app.js` 把 `contact` / `assign` / `import` / `detailExtras` **同一 router 对象**
   再挂一次到 `/customers` → 两个前缀共享实现；
3. 前端 `api/customer.js` 18 处调用 `/customer/*` → `/customers/*`；
   `api-platform.vue` 对外示例切到 `/customers/list`。

**与「完整单树归拢」的差距（留 v2）**：老树整树未下线；6–7 个断言老树的测试未改写。
（`useAssign.js` 死代码与 `convertToCustomer` 孤立方法已于 2026-09-14「死代码清理」删除，见 §九。）详见 §八。

> **推荐路径**：先做阶段 1（已交付），阶段 2 并入下一次「客户域专项清理」（已交付），
> 阶段 3「只扩不收」已交付；**阶段 3+「真·单树」**（老树下线 + 测试改写）待 Core v1 发布后的架构迭代窗口。

---

## 六、附：前端消费面权威清单

前端**唯一**的 API 出口是 `frontend/src/api/{customer,leads,pool}.js`；页面中的 `/customer/detail/:id`、`/customer/list` 均为 **Vue Router 前端路由**，与 HTTP 端口无关（易误判为端口，特此注明）。

```
customer.js → 全部 27 个客户端点（/customers/*）：
              9  个 CRUD/列表/导出/状态机（customers.js）
            + 18 个能力型（assign / batch-assign / sales-users / my-subordinates /
                             :id/360 / release / assign-rules×4 / template /
                             import-preview / import-confirm / contact×3 /
                             overdue / near-recycle）
leads.js    → POST /leads, POST /leads/convert
pool.js     → POST /pool, /pool/claim, /pool/release, /pool/transfer/*
```

> ✅ **已清理（2026-09-14 §九）**：`frontend/src/composables/useAssign.js` 曾**绕过统一出口**自行拼
> `/customer/{sales-users,assign,batch-assign}`（重复实现），且**全仓零引用**。该文件已于本轮删除。

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

### 阶段 2 变更记录（2026-09-14 · 移除 7 个零依赖重复端点）

| 文件 | 变更 |
|---|---|
| `backend/routes/customer/center.js` | **删除整个文件**（6 端点：leads-pool / formal / pool-list / convert-lead / release-to-pool / claim-pool） |
| `backend/routes/customer/index.js` | 移除 `centerRoutes` 挂载 + `POST /convert-to-customer`；清理 4 个随之失效的 import |
| `backend/routes/leads.js`、`routes/pool.js` | 头注释：去掉「旧端点保留为兼容层」，改为「已移除」；Schema 注释中的 center.js 引用订正 |
| `frontend/src/api/leads.js`、`api/pool.js` | 同上注释订正 |
| `docs/CODE_DOCUMENTATION.md` | center.js 章节标记已移除；`leads/pool` 旧端点说明改写；`index.js` 聚合描述 5→4 子路由 |
| `docs/crm-customer-api-port-map.md` | 本文件：端点计数 61→54、僵尸 31→24、§3.3/§3.5/§五 全部改写 |

**保留未动（已于 2026-09-14 §九 清理）**：`customerController.convertToCustomer` / `customerService.convertToCustomer`
随路由下线成为孤立方法——阶段2 为控制爆炸半径暂留，阶段3 后确认零引用，已在「死代码清理」中删除。

**验证**：删除后旧端点返回 404；后端客户相关测试、真实 DB 权限集成、前端单测全部保持全绿（见提交信息）。

### 阶段 3 变更记录（2026-09-14 · 「只扩不收」，零破坏性）

| 文件 | 变更 |
|---|---|
| `backend/routes/customer/detailExtras.js` | **新增**：承接 `/:id/360`、`/overdue`、`/near-recycle`（均 `customer:view`），供两个前缀共享 |
| `backend/routes/customer/detail.js` | 移除上述 3 端点内联实现 + 随之失效的 import/schema；改 `router.use('/', detailExtras)`；保留 `pool`（`canManageCustomer` 导出仍用） |
| `backend/app.js` | 新增 4 行：把 `contact` / `assign` / `import` / `detailExtras` 复挂到 `/customers` |
| `frontend/src/api/customer.js` | **18 处** `/customer/*` → `/customers/*`；头注释同步为「统一走 /customers」 |
| `frontend/src/composables/useAssign.js` | 3 处路径切到 `/customers/*`（该文件**全仓零引用**，已于 §九 删除） |
| `frontend/src/views/settings/api-platform.vue` | 对外请求示例 `/customer/list` → `/customers/list` |
| `docs/CODE_DOCUMENTATION.md` | 客户域挂载说明：`/customers` 现同时承载能力子路由 |
| `docs/crm-customer-api-port-map.md` | 本文件：§一/§二/§3.4/§五/§六 全部改写，新增 §八 |

**验证**：
- supertest 路由探针：新 `/customers/*` → 401（存在需鉴权）、旧 `/customer/*` → 401（兼容层在线）、阶段2 删除端点 → 404；
- 后端 Jest：**114 套件 / 1098 用例全绿**（需 `DB_PASSWORD=huakey123`，否则真连库用例报 `Access denied`）；
- 真连库集成：`permission-real` + `customer-lifecycle` 全绿（需 `NODE_PATH=<repo>/backend/node_modules`）；
- 前端 Vitest：**15 文件 / 64 用例全绿**（`customer.test.js` 补 7 条能力端点断言，4→11）。

**后端路由无冲突复核**：`customers.js` 仅有 `/`、`/list`、`/add`、`/update`、`/delete`、
`/detail/:id`、`/forward`、`/backward`、`/export` 等**具名**路由，无 `/:id` 通配，
故不会吞掉复挂的 `/assign`、`/template`、`/:id/360` 等；`use` 前缀匹配按挂载顺序回落到
下一个 router，实测路径均命中预期处理器。

**遗留（v2）**：①老树 `/api/v1/customer/*` 整树下线；②6–7 个断言老树的测试文件改写。
~~③`useAssign.js` 死代码删除~~ ✅ 已做（§九）；~~④`customerController.convertToCustomer` 等孤立方法清理~~ ✅ 已做（§九）。

---

## 九、死代码清理（2026-09-14 · 阶段3 收尾）

**范围**：仅清理**已确认零引用**的死代码，不触碰老树端点、不改任何测试、不改公开 API 契约。

| 对象 | 判定依据 | 处置 |
|---|---|---|
| `frontend/src/composables/useAssign.js` | 全仓（含 `src/tests`、`e2e`、`scripts`）零 import；且与 `api/customer.js` 的 3 个函数重复 | **删除文件** |
| `customerController.convertToCustomer` | 路由 `POST /customer/convert-to-customer` 于阶段2 下线后无人调用；全仓仅「定义 + 导出」 | 删除函数 + 导出项 |
| `customerService.convertToCustomer` | 仅被上面的 controller 方法调用；全仓仅「定义 + 导出」 | 删除函数 + JSDoc + 导出项 |
| `customerController.{listLeads, convertLead, batchConvertLeads, importLeads, claimLead, markLeadLost, getLeadsStats}` | **旧版 leads 控制器包装**。`/api/v1/leads` 已改用 `listLeadPool` / `convertLeadToFormal`（Phase 5）；全仓零路由/零测试引用 | 删除 7 个方法 + 导出项 + 随之失效的 `leadsService` 导入 |

**连带核查（无孤儿）**：stage2 删除的 `center.js` 曾调用的 6 个方法中，
`listFormal`（`customers.js`）、`listLeadPool`/`convertLeadToFormal`（`leads.js`）、
`listPoolNew`/`claimPool`/`releaseToPool`（`pool.js`）**均已迁到新树**，无孤儿。
`customerService` 的 `AppError`/`ErrorCodes`/`BUSINESS_STATUS`/`CUSTOMER_STATUS` 导入仍被其余 10~24 处引用，**不产生失效导入**。

**扫描器复核**：对 `customerController` / `customerService` 的全部导出做「接收方前缀 + 全仓文本」零引用扫描 →
`customerController` 32 个导出**零死码**；`customerService` 25 个导出中 7 个无外部引用
（`VALID_SOURCES`、`SOURCE_PARENT_MAP`、`batchAssignCustomers`、`loadStatusConfig`、`loadStatusTransitions`、`getDefaultStatus`、`clearStatusConfigCache`）。

### 登记但**未清理**（超出「客户 API 端口」谱系，待独立决策）

| 对象 | 说明 |
|---|---|
| `customerService.{VALID_SOURCES, batchAssignCustomers, getDefaultStatus, clearStatusConfigCache}` | 外部零引用且**本文件内亦无调用**（仅「定义 + 导出」）；属**状态配置/常量子系统**的导出面，非 API 端口死码 |
| `customerService.{SOURCE_PARENT_MAP, loadStatusConfig, loadStatusTransitions}` | 外部零引用，但**本文件内有调用** → 仅「导出」冗余，函数本身在用 |
| `backend/services/leadsService.js`（整文件） | 删掉上述 7 个 controller 包装后，该服务**已无生产调用方**，仅由 `tests/unit/services-leadsService.test.js` 覆盖。删除与否需单独决策（含其测试），故本轮保留 |

**验证**：删除后后端 Jest + 真连库集成 + 前端 Vitest 全绿（见提交信息）。

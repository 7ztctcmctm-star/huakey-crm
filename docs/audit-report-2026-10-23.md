# HUAKEYCRM 全面体检报告 V1.1

> 报告日期：2026-10-23  
> 版本说明：V1.1 在 V1 基础上增补前端契约复核，新增 P0-12 / P0-13 与 P1-21～P1-28；V1 已确认结论与 44/100 评分保持不变。  
> 审计对象：`C:\huakey-crm`，当前分支 `main`，HEAD `2b00eea`  
> 审计性质：**只读审计**。本报告完成前未修改任何业务代码、未执行任何数据库写操作。  
> 依据：`AGENTS.md` 第三章 Phase 0、第八章 13 项输出、第十二章十步扫描。

---

## 0. 审计范围、方法与限制（必须先看）

### 0.1 实际执行过的检查

| 检查项 | 是否执行 | 说明 |
|---|---|---|
| 全仓库静态代码扫描 | ✅ | routes / services / middleware / utils / migrations / frontend / deploy |
| 本地 MySQL 只读查询 | ✅ | `schema_migrations`、`sys_permission`、`sys_role_permission`、`crm_customer`、`crm_pool_log`、索引、数据量 |
| 后端 Jest 测试 | ✅ | `Test Suites: 2 failed, 163 passed`；`Tests: 3 failed, 1600 passed` |
| 前端 Vitest 测试 | ✅ | 18 个文件 / 138 个用例全部通过，但出现 7 个 worker 启动超时错误 |
| 后端 ESLint | ✅ | 0 warning / 0 error |
| 前端生产构建 | ❌ | 未执行 |
| 后端服务启动 + 真实 HTTP 调用 | ❌ | 审计时后端未运行，未做接口实测 |
| Playwright E2E | ❌ | 未执行 |
| 备份恢复演练 | ❌ | 未执行；不能声称备份可恢复 |
| NAS / Docker 运行时验证 | ❌ | 仅做 compose / Dockerfile / nginx 静态检查 |

### 0.2 重要限制

1. **本地数据库不等于生产库**。`.env` 指向本机 MySQL（`DB_HOST=localhost`、`DB_NAME=huakey_crm`），不是群晖 NAS 生产库。本报告所有“实测数据库状态”均指本机库；生产库是否同样漂移**未验证**。
2. **没有真实请求验证**。权限、IDOR、并发类结论来自代码路径 + 数据库授权数据的静态推演；利用链已逐条对照代码，但未在运行中的服务上实际发起越权请求。
3. **子代理报告不当作已证实事实**。部署运维子代理的结论已标注“子代理静态审计”，其中关键项（镜像密钥、Redis 健康检查、CORS 启动校验）已由本报告抽查确认；其余项仍需在 NAS 上复核。
4. **工作区有未提交改动**：`frontend/src/views/login/index.vue` 有修改，`.agents/` 未跟踪。它们不是本报告产生的，也未纳入本次审计结论。

---

## 1. 项目总体健康度

### 1.1 结论

**当前不具备生产上线条件。** 综合健康度约 **44 / 100**。  
不是“代码风格”问题，而是四类硬伤同时存在：

1. **数据库迁移漂移**：代码已依赖 120–124，但本机库停在 119；客户详情、评分、公海认领、报价转合同、采购提交等核心路径会直接 500。
2. **权限源与数据库漂移**：12 个后端路由正在使用的权限码在 `sys_permission` 中不存在；老板因 `manage_all` 绕过而“看起来正常”，经理/财务/销售/采购实际被锁死。
3. **授权边界缺失**：用户管理、客户释放、发票、合同、采购、附件、联系人、邮件、报表、日程等存在跨用户/跨部门操作路径。
4. **关键写路径缺少事务/锁/幂等**：回款计划重算、采购审批、自动分配、幂等键均存在竞态；重复回款/重复合同/重复审批风险真实存在。

### 1.2 分维度评分

| 维度 | 分数 | 判断 |
|---|---:|---|
| 架构与模块划分 | 65 | ModuleRegistry 与传统路由并存，Service 分层总体清晰 |
| 数据库与迁移 | 32 | 迁移漂移、约束缺失、部分 DDL 非事务 |
| 权限模型 | 28 | 功能码漂移 + 数据权限覆盖不全 + 无层级守卫 |
| 客户管理 | 45 | 核心详情页 500；释放越权；状态双写不一致 |
| 跟进系统 | 52 | 提醒分页错误；跟进写入无归属校验 |
| 报价 | 45 | 销售无法看报价详情；报价转合同依赖缺失表 |
| 采购/订单 | 38 | 写接口无数据范围；收货 item/order 不校验 |
| 财务/回款 | 33 | 回款计划并发丢更新；发票可被任意销售改删 |
| 文件系统 | 48 | 上传权限码缺失；附件删除无归属校验；`/uploads` 公开 |
| API / 前后端契约 | 45 | 权限码前后端不一致；部分页面按钮永久隐藏 |
| 前端 | 54 | 页面结构完整，但被后端权限/迁移问题拖垮 |
| 安全 | 25 | 存在多条可静态确认的提权/越权/令牌生命周期问题 |
| 性能 | 55 | 未见灾难性慢查询，但有 N+1、分页错误、Redis 故障放大 |
| 测试 | 60 | 1603 个后端用例、138 个前端用例，但 3 个失败 + 7 个 worker 错误 |
| Docker / NAS | 40 | Synology 栈设计较完整，但存在启动阻塞与密钥入镜像风险 |
| 数据备份 | 42 | 脚本齐全，但明文备份、密钥同机、恢复演练未执行 |

---

## 2. 十步扫描结果摘要

### 2.1 系统架构地图

```
浏览器
  └─ Vue 3 + Vite + Element Plus
       └─ axios（httpOnly Cookie + X-CSRF-Token）
            └─ Nginx（Synology 8443 / 其它栈 80/8080）
                 └─ Express 4（/api/v1）
                      ├─ authenticateToken（JWT + 黑名单 + 实时角色）
                      ├─ checkPermission（功能码，node-cache + Redis L2，5 分钟）
                      ├─ checkDataPermission（all/dept_and_sub/dept/self/custom）
                      ├─ Joi validate（stripUnknown）
                      ├─ Service 层（约 65 个）
                      └─ MySQL 8（主池 50 + 只读池）
                           └─ Redis（可选，限流 + 缓存）
```

### 2.2 数据库关系地图（关键链路）

```
sys_user ──< sys_role ──< sys_role_permission >── sys_permission
   │
   ├── crm_customer（owner_id, dept_id, status, business_status, pool_status）
   │      ├── crm_contact
   │      ├── crm_follow_up ── crm_follow_up_reminder
   │      ├── crm_opportunity
   │      ├── crm_quote ── crm_quote_item
   │      ├── crm_contract ── crm_payment_plan ── crm_payment
   │      ├── crm_invoice
   │      ├── crm_attachment
   │      ├── crm_customer_score_log
   │      └── crm_pool_log / crm_assign_log
   └── crm_purchase_order ── crm_purchase_item ── crm_purchase_receipt / crm_purchase_payment
```

### 2.3 功能模块地图

- 客户中心：列表 / 详情 / 360 / 线索池 / 公海池 / 分配 / 转移 / 释放 / 导入导出。
- 跟进：跟进记录、跟进计划、提醒、日历、模板。
- 售前：商机、报价、竞品、评分。
- 合同与财务：合同、回款计划、回款、发票。
- 采购：供应商、采购单、采购申请、比价、收货、付款。
- 支撑：用户 / 角色 / 部门 / 权限、报表、数据质量、邮件、知识库、审批、社媒、日程、目标、自动化、回收站、Cron。

### 2.4 权限模型地图

- 功能权限：`sys_role_permission` + `crm_user_permission`，`checkPermission` 精确匹配权限码。
- 数据权限：`sys_data_permission`，`all / dept_and_sub / dept / self / custom`。
- 绕过：`ADMIN_ROLE_CODES = new Set(['super_admin'])` 或角色 `manage_all=1`。
- 缓存：权限与数据权限均 5 分钟 node-cache；角色/用户权限变更已有主动失效逻辑。

### 2.5 客户生命周期模型

```
lead（线索/潜客池）
  └─ sea（公海，owner_id IS NULL）
       └─ following（跟进中）
            ├─ quoted（已报价）
            ├─ negotiating（谈判中）
            ├─ signed（已签约，终态）
            └─ lost（已流失，终态）
```

实际代码中同时存在 `status`（VARCHAR 状态码）与 `business_status`，并有历史 `pool_status` 字段；三者并非始终同步，是本报告多条问题的根因之一。

### 2.6 API / 前端 / 测试 / 部署扫描

- 后端路由 40+，其中 customer/product/report/data-quality 通过 ModuleRegistry 注册，其余传统直挂。
- 前端页面 40+，API 模块 26 个，权限指令 `v-permission` / `v-permission:all`。
- 后端 Jest 1603 个用例；前端 Vitest 138 个用例；E2E 未跑。
- 部署：Docker Compose（Synology 生产、prod、test、canary），Nginx TLS/CSP/HSTS，备份脚本在 `deploy/backup/`。

---

## 3. 分领域体检

### 3.1 架构问题

**总体判断：分层方向正确，但“权限/事务/幂等”三个横切能力没有统一收口。**

- `ModuleRegistry` 与传统直挂并存，导致权限校验写法不统一；大量路由是“`checkPermission` + Service 内再判断”的混合模式，容易出现漏判。
- 写接口普遍缺少统一的“数据范围 + 归属 + 状态机”守卫模板；同类漏洞在 customer / invoice / contract / purchase / upload 重复出现。
- `checkPermission` 对 `manageAll` 直接放行，测试和日常演示多用老板账号，**系统性掩盖了权限码漂移**。
- 前端路由守卫对 `manageAll` 同样放行，导致“老板能看到、别人 403”的问题长期不可见。

### 3.2 数据库与迁移问题

**P0：迁移漂移，核心读路径直接 500。**

实测本机库：

| 项目 | 实测值 |
|---|---|
| `schema_migrations` 行数 / 最大版本 | 116 / **119** |
| 仓库迁移文件 | 到 **124** |
| `crm_idempotency` | **不存在** |
| `crm_customer_score_log.deleted_at` | **不存在** |
| `crm_invoice.invoice_no` 唯一索引 | **不存在**（只有普通 `idx_invoice_no`） |
| `crm_payment_plan(contract_id, plan_date)` 唯一索引 | **不存在** |
| `crm_integrity_violation` | 不存在（123 未执行） |

未执行的 120–124：

- `120_manager_full_permissions.sql`：把 boss 的**全部**权限复制给 manager。
- `121_finance_sales_permission_gaps.sql`：finance 补 `quotation`，sales 补 `competitor*`。
- `122_crm_idempotency.sql`：创建幂等表。
- `123_integrity_constraints.sql`：发票号唯一、6 条外键、回款计划唯一。
- `124_customer_score_log_soft_delete.sql`：评分日志软删列 + 索引。

直接影响（本机库可静态确认）：

- `GET /api/v1/customers/:id/360` → `customerDetailService.js:482-488` 查询 `l.deleted_at` → `ER_BAD_FIELD_ERROR` → 500。**客户详情主页面 `frontend/src/views/customer/Detail.vue` 依赖此接口。**
- `POST /api/v1/scoring/calculate/:id`、`getCustomerScore` → `scoringRouteService.js:166 / 268-276` 同样引用缺失列 → 500。
- `POST /api/v1/pool/claim`、`/pool/transfer*`、`/quote/to-contract`、`/purchase/request/submit/:id` 调用 `runIdempotent` → 查询不存在的 `crm_idempotency` → 500。**公海认领主流程直接不可用。**
- 发票重号、回款计划重复、孤儿外键均无数据库约束兜底。

**迁移执行器风险（P1/P2）：**

- 生产 `Dockerfile.synology:62` 使用 `node database/migrate.js && exec node app.js`。
- `database/migrate.js` 逐文件执行，**单个文件失败后继续执行后续文件**，最后才 `exit(1)`；MySQL DDL 隐式提交，失败文件可能留下“执行了一半”的结构。
- `database/migrations/run_migrations.js` 才是“逐文件事务、失败即停”的严格版本；canary 使用它，生产没有。
- 本机库停在 119、代码已到 124，说明“启动自动迁移”并未可靠发生或曾失败后人工跳过。

### 3.3 权限问题

**P0：12 个路由正在使用的权限码在数据库中不存在。**

实测 `sys_permission` 缺失：

```
file, file:upload, invoice:view, payment:edit, quotation:view,
quotation:approve, purchase:request, purchase:comparison,
email:send, recycle_bin:view, data:restore, system:cron
```

这些码在 `backend/scripts/permission-definitions.js` 中**都有定义**（唯一真源），但从未同步进本机库。结果是：除 `boss`（`manage_all=1`）和 `super_admin` 外，相关功能全部 403。

具体影响：

| 路由 | 需要的码 | 实际后果 |
|---|---|---|
| `backend/routes/upload.js:126/128/132/142` | `file:upload` / `file` | 除老板外不能上传/查看/删除附件 |
| `backend/routes/quote.js:329/343` | `quotation:view` / `quotation:approve` | 销售打不开报价详情；经理不能审批报价 |
| `backend/routes/contract/payment.js:66/68/70` | `payment:edit` | 财务/经理不能登记、修改、删除回款，只有老板可以 |
| `backend/routes/invoice.js:74` | `invoice:view` | 发票详情只有老板能看 |
| `backend/routes/purchase/request.js:41`、`purchase/comparison.js:47` | `purchase:request` / `purchase:comparison` | 采购申请/比价页面与接口对采购角色不可用 |
| `backend/routes/email.js:147/162` | `email:send` | 只有老板能发/回邮件 |
| `backend/routes/recycle.js:39/75/103`、`cronJobs.js:42` | `recycle_bin:view` / `data:restore` / `system:cron` | 回收站、恢复、定时任务只有老板可用 |

**P0：用户管理提权链。**

- `backend/routes/user.js:62/72/82/106`：新增、修改、删除、重置密码只要求 `system:user:add/edit/delete`，**没有 `requireAdmin`，也没有层级校验**。
- `backend/services/userRouteService.js:63-80`：`role_id` 来自请求体，HR 可以直接创建 `boss` 用户。
- `backend/services/userRouteService.js:118-147`：`updateUser` 同样允许任意 `role_id`，可把自己改成 boss。
- `backend/services/userRouteService.js:93-112`：`resetPassword` 可重置任意用户（含 boss）密码，重置后 `must_change_password=1`，攻击者用新密码登录后改密即完成接管。
- 本机库 `hr` 角色确实持有 `system:user`、`system:user:add/edit/delete`（20 条权限中的 4 条），因此该链**当前可被 HR 使用**。
- 迁移 120 会把 boss 全部权限复制给 manager（`120_manager_full_permissions.sql:17-21`），其中包含 `system:user:*`、`system:role:*`、`system:backup`、`settings`。一旦执行，**经理也能走同一条提权链**。该迁移与 `permission-definitions.js` 中 manager 的策划矩阵并不一致，不能原样执行。

**P0：客户释放越权。**

- 旧路径 `POST /api/v1/customers/release`（`backend/routes/customer/assign.js:134`）要求 `customer:release`，销售持有该码。
- `backend/services/poolService.js:301-302`：
  ```js
  const isPrivileged = user.roleId === ROLES.ADMIN || user.roleId === ROLES.MANAGER || user.roleId === ROLES.SALES
  if (!isPrivileged && customer.owner_id !== userId) throw ...
  ```
  把 `SALES` 当成“特权角色”，任何销售都能释放**别人**的客户。
- 新路径 `POST /api/v1/pool/release`（`backend/routes/pool.js:68-72`）走 `customerService.releaseCustomerToPool`（`backend/services/customerService.js:1055-1082`），按 id 直接更新，**完全没有归属/数据范围校验**。
- 本机库销售持有 `customer:release`；两条路径都可达。

**P0：令牌生命周期。**

- `backend/middleware/auth.js:108-111` 查询用户时带 `AND deleted_at IS NULL`；软删除用户查不到行，`freshUser` 变成 `{}`。
- `backend/middleware/auth.js:131` 只在 `freshUser.status !== undefined` 时拒绝；软删除用户 `status` 为 `undefined`，**旧 JWT 继续有效**。
- `backend/middleware/auth.js:104-107` 用 JWT 里的 `user.roleId` 查角色；角色被降级/调岗后，旧 token 仍按旧角色查权限，直到过期（7 天）。
- `backend/middleware/auth.js:142-149` 又把 `req.user.roleId = user.roleId` 写回旧值。
- `backend/services/authService.js:318-343`（改密）、`:353+`（强制改密）、`backend/services/userRouteService.js:93-112`（重置密码）、`:204-207`（删除用户）都没有写 `sys_token_blacklist`；只有 `logout` 会写。
- `backend/routes/auth.js:351-403` 的 `/refresh` 使用 `ignoreExpiration: true`，**已过期 token 可无限续期**，只检查黑名单和用户状态。

**P1：数据权限覆盖不全。**

- `backend/routes/invoice.js:84/96/106` 的新增/编辑/删除没有 `checkDataPermission`；销售持有 `invoice:add/edit/delete`，可按 id 修改/删除任意发票；Service 只检查发票存在（`invoiceService.js:237-246 / 262-269`）。
- `backend/routes/contract/crud.js:168` 合同新增只有 `checkPermission('contract:add')`；`contractService.js:196-229` 只校验客户已签约、商机属于客户，**不校验客户归属/数据范围**；销售可为任意已签约客户建合同并填任意金额。
- `backend/routes/purchase.js:351/363/384` 的 `update-status`、`receipt/add`、`payment/add` 只要求 `purchase:add`，没有 `checkDataPermission`；采购角色可改任意部门采购单。
- `backend/services/purchaseService.js:509-534` 收货时用请求里的 `item_id` 直接更新 `crm_purchase_item.received_qty`，**不校验 item 是否属于 `order_id`**。
- `backend/services/customerDetailService.js:52-67` 经理权限写死 `dept_id IN (1,5,6,7)`，绕过 `sys_data_permission` 的 `dept_and_sub` 配置；本机库所有经理都在 dept 1。
- `backend/services/contactRouteService.js:24-37` 联系人列表只按 `customer_id` 查询，无归属校验；销售可读任意客户联系人（姓名、电话、邮箱、微信、决策角色）。
- `backend/services/emailService.js:218-237` 邮件详情只按 `e.id` 查询；任意有 `email` 权限的用户可读任意邮件正文/收件人/附件。
- `backend/services/customReportService.js:103-128` 执行报表只按报表 id 读取配置，不校验 `create_by` / `is_public`；销售可运行他人私有报表。
- `backend/services/calendarRouteService.js:7-40` 日程列表无 `create_by`/参与者过滤；`:106` 完成日程只按 id 更新。销售持有 `calendar`。
- `backend/services/followUpService.js:20-55` 新增跟进只校验客户存在；销售持有 `customer:edit`，可给任意客户写跟进。`completePlan` 也缺 `create_by` 校验。
- `backend/services/uploadRouteService.js:94-127` 删除附件不比较 `create_by`；`:79-88` 附件列表只按 `business_type/business_id` 查询。当前因 `file` 码缺失只有老板能用，属于**潜在 IDOR**，一旦补授权即暴露。
- `backend/routes/product.js:216/234/245` 价格新增/修改/删除只要求 `checkPermission('product')`；销售持有 `product`，可改产品价格。
- `backend/services/productService.js` 列表 SELECT 了 `cost_price`，前端仅用 `v-if="isAdmin"` 隐藏；**响应体仍包含成本价**。

### 3.4 客户管理问题

- **P0**：客户 360 详情 500（见 3.2）。
- **P0**：销售可释放他人客户（见 3.3）。
- **P1**：新旧公海路径状态不同步：
  - `poolService.js:153-157` 旧认领会写 `status=? , business_status=?`；
  - `customerService.js:1168-1171` 新认领只写 `pool_status / owner_id / protect_until / last_follow_time`，不写 `status` / `business_status`；
  - `customerService.js:1074-1076` 新释放也不写 `status` / `business_status`；
  - `poolService.js:306-308` 旧释放会写 `status='sea'`。
  - 结果：同一客户经不同路径释放/认领后，`status`、`business_status`、`pool_status` 可能互相矛盾。
- **P1**：经理客户编辑/删除权限写死部门列表，和 `sys_data_permission` 脱节。
- **P2**：`pool_status` 与 `owner_id IS NULL` 双标准并存；本机库 424 个客户 `pool_status` 全为 `private`，其中 423 个 `owner_id IS NULL`，报表/旧接口若用 `pool_status` 会得到错误结论。
- **P1 数据健康**：本机库 424 个客户中 423 个为 `lead` 且无负责人，仅 1 个 `signed`；`crm_pool_log` 有 400 条 `auto_release`，全部集中在 `2026-07-08 09:00:01`。这更像演示/测试数据或一次批量脚本结果，需业务确认；若是生产数据，必须查明为何同一秒释放 400 个客户。

### 3.5 跟进系统问题

- **P1**：`backend/services/reminderService.js:152/181` 查询参数重复：
  ```js
  const queryParams = [overdueDays];
  ...
  LIMIT ? OFFSET ?`,
  [...queryParams, overdueDays, parseInt(pageSize), parseInt(offset)]
  ```
  `overdueDays` 被传了两次，`LIMIT` 实际拿到 `overdueDays`，`OFFSET` 拿到 `pageSize`；分页结果错误。
- **P1**：`followUpService.addFollowUp` 先插跟进、再绑附件、再更新客户状态、再解除提醒，**没有事务**；任一步失败会留下半条数据。
- **P2**：`backend/scripts/generate_reminders.js:66-140` 用唯一键 `(customer_id, reminder_date)` 去重；同一客户同一天若已有 `overdue` 提醒，`today` 提醒插入被跳过，而通知逻辑在插入之后的 `try` 内，可能**静默不通知**。
- **P2**：`cronService.js:98-106` 插入 `pre_release` 提醒时忽略重复，缺少“已存在则补发通知”的分支。
- **正向**：跟进创建驱动 `lead/sea → following` 的逻辑集中在 `customerService.systemApplyFollowUpEffect`，边界比早期版本清晰。

### 3.6 报价问题

- **P1**：`quotation:view` 缺失 → `backend/routes/quote.js:329` 详情 403；`frontend/src/views/quotation/edit.vue:507` 调用 `getQuoteDetail` 失败，销售无法正常编辑已有报价。
- **P1**：`quotation:approve` 缺失 → `backend/routes/quote.js:343` 审批 403；经理无法审批报价（老板因 `manage_all` 可绕过）。
- **P1**：`/quote/to-contract` 调用 `runIdempotent`，`crm_idempotency` 表不存在 → 500；报价转合同不可用。
- **P1**：`quoteService.createQuote` 不再自动改客户状态（2026-08-04 已移除，符合 `docs/customer-center-freeze-v1.md` 的领域边界）；这条是**正确**的，不要恢复。
- **P2**：报价金额/税率/折扣的边界校验分散在 Service 与 Joi 中，缺少统一金额精度与上限校验；需在修复时一并复核。

### 3.7 采购/订单问题

- **P0/P1**：采购单状态更新、收货、付款只要求 `purchase:add`，无数据范围；采购角色可操作任意部门采购单。
- **P1**：收货 `item_id` 不校验属于 `order_id`；可把 A 订单的收货数量记到 B 订单的物料上，并据此改 B 订单状态。
- **P1**：采购申请审批/驳回是“先读状态、再无条件下 UPDATE”，无事务、无 `WHERE status='pending'` 守卫；并发双击可重复审批/覆盖结果。
- **P1**：`purchase:request` / `purchase:comparison` 权限码缺失 → 采购申请/比价页面对采购角色不可用。
- **P2**：`purchaseService.addPayment` 只检查订单存在，不校验金额是否超过订单未付金额。
- **正向**：采购申请 `submit` 使用事务 + `FOR UPDATE` + 条件更新，写法正确，可作为其它审批流的模板。

### 3.8 财务/回款问题

- **P0**：`paymentService.recalculatePlanStatusWithConn`（`backend/services/paymentService.js:92-121`）没有 `SELECT ... FOR UPDATE`：
  - 两个并发回款各自 `SUM(pay_amount)` 时看不到对方未提交的插入；
  - 两个事务都更新 `crm_payment_plan.paid_amount`，后写者覆盖前者，`paid_amount` 偏小，计划状态可能错误。
- **P0**：`recordPayment`（`:138-183`）只校验合同存在，不校验 `plan_id` 属于 `contract_id`，也不校验金额 > 0 / 不超过计划金额；可把回款挂到别的合同的计划上。
- **P0**：发票新增/编辑/删除无数据范围，销售可改删任意发票；`createInvoice` 不校验合同/客户关系与归属。
- **P0/P1**：`crm_invoice.invoice_no` 唯一索引未建立（迁移 123 未执行）；`invoiceService.insertInvoiceWithRetry` 的重试逻辑依赖该唯一索引，当前重试无效。
- **P1**：`updatePayment`/`deletePayment` 先改回款、再在事务外调 `recalculatePlanStatus`；中途失败会导致回款与计划不一致。
- **P1**：`payment:edit` 缺失 → 财务/经理的“登记回款”按钮被前端隐藏（`contract/detail.vue:95`、`contract/list.vue:81`），后端也 403。
- **P1**：迁移 123 的 6 条外键未建立，孤儿回款提醒、孤儿发票合同、孤儿跟进商机等无数据库拦截。
- **正向**：金额计算已统一走 `money` 工具，避免浮点累加误差；这是本项目做得较好的部分。

### 3.9 文件系统问题

- **P0/P1**：`file` / `file:upload` 权限码缺失 → 附件上传/列表/删除对非老板不可用。
- **P1**：`backend/app.js:541-544` 在认证中间件之前挂载 `app.use('/uploads', express.static(uploadsDir))`，**上传文件可被未登录用户按 URL 直接读取**。随机文件名只是弱缓解。
- **P1**：`uploadRouteService.deleteAttachment` 不校验 `create_by`；补上 `file` 权限后，任意有权限用户可删他人附件。
- **P1**：`uploadRouteService.listAttachments` 只按业务类型/业务 id 查询，不校验调用者是否有该业务对象的数据权限。
- **P2**：前端/灰度 nginx 未设置 `client_max_body_size`，默认 1MB，而后端允许 10MB/20MB；大文件在 nginx 层 413（子代理静态审计，未在运行环境复现）。
- **P2**：知识库上传缺少 magic bytes 校验（扩展名白名单 + 随机文件名 + `nosniff` 已降低风险）。

### 3.10 API / 前后端契约问题

- 后端 12 个权限码缺失，前端有 5 个权限码直接引用不存在：`payment:edit`、`purchase:comparison`、`purchase:request`、`quotation:approve`、`recycle_bin:view`。
- 前端路由守卫对 `manageAll` 放行，老板测试时看不到问题；经理/财务/采购登录后大量页面 403 或按钮消失。
- `frontend/src/api/customer.js:61` 仍调用旧 `/customers/release`；`frontend/src/api/pool.js:41` 调用新 `/pool/release`；两条路径的鉴权和状态写入不一致。
- 幂等键前端只在公海（`pool.js:32/50/55/64`）、采购申请（`purchaseRequest.js:14`）、报价转合同（`quotation.js:52`）发送；**合同、回款、发票前端没有发送 Idempotency-Key**，双击/网络重试仍可能重复落库。
- `frontend/src/api/customer.js:18` 的 `getCustomerDetail` 只在报价编辑页用于客户信息预填，也受客户详情 500 影响。
- 前端 `v-permission:disabled` 已废弃且零使用，不要再使用（与 `.claude/CLAUDE.md` 一致）。

### 3.11 前端问题

- 客户详情页 `Detail.vue` 依赖 `/customers/:id/360`，该接口当前 500；页面主数据无法加载。
- `Detail.vue:297` “重新计算评分”按钮依赖 `/scoring/calculate/:id`，该接口因缺失列 500。
- 报价编辑页 `quotation/edit.vue:507` 调用报价详情，销售 403。
- 合同详情/列表的“登记回款”按钮用 `v-permission="'payment:edit'"`，当前角色无此码，按钮永久隐藏。
- 采购申请/比价路由 meta 使用缺失码，采购角色被路由守卫拦下。
- 回收站入口在 `HeaderBar.vue:49` 使用缺失码，非老板看不到。
- 产品列表成本价仅前端隐藏，未做后端字段级脱敏。
- 正面：`useUser` 单例、权限指令、axios 统一错误处理、401 刷新队列设计完整；本次问题主要不在前端实现，而在后端契约与权限数据。

### 3.12 安全问题（汇总）

| 编号 | 问题 | 等级 |
|---|---|---|
| S1 | HR / 经理可通过用户管理接口创建 boss 或重置 boss 密码 | P0 |
| S2 | 销售可释放他人客户 | P0 |
| S3 | 软删除用户旧 JWT 继续有效；改密/重置/删除/降权不吊销 token；过期 token 可无限 refresh | P0 |
| S4 | 销售可改删任意发票；可替任意已签约客户建合同 | P0 |
| S5 | 12 个权限码缺失导致功能锁死（可用性问题，也暴露权限源漂移） | P0 |
| S6 | `/uploads` 未认证静态服务 | P1 |
| S7 | 附件删除/列表无归属校验（补授权后暴露） | P1 |
| S8 | 联系人、邮件、私有报表、日程、跟进、产品价格等 IDOR | P1 |
| S9 | 产品 `cost_price` 进入响应体 | P1 |
| S10 | 慢查询日志/操作日志 URL 未脱敏 | P1 |
| S11 | 镜像可能烘焙 `.env.local` / `.env.production.local` / `.dev-token.txt` | P0 |
| S12 | 生产告警默认关闭，无有效通知通道 | P2 |
| S13 | `demo_admin` 仍是 active 的 `super_admin` | P1 |
| S14 | 备份含明文 `.env` 与 TLS 私钥，加密口令与备份同机 | P1 |

### 3.13 性能问题

- **P1**：`reminderService` 分页参数错位，查询结果集大小不受控。
- **P2**：`automationService.applyAssignRule` 对每个客户循环查询规则/更新，最多 500 客户，存在 N+1。
- **P2**：`assignService.applyRule` 先 `SELECT` 公海客户，再开事务；事务内更新没有 `owner_id IS NULL` 守卫，并发自动分配可能重复分配。
- **P2**：`contractService` 合同号用 `SELECT COUNT(*) ... FOR UPDATE` 生成；虽有唯一索引兜底，但并发下会直接 1062 而不是重试。
- **P2**：`customerDetailService.getCustomer360` 并行发多条查询，客户量大时连接池压力集中；需要压测确认。
- **P2**：Redis 故障时限流 store 抛错，所有经过 `apiLimiter` 的请求 500；ioredis 3 次失败后永久放弃重连（`backend/config/redis.js:16-20`），恢复需重启进程。
- **P2**：`metrics/client` 是公开写接口，无专用限流；`backend/routes/metrics.js:31-40` 的 async handler 没有 `try/catch`，DB 写失败时 Express 4 不会捕获 rejected promise，请求会挂起（Jest 30 秒超时已复现）。

### 3.14 测试问题

实测结果：

```
后端：Test Suites: 2 failed, 163 passed, 165 total
      Tests:       3 failed, 1600 passed, 1603 total
      Coverage:    statements 57.69% / branches 40.69% / functions 57.12% / lines 60.9%
前端：Test Files 18 passed (18)
      Tests 138 passed (138)
      Errors 7 (vitest forks worker 启动超时)
ESLint：0 warning / 0 error
```

失败用例：

- `tests/csrf.test.js:111` 期望 `SameSite=Strict`，实际 `SameSite=Lax`（代码已按 `.local` 域名改为 Lax，测试未同步）。
- `tests/metrics.test.js:56` 期望未登录 401，实际 204（`metrics/client` 已改为公开接口，测试未同步）。
- `tests/metrics.test.js:102` 期望 DB 失败返回 500，实际 30 秒超时（async handler 未捕获异常，测试暴露了真实缺陷）。

判断：**测试套件“变红”不全是代码回归，部分是测试期望过期；但 metrics 的挂起是真实缺陷。** 覆盖率阈值虽过，但 branches 仅 40.69%，权限、事务、并发路径覆盖不足。

### 3.15 Docker / NAS 问题

以下为子代理静态审计 + 本报告抽查确认，**未在 NAS 上运行验证**：

- **P0 密钥入镜像**：`.dockerignore` 只排除 `.env`，不排除 `backend/.env.local`、`backend/.env.production.local`、`backend/.dev-token.txt`；`Dockerfile.synology:39` 使用 `COPY backend/ .`。这些文件实际存在且非空。镜像被推送/导出/缓存泄露即可读取凭证。**须立即把这些文件移出构建上下文并轮换可能已泄露的密钥。**
- **P0 Synology Redis 健康检查**：`docker-compose.synology.yml` 的 Redis 启动带 `--requirepass ${REDIS_PASSWORD:-}`，健康检查却是 `redis-cli ping`，无 `-a`。密码非空时 PING 返回 `NOAUTH`，健康检查失败，依赖 `service_healthy` 的 app 无法启动。**按配置推断，未在 NAS 复现。**
  - **2026-10-23 修复期实测更正（本地 Docker，redis:7-alpine）**：上述“app 无法启动”的结论**不成立**。设置 `--requirepass testpass` 后，容器内 `redis-cli ping` 输出 `NOAUTH Authentication required.`，但**退出码仍为 0**；使用原健康检查的容器状态实测为 `healthy`。即原检查语义错误（未验证 Redis 可用性），但不会阻断 `service_healthy`。已改为校验 `PONG`（有/无密码两种场景均实测 `healthy`），严重度由“阻断启动”降为“健康检查失真”。
- **P0 生产 compose CORS**：`deploy/docker-compose.prod.yml` 设置 `NODE_ENV=production`，但没有 `CORS_ORIGIN`，也没有 `env_file`；`backend/app.js:109-120` 对空 CORS 直接 `process.exit(1)`。prod 栈会启动崩溃。Synology compose 是否传了 CORS 需以实际 `.env`/secrets 为准。
- **P1 生产 compose MySQL 变量**：prod/test 使用 `${MYSQL_PASSWORD}`，仓库 `.env*` 中只有 `DB_PASSWORD`；若未外部注入，MySQL 初始化/应用连接失败。
- **P1 测试 compose**：`deploy/docker-compose.test.yml:80` 强制 `JWT_SECRET_TEST`，实际 secrets 未配置，`docker compose config` 解析失败。
- **P1 canary 双 cron**：`deploy/docker-compose.canary.yml` 同时跑 backend 与 backend-canary，两个进程都启动全部 node-cron，且无分布式 leader lock；定时任务会重复执行。
- **P1 canary 无 uploads 卷**：两个 backend 都未挂载 uploads，上传文件写容器临时层，重启丢失，灰度实例互相看不到。
- **P1 端口暴露**：base/prod/test/canary 多个栈把 app/nginx/frontend 直接发布到宿主机（5000/6789/6790/80/8080），prod compose 甚至没有 nginx/TLS；可能绕过 TLS、安全头、限流。Synology 栈只发布 nginx 8443，相对最好。
- **P2 Nginx**：base/canary 未设 `client_max_body_size`（默认 1MB，后端允许 10/20MB）；`server_tokens` 未关；legacy nginx 无 TLS/CSP；AI/导出/大导入 60s 代理超时可能 504。
- **P2 日志**：`LOG_LEVEL=info` 低于 winston `http`，访问日志被过滤；app-logs named volume 属主未在镜像中预创建（疑似）。
- **P2 告警**：`.env.secrets` 中 `ALERT_ENABLED=false`，企业微信 webhook 为空，无 SMTP；500/Redis/cron/备份失败不会通知。
- **P2 镜像 tag**：`mysql:8.0`、`redis:7-alpine`、`nginx:alpine`、`node:22-alpine` 均未 pin digest，构建不可复现。
- **正向**：Synology 栈 MySQL/Redis/app 均未发布宿主端口；app 以 `nodejs` 非 root 运行；nginx 有 TLS 1.2/1.3、HSTS、CSP、X-Frame-Options DENY、nosniff、Referrer-Policy、Permissions-Policy、50m body limit 和 auth 路径限流。

### 3.16 数据备份问题

- **P1 明文备份**：`config-backup.sh` 无条件把 `/stack/.env` 与 `nginx/certs` 复制进 staging；只有配置了 `ENC_PASS` 才加密。未配置时 DB/JWT/TLS 私钥明文落盘。
- **P1 密钥同机**：`.backup-enc-pass` 与备份目录同机；仓库未发现 rsync/rclone/云上传等异地备份逻辑。NAS 整机失窃/勒索时备份与密钥一起丢失。
- **P1 恢复演练未执行**：`restore-test.sh` 存在，但本次审计未运行；**不能声称“备份可恢复”**。
- **P2 备份脚本假成功**：
  - `config-backup.sh` 加密后把 `BACKUP_PATH` 指向 `.gpg/.enc`，仍用 `tar -tzf` 校验，`set -e` 会让脚本在“加密成功”后报失败。
  - `container-backup.sh --once` 不检查三个子备份返回值，直接 `exit 0`。
  - `restore-test.sh` 对 uploads/config 校验失败只 `WARN`，最终仍可能 `PASS`。
- **P2 保留期冲突**：宿主机 7 天清理与容器 30 天保留同名文件，若同目录会提前删除。
- **P2 进程列表泄露密码**：`mysqldump -p"$PASSWORD"` 使同机有进程查看权限者可见 DB root 口令。
- **正向**：`database/backup.sh` 有 `set -euo pipefail`、gzip 完整性、最小大小、`CREATE TABLE` 校验、chmod 600、30 天保留；容器 uploads 备份有 tar 完整性校验；config 加密有解密回验。

---

## 4. P0 / P1 / P2 / P3 问题清单

> 置信度说明：  
> **已确认** = 本报告直接读代码/查库确认；**高** = 静态配置可确认但未运行复现；**待复核** = 子代理报告，未逐行复核。

### 4.1 P0（未清不得上线；V1 11 项 + V1.1 新增 2 项 = 13 项）

| ID | 问题 | 关键证据 | 影响 | 修复方向 | 置信度 |
|---|---|---|---|---|---|
| P0-01 | 迁移 120–124 未执行，核心接口 500 | `schema_migrations` 最大 119；`crm_idempotency`、`crm_customer_score_log.deleted_at` 缺失；`customerDetailService.js:482-488`、`scoringRouteService.js:166/268-276`、`utils/idempotency.js:39-53` | 客户详情/评分/公海认领/报价转合同/采购提交不可用；约束缺失 | 先备份；逐条审阅后执行 122–124；120 必须重写；补迁移守护测试 | 已确认（本机库） |
| P0-02 | 12 个权限码不在数据库 | 实测缺失清单；`backend/scripts/permission-definitions.js` 有定义；路由引用见 3.3 | 经理/财务/销售/采购大量 403；功能“只有老板能用” | 用 `init_role_permissions.js` 安全模式同步，或新增幂等迁移；补“路由码必须存在且已授权”测试 | 已确认 |
| P0-03 | 用户管理提权链 | `routes/user.js:62/72/82/106` 无 `requireAdmin`；`userRouteService.js:63-80/93-112/118-147` 接受任意 `role_id`；本机 `hr` 持有 4 个用户管理码 | HR 可创建 boss / 重置 boss 密码 / 自提权；迁移 120 会把链扩到经理 | 用户写接口加 `requireAdmin` 或严格层级策略；禁止非 admin 分配 boss/super_admin；重置密码限层级；全量审计历史操作 | 已确认（利用链静态） |
| P0-04 | 迁移 120 过度授权 | `120_manager_full_permissions.sql:17-21` 复制 boss 全部权限；boss 本机 103 条 | 经理获得 `system:user:*`、`system:role:*`、`system:backup`、`settings`，可走 P0-03 | 不执行原 120；改为按 `permission-definitions.js` 的经理矩阵逐条授权；补权限矩阵测试 | 已确认 |
| P0-05 | 销售可释放他人客户 | `poolService.js:301-302` 把 SALES 当特权；`customerService.js:1055-1082` 无归属校验；`assign.js:134`、`pool.js:68-72` | 任意销售释放任意客户，破坏归属与业绩 | 删除 SALES 特权；新路径补 `checkDataPermission` + owner 校验；释放写审计 | 已确认 |
| P0-06 | 令牌生命周期缺陷 | `auth.js:108-111/131/142-149`；`authService.js:318-343/353+`；`userRouteService.js:93-112/204-207`；`auth.js:351-403` | 软删除/降权/改密用户旧 token 继续有效；过期 token 可无限续期 | 用户行不存在即拒绝；角色按 DB 最新 `role_id` 查；加 `token_version` 或 `password_changed_at` 校验；改密/重置/删除/降权写黑名单 | 已确认 |
| P0-07 | 幂等键设计竞态 | `utils/idempotency.js:39-53` 先执行 `fn()` 再 INSERT；查询只按 key；前端合同/回款/发票未发 key | 并发同 key 双方都产生副作用；重复回款/合同/发票 | 先 INSERT 占位（pending）再执行，唯一键冲突即读回；key 加 `biz_type+user` 命名空间；前端补 key；失败清理/过期 | 已确认 |
| P0-08 | 回款计划并发丢更新 | `paymentService.js:92-121` 无 `FOR UPDATE`；`:138-183` 不校验 plan 属于 contract；`:190-208` 事务外重算 | `paid_amount` 偏小、计划状态错误、回款挂错合同 | 事务内 `SELECT ... FOR UPDATE` 锁计划；校验 plan/contract；update/delete 包事务 | 已确认 |
| P0-09 | 发票授权与完整性 | `invoice.js:84/96/106` 无 data scope；销售持有 add/edit/delete；`invoiceService.js:237-246/262-269` 只查存在；唯一索引缺失 | 销售可改删任意发票；重号发票 | 加 `checkDataPermission` + 归属校验；校验合同/客户关系；执行 123 唯一索引 | 已确认 |
| P0-10 | 镜像烘焙本地密钥 | `.dockerignore` 只排除 `.env`；`Dockerfile.synology:39` `COPY backend/ .`；`backend/.env.local`、`.env.production.local`、`.dev-token.txt` 存在且非空 | 镜像/缓存泄露即凭证泄露 | `.dockerignore` 排除 `**/.env*`、`**/.dev-token.txt`；移出构建上下文；轮换密钥；重建镜像 | 已确认（文件会入镜像）；凭证有效性未验证 |
| P0-11 | Synology Redis 健康检查缺密码 | `docker-compose.synology.yml` Redis `--requirepass`，healthcheck `redis-cli ping`；app 依赖 healthy | **实测更正**：`redis-cli` 在 NOAUTH 时退出码仍为 0，原健康检查不会阻断启动；缺陷是“检查未验证可用性” | healthcheck 校验 `PONG`（有密码走 `REDISCLI_AUTH`）；本地复现 | 已实测：原检查 healthy（误判为阻断）；新检查有/无密码均 healthy |

### 4.2 P1（上线前必须修；V1 20 项 + V1.1 新增 8 项 = 28 项）

| ID | 问题 | 关键证据 | 影响 |
|---|---|---|---|
| P1-01 | 采购写接口无数据范围；收货 item/order 不匹配 | `purchase.js:351/363/384`；`purchaseService.js:509-534` | 跨部门改采购单/收款/库存 |
| P1-02 | 经理数据范围写死部门 | `customerDetailService.js:52-67` | 绕过 `dept_and_sub`，越权编辑/删除 |
| P1-03 | 公海认领/释放状态不同步 | `customerService.js:1168-1171/1074-1076`；`poolService.js:153-157/306-308` | `status/business_status/pool_status` 互相矛盾 |
| P1-04 | 提醒分页参数错位 | `reminderService.js:152/181` | LIMIT/OFFSET 错误，分页不可用 |
| P1-05 | 合同删除非事务 | `contractCrudService.js:254-256` | 合同删了、回款/计划未删或反之 |
| P1-06 | 采购审批竞态 | `purchaseRequestService.js:195-226/232-264` | 重复审批/覆盖结果 |
| P1-07 | 自动分配竞态/覆盖已有归属 | `assignService.js:95-145`；`automationService.js:273-302`；`customerService.js:1208-1213` | 两人同时分配、已归属客户被改 |
| P1-08 | IDOR 集群 | 联系人 `contactRouteService.js:24-37`；邮件 `emailService.js:218-237`；报表 `customReportService.js:103-128`；日程 `calendarRouteService.js:7-40`；跟进 `followUpService.js:20-55`；附件 `uploadRouteService.js:79-127`；产品价格 `routes/product.js:216/234/245` | 跨用户读/写敏感数据 |
| P1-09 | 成本价进入响应体 | `productService.listProducts` SELECT `cost_price`；前端仅 `v-if` 隐藏 | 敏感字段泄露 |
| P1-10 | Redis 故障放大为全站 500 | `redis.js:16-20`；`rateLimiter.js:17-25`；express-rate-limit 8.5.2 `passOnStoreError=false` | Redis 抖动导致登录/API 不可用，恢复需重启 |
| P1-11 | `/uploads` 公开静态 | `app.js:541-544` | 未登录按 URL 读附件 |
| P1-12 | 备份明文 + 密钥同机 + 无异地 + 演练未跑 | `deploy/backup/*`（子代理静态审计） | 备份/密钥同时泄露；不能证明可恢复 |
| P1-13 | 备份脚本假成功 | `config-backup.sh` 加密后 `tar -tzf`；`container-backup.sh --once` 不检查返回值 | 运维误判备份成功 |
| P1-14 | canary 双 cron + 无 uploads 卷 | `docker-compose.canary.yml` | 定时任务重复；上传文件丢失 |
| P1-15 | 部署配置漂移 | prod 无 `CORS_ORIGIN`；`MYSQL_PASSWORD` 未定义；test 缺 `JWT_SECRET_TEST`；base/canary 1MB body limit | 栈启动失败/大文件 413 |
| P1-16 | 过期 token 可无限 refresh | `routes/auth.js:351-403` `ignoreExpiration: true` | 被盗 token 永久续期 |
| P1-17 | 数据异常 + demo 超管 | 423/424 无主 lead；400 条同一秒 `auto_release`；`demo_admin`（id 70）active `super_admin` | 演示/脏数据误导报表；默认高权限账户 |
| P1-18 | 测试红/覆盖不足 | 后端 3 failed；前端 7 worker errors；branches 40.69% | CI 不能作为上线门禁 |
| P1-19 | 生产迁移执行器非严格 | `Dockerfile.synology:62` 用 `migrate.js`；`database/migrate.js` 失败后继续 | 部分迁移、半套结构 |
| P1-20 | 日志未脱敏 | `slowQuery.js:58/71`；`middleware/logger.js:114/246/268` | 密码/手机号/邮箱进持久化日志 |

### 4.3 P2（上线后尽快修；V1 18 项 + V1.1 约 20 项候选待复核）

| ID | 问题 | 关键证据 |
|---|---|---|
| P2-01 | `metrics/client` async 无 try/catch，DB 失败挂起 | `routes/metrics.js:31-40`；Jest 30s 超时 |
| P2-02 | 提醒去重导致通知静默跳过 | `backend/scripts/generate_reminders.js:66-140` |
| P2-03 | `automationService` N+1 | `automationService.js:273-302` |
| P2-04 | 合同号 COUNT+1，并发直接 1062 | `contractService.js:221-225`；`contract_no` 有唯一索引 |
| P2-05 | 回款金额无上下限校验 | `paymentService.js:138-183` |
| P2-06 | 发票重试依赖未执行的唯一索引 | `invoiceService.js:193-219`；迁移 123 未执行 |
| P2-07 | `pool_status` 与 `owner_id` 双标准 | 424 条 `pool_status=private`，423 条 `owner_id IS NULL` |
| P2-08 | 前端无 `.dockerignore`，`COPY . .` 带入 node_modules | `frontend/Dockerfile:6`（子代理） |
| P2-09 | `LOG_LEVEL=info` 过滤 HTTP 访问日志 | `config/logger.js:57`；`middleware/logger.js:210` |
| P2-10 | app-logs 卷属主风险 | `docker-compose.synology.yml:129`；`Dockerfile.synology:48` |
| P2-11 | 告警默认关闭 | `.env.secrets` `ALERT_ENABLED=false`（子代理） |
| P2-12 | 镜像 tag 未 pin digest | compose/Dockerfile（子代理） |
| P2-13 | base/canary nginx 无 body limit / server_tokens | `frontend/nginx.conf`、`deploy/nginx-canary.conf`（子代理） |
| P2-14 | test compose 复用生产 DB 口令 | `deploy/docker-compose.test.yml`（子代理） |
| P2-15 | 备份保留期冲突（7 天 vs 30 天） | `deploy/backup/mysql-backup.sh:135-137`（子代理） |
| P2-16 | 进程列表可见 DB 密码 | `database/backup.sh:38` 等（子代理） |
| P2-17 | `metrics` 公开写接口无专用限流 | `routes/metrics.js:27-40` |
| P2-18 | 合同/发票/回款前端未发幂等键 | `frontend/src/api/*` 对照 |

### 4.4 P3（排期优化）

- 文档/README 与实际部署不一致（80/443/5000、`.env.example`、内存限制等）。
- 测试期望过期：CSRF `SameSite=Strict`、metrics 未登录 401。
- `server_tokens` 未关、`X-Forwarded-For` 直连可伪造（8443 绑定所有接口，防火墙未验证）。
- 回收站/定时任务等低频功能只有老板可见。
- `v-permission:disabled` 已废弃；保持零使用。
- `.agents/` 未跟踪、登录页有未提交改动；提交前需区分审计产物与业务改动。
- 注释中的历史“David 拍板”等决策记录应迁移到 ADR，避免代码注释承担制度文档职责。

---

## 5. 权限矩阵实测（基于本机库角色授权 + 路由守卫）

> 说明：`super_admin` 与 `manageAll` 直接绕过；`boss` 本机 `manage_all=1`，因此所有功能码检查对它放行。下表“实际”是**当前本机库**行为，不是设计意图。

| 功能 | super_admin | boss | manager | sales | hr | finance | purchase | engineer |
|---|---|---|---|---|---|---|---|---|
| 查看全部客户 | ✅ 绕过 | ✅ `view_all` | ⚠️ 仅 `dept_and_sub`（但编辑/删除另有写死部门） | ❌ `self` | ❌ 无客户模块 | ❌ 无客户模块 | ⚠️ `customer:view`，无数据范围配置 | ⚠️ `customer:view`，无数据范围配置 |
| 查看自己客户 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ | ⚠️ |
| 修改客户 | ✅ | ✅ | ✅ 本部门（写死 1/5/6/7） | ✅ 仅自己 | ❌ | ❌ | ❌ | ❌ |
| 删除客户 | ✅ | ✅ | ✅ 本部门（写死） | ✅ 仅自己 | ❌ | ❌ | ❌ | ❌ |
| 分配客户 | ✅ | ✅ | ✅ `requireManager` | ❌ | ❌ | ❌ | ❌ | ❌ |
| 转移客户 | ✅ | ✅ | ✅ | ✅ 发起 | ❌ | ❌ | ❌ | ❌ |
| 释放到公海 | ✅ | ✅ | ✅ | ⚠️ **可释放任何人**（P0-05） | ❌ | ❌ | ❌ | ❌ |
| 查看跟进 | ✅ | ✅ 全部 | ✅ 部门 | ✅ 自己 | ❌ | ❌ | ❌ | ❌ |
| 查看全部跟进 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 查看财务 | ✅ | ✅ | ⚠️ 合同/回款部门范围 | ❌ | ❌ | ✅ `all` | ❌ | ❌ |
| 登记回款 | ✅ | ✅ | ❌ `payment:edit` 缺失 | ❌ | ❌ | ❌ `payment:edit` 缺失 | ❌ | ❌ |
| 管理用户 | ✅ | ✅ | ❌ 当前；迁移 120 后 ✅（危险） | ❌ | ✅ **可提权**（P0-03） | ❌ | ❌ | ❌ |
| 上传/查看附件 | ✅ | ✅ | ❌ `file*` 缺失 | ❌ | ❌ | ❌ | ❌ | ❌ |
| 报价详情 | ✅ | ✅ | ❌ `quotation:view` 缺失 | ❌ | ❌ | ❌ | ❌ | ❌ |
| 报价审批 | ✅ | ✅ | ❌ `quotation:approve` 缺失 | ❌ | ❌ | ❌ | ❌ | ❌ |
| 发票详情 | ✅ | ✅ | ❌ `invoice:view` 缺失 | ❌ | ❌ | ❌ `invoice:view` 缺失 | ❌ | ❌ |
| 发票增改删 | ✅ | ✅ | ✅ | ⚠️ **可改删任意发票**（P0-09） | ❌ | ✅ | ❌ | ❌ |
| 采购申请/比价 | ✅ | ✅ | ❌ 当前缺失；120 后 ✅ | ❌ | ❌ | ❌ | ❌ `purchase:request/comparison` 缺失 | ❌ |
| 采购单写操作 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ **无数据范围**（P1-01） | ❌ |
| 回收站/定时任务 | ✅ | ✅ | ❌ 当前；120 后 ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

**矩阵结论：**

1. 老板视角“全绿”是 `manage_all` 造成的假象，不能作为验收依据。
2. 经理/财务/采购/销售的 403 大多不是设计，而是权限码未同步。
3. HR 持有用户管理写权限，是当前最危险的授权设计。
4. 销售同时拥有 `invoice:add/edit/delete` 与 `contract:add`，但缺少发票/合同的写数据范围，构成财务造假面。

---

## 6. 修改优先级

### 6.1 立即（今天/明天，阻断上线）

1. **冻结并备份**：停止在现有库上继续迁移；先做一次可验证的手工备份（mysqldump + 校验 + 恢复到临时库）。
2. **P0-03 用户管理提权**：给 `routes/user.js` 加 `requireAdmin` 或层级守卫；禁止非 admin 分配 boss/super_admin；重置密码加层级校验；轮换 boss/HR 口令；审计 `sys_log` 中用户管理操作。
3. **P0-04 迁移 120 重写**：不要执行原文件；按策划矩阵逐条授权。
4. **P0-10 镜像密钥**：`.dockerignore` 排除所有 `.env*`、`.dev-token.txt`；把这些文件移出构建上下文；轮换可能泄露的 JWT/DB/Supabase 等密钥；重建镜像。
5. **P0-01 迁移评审**：先审 122/123/124，确认预检通过后执行；120 单独重写；121 可执行。执行前备份，执行后验证客户详情/评分/公海认领/报价转合同/采购提交。
6. **P0-02 权限同步**：运行 `backend/scripts/init_role_permissions.js`（默认安全模式，只增不删），或写等价幂等迁移；补“路由权限码必须存在”测试。

### 6.2 第一周（P0 收尾）

7. P0-05 客户释放鉴权：删除 SALES 特权；两条释放路径统一走数据范围 + owner 校验。
8. P0-06 令牌生命周期：用户不存在即 401；角色按 DB 最新值；token version / password_changed_at；改密/重置/删除/降权吊销。
9. P0-07 幂等：先占位后执行；key 命名空间；前端合同/回款/发票补 key。
10. P0-08 回款并发：事务内锁计划；校验 plan/contract；update/delete 包事务。
11. P0-09 发票：补数据范围 + 归属 + 合同/客户关系；执行 123 唯一索引。
12. P0-11 Redis 健康检查：修 compose；本地起栈验证。

### 6.3 第二周（P1）

13. P1-01 采购写权限与 item/order 校验。
14. P1-02 经理数据范围改为 `sys_data_permission`。
15. P1-03 统一公海状态写入（`status/business_status/pool_status/owner_id`）。
16. P1-04 修提醒分页参数。
17. P1-05/06/07 事务与条件更新：合同删除、采购审批、自动分配。
18. P1-08 IDOR 批量收口：联系人、邮件、报表、日程、跟进、附件、产品价格。
19. P1-09 成本价字段级脱敏（后端 `fieldPermissions`，不是前端隐藏）。
20. P1-10 Redis 降级：限流 store try/catch 回退内存；ioredis 无限重连或可控退避。
21. P1-11 `/uploads` 改为鉴权下载接口或签名 URL。
22. P1-12/13 备份：加密 DB/uploads；密钥分离；异地副本；跑一次真实恢复演练并留存 PASS 证据。
23. P1-14 canary：只让一个进程跑 cron；挂 uploads 卷。
24. P1-15 部署配置：CORS/MYSQL_PASSWORD/JWT_SECRET_TEST/body limit 全链路修正。
25. P1-16 refresh：拒绝过期 token，或限制 refresh 窗口并轮换。
26. P1-17 数据清理：确认 423 条 lead/无主数据来源；禁用 `demo_admin` 或改密降权。
27. P1-18 测试：更新过期用例；修 metrics 挂起；把 security 套件设为 required check。
28. P1-19 迁移执行器：生产改用严格 `run_migrations.js`，或给 `migrate.js` 加逐文件失败即停。
29. P1-20 日志脱敏：SQL 参数 + URL 查询串。

### 6.4 第三周及以后（P2/P3）

- 修 metrics、提醒通知、N+1、合同号重试、金额边界、字段脱敏、nginx/日志/告警/镜像 pin、备份保留期、测试覆盖率。
- 建立权限矩阵 CI 测试：每个路由声明的权限码必须存在于 `sys_permission` 且至少授予一个角色；每个写接口必须有数据范围或显式豁免注释。
- 建立“迁移必须可回滚 + 启动前校验”门禁。
- 建立“恢复演练”月度任务，PASS 才算备份可用。

---

## 7. 完整实施路线图

### 阶段 A：止血（0–2 天）

- 备份 + 恢复验证（临时库）。
- 用户管理加硬闸；轮换 boss/HR 口令；禁用 `demo_admin`。
- `.dockerignore` 修密钥入镜像；轮换密钥。
- 暂缓所有迁移执行，先评审 120。

**退出标准**：HR 无法创建/重置高权限账号；镜像不再包含本地 env/token；有一份可恢复的备份证据。

### 阶段 B：数据库与权限对齐（3–5 天）

- 重写 120；执行 121/122/123/124；验证 5 条核心链路。
- 同步 12 个缺失权限码；补权限矩阵测试。
- 修 Redis healthcheck；本地/测试栈起得来。

**退出标准**：`schema_migrations=124`；客户详情/评分/公海认领/报价转合同/采购提交全部 200；经理/财务/采购/销售的预期功能不再 403；权限矩阵测试全绿。

### 阶段 C：授权与资金安全（1–2 周）

- 客户释放、发票、合同、采购、附件的归属/数据范围收口。
- 令牌生命周期 + refresh 收紧。
- 幂等 + 回款并发 + 发票唯一约束。
- 备份加密/异地/恢复演练。

**退出标准**：越权测试（销售释放他人客户、销售改他人发票、HR 提权、软删除用户旧 token、并发回款）全部失败；恢复演练 PASS。

### 阶段 D：质量与可运维（2–3 周）

- IDOR 批量修复；字段脱敏；日志脱敏。
- 测试修复 + 覆盖率提升；CI required checks。
- 部署配置统一；canary cron leader；nginx/日志/告警。
- 性能压测：客户列表、360、报表、导入、导出。

**退出标准**：后端测试全绿；前端 worker 错误清零；CI 阻断；NAS 灰度/回滚演练通过。

### 阶段 E：验收（1 周）

按 `AGENTS.md` 第九、十、十一章执行：

- 权限矩阵逐格实测（不是填表）。
- 流程 1 主干、流程 2 并发抢客户、流程 3 离职、流程 4 越权。
- 备份恢复、代码回滚、数据库回滚各一次。
- 输出《HUAKEYCRM 最终验收报告》。

---

## 8. Phase 0 13 项输出（按 AGENTS.md 第八章）

### 1）当前发现

- 本机库迁移停在 119，代码依赖到 124；客户 360、评分、公海认领、报价转合同、采购提交会 500。
- 12 个路由权限码不在 `sys_permission`；老板 `manage_all` 掩盖问题。
- 用户管理、客户释放、发票、合同、采购、附件、联系人、邮件、报表、日程存在越权路径。
- 回款计划重算、采购审批、自动分配、幂等键存在竞态。
- 后端 3 个测试失败；前端 138 个用例通过但有 7 个 worker 错误；备份恢复未演练。
- 本机数据 424 客户中 423 个无主 lead，400 条同一秒 `auto_release`；`demo_admin` 仍是 active 超管。

### 2）存在的问题

按严重度：迁移漂移、权限码漂移、用户管理提权、客户释放越权、令牌生命周期、幂等竞态、回款并发、发票授权、镜像密钥、Redis 健康检查；其次为采购/合同/附件/联系人等授权缺口与部署/备份问题。

### 3）问题等级

- P0：13 项（V1 11 项 + V1.1 新增 P0-12/P0-13，见 4.1 与 11.1）。
- P1：28 项（V1 20 项 + V1.1 新增 P1-21～P1-28，见 4.2 与 11.2）。
- P2：V1 18 项 + V1.1 约 20 项候选（候选未逐项复核，见 4.3 与 11.3）。
- P3：若干（见 4.4）。

### 4）根因

1. **唯一真源没有落地**：`permission-definitions.js` 是权限唯一真源，但数据库同步脚本未纳入部署流程。
2. **测试/演示用老板账号**：`manage_all` 绕过让权限漂移长期不可见。
3. **写接口缺少统一守卫模板**：功能码有了，数据范围/归属/状态机没有统一强制。
4. **迁移治理不足**：生产用宽松执行器；迁移未纳入发布门禁；本机库与代码脱节。
5. **令牌无版本概念**：JWT 自包含角色，改密/降权/删除没有吊销机制。
6. **幂等与并发设计不完整**：先执行后记录、无行锁、无状态条件更新。
7. **部署配置多套并存**：Synology/prod/test/canary 配置漂移，缺少一套经过验证的基线。

### 5）修改方案

- 先止血：用户管理硬闸、镜像密钥、备份。
- 再对齐：重写 120、执行 121–124、同步权限码、修 Redis healthcheck。
- 再收口：统一写接口守卫模板（功能码 + 数据范围 + 归属 + 状态机 + 事务 + 审计）。
- 再加固：token version、幂等占位、行锁、唯一约束、字段脱敏、日志脱敏。
- 最后验收：权限矩阵、并发、越权、恢复、回滚。

### 6）修改文件

预计涉及（按优先级）：

- `backend/routes/user.js`、`backend/services/userRouteService.js`
- `database/migrations/120_manager_full_permissions.sql`（重写）
- `backend/scripts/init_role_permissions.js` / 新增权限同步迁移
- `backend/routes/customer/assign.js`、`backend/routes/pool.js`、`backend/services/poolService.js`、`backend/services/customerService.js`
- `backend/middleware/auth.js`、`backend/routes/auth.js`、`backend/services/authService.js`
- `backend/utils/idempotency.js`、`backend/services/paymentService.js`、`backend/services/invoiceService.js`
- `backend/routes/invoice.js`、`backend/routes/contract/crud.js`、`backend/services/contractService.js`
- `backend/routes/purchase.js`、`backend/services/purchaseService.js`、`backend/services/purchaseRequestService.js`
- `backend/services/customerDetailService.js`、`backend/services/contactRouteService.js`、`backend/services/emailService.js`、`backend/services/customReportService.js`、`backend/services/calendarRouteService.js`、`backend/services/followUpService.js`、`backend/services/uploadRouteService.js`
- `.dockerignore`、`Dockerfile.synology`、`docker-compose.synology.yml`、`deploy/docker-compose.*.yml`
- `deploy/backup/*`
- 前端 `frontend/src/api/{contract,payment,invoice}.js`、`frontend/src/views/quotation/edit.vue`、采购/合同/回收站相关视图
- 测试：`backend/tests/csrf.test.js`、`backend/tests/metrics.test.js`、新增权限矩阵/越权/并发测试

### 7）数据库修改

- 重写 120；执行 121、122、123、124。
- 同步 12 个缺失权限码并按矩阵授权。
- 建立 `crm_idempotency`、`crm_customer_score_log.deleted_at`、发票号唯一、回款计划唯一、6 条外键。
- 清理/确认 423 条无主 lead 与 400 条 `auto_release` 日志。
- 禁用/降权 `demo_admin`。
- 所有 DDL 前备份，执行后跑迁移校验与回归。

### 8）API 修改

- 用户管理：加 admin/层级守卫；限制 role_id 分配；重置密码限层级；审计。
- 客户释放/认领：统一数据范围、归属、状态写入。
- 发票/合同/采购：写接口加 `checkDataPermission` + 归属校验 + 关系校验。
- 回款：计划锁 + plan/contract 校验 + 金额边界。
- 幂等：先占位后执行；key 命名空间；前端补 key。
- 认证：用户不存在即 401；角色取 DB 最新；改密/重置/删除/降权吊销；refresh 拒绝过期。
- 附件：鉴权下载；删除/列表校验归属。

### 9）前端修改

- 合同/回款/发票 API 补 `Idempotency-Key`。
- 修复报价详情、采购申请/比价、登记回款、回收站等被缺失权限码阻塞的入口。
- 客户详情/评分失败时显示可诊断错误，不要静默空白。
- 产品成本价不再依赖前端 `v-if`，改为后端脱敏后不返回或返回掩码。
- 统一 403/500 的错误提示与重试策略。

### 10）测试结果

- 后端：2 个 suite / 3 个 test 失败，1600 通过；coverage 57.69% statements / 40.69% branches。
- 前端：18 文件 / 138 用例通过；7 个 vitest forks worker 启动超时。
- ESLint：0 warning / 0 error。
- 未执行：前端构建、后端真实启动、E2E、恢复演练。

### 11）回归测试结果

**未执行。** 本阶段是只读审计，没有代码变更，因此没有回归结果。任何修复必须按 AGENTS.md 九步循环补齐回归，不能用“审计通过”代替“修复验证”。

### 12）是否存在风险

存在，且风险较高：

- 直接执行迁移 120 会扩大提权面。
- 直接执行 123 可能因存量脏数据失败；须先跑预检并看 `crm_integrity_violation`。
- 补权限码后，原本“只有老板能用”的附件/邮件/回款等功能会对更多角色开放，必须同步修归属校验，否则 IDOR 从“潜在”变“可利用”。
- 修改令牌校验会导致现有会话失效，需提前通知并安排重新登录。
- 备份未验证可恢复，任何 DDL 前必须先做可恢复备份。
- 生产库状态未知，不能把本机库结论直接套到生产。

### 13）下一阶段计划

1. 用户确认本报告的 P0 清单与修复优先级。
2. 在**备份并验证可恢复**的前提下，先做阶段 A（止血）。
3. 阶段 B 对齐数据库与权限；每步执行后跑权限矩阵与核心链路回归。
4. 阶段 C 收口授权与资金安全。
5. 阶段 D 质量与可运维；阶段 E 按 AGENTS.md 验收。

---

## 9. 未验证 / 待确认清单

| 项 | 状态 | 需要谁确认 |
|---|---|---|
| NAS 生产库 `schema_migrations` 版本 | 未验证 | 运维/DB |
| NAS 上 `.env`、`.env.secrets`、证书 ACL | 未验证 | 运维 |
| Synology Redis NOAUTH 实际行为 | 按配置推断 | 运维（起栈复现） |
| 生产镜像是否已包含本地 env/token | 未验证 | 运维（检查镜像层/构建上下文） |
| `.env.local` / `.env.production.local` 中凭证是否仍有效 | 未验证（未读值） | 安全/运维 |
| 生产是否使用 `deploy/docker-compose.prod.yml` 还是 Synology compose | 未确认 | 运维 |
| 是否存在异地备份 | 仓库未见 | 运维 |
| 备份恢复演练 | 未执行 | 运维/DB |
| 423 条无主 lead、400 条 `auto_release` 是否为演示数据 | 未确认 | 业务 |
| `demo_admin` 是否仍在使用 | 未确认 | 管理员 |
| 主分支保护/required checks | 未验证 | 仓库管理员 |
| 前端构建与 E2E | 未执行 | 开发/QA |
| 真实 HTTP 越权/并发复现 | 未执行 | 开发/QA |

---

## 10. 结论

这个项目**不是“推倒重来”的状态**：分层、软删除、审计日志、金额精度、权限缓存失效、CI 安全扫描、Synology 部署骨架都已有较好基础。真正的问题是**“最后一公里”没有收口**：

- 权限定义有了，但没有同步到库；
- 迁移写了，但没有可靠执行；
- 数据权限中间件有了，但大量写接口没挂；
- 事务/锁的工具有了，但关键资金路径没用；
- 测试有了，但没作为门禁；
- 备份脚本有了，但没验证恢复。

因此建议的路线不是重构，而是**按 P0 → P1 逐项收口，每项都带测试与回归**。在 P0 未清之前，不应上线，也不应把老板账号的“全绿”当作验收结果。

---

## 11. V1.1 增补（前端契约复核）

> 增补日期：2026-10-23  
> 来源：前端契约子代理深挖 `frontend/src` 与后端路由注册；本节标「已确认」的条目均由主审计逐行回读源码复核。  
> 限制：仍未启动后端、未发起真实 HTTP、未执行 E2E 与恢复演练；标「已确认」指代码/配置层面确定，不等同于运行时复现。  
> 对 V1 的影响：新增 P0 2 项、P1 8 项；V1 已确认项、44/100 评分与总体结论不变。这些新增项进一步印证了 V1 的结论——**“最后一公里”契约没有收口**。

### 11.1 新增 P0

#### P0-12 新建/导入客户不写 `business_status`，正式客户落入线索池

| 项 | 内容 |
|---|---|
| 关键证据 | 导入默认值 `backend/services/importService.js:52-53`（`level='C'`、`status='following'`），`:155-164` 把 `status` 传给客户域；但 `backend/services/customerService.js:1315-1323` 的 INSERT 列只有 `(company_name, address, industry, source, level, status, remark, owner_id)`，**没有 `business_status`**。手工新增路径 `backend/services/customerDetailService.js:106-128` 同样不写 `business_status`，却在有自动分配负责人时把 `status` 设为 `following`。表默认值见 `database/migrations/000_real_baseline.sql:471`：`business_status ... DEFAULT 'lead'`。 |
| 数据后果 | 导入记录 `owner_id=导入人`、`status='following'`，但 `business_status='lead'`；正式客户列表要求 `business_status IN (following, quoted, negotiating, signed) AND owner_id IS NOT NULL`（`customerService.js:803`），因此**导入客户不会出现在正式客户列表**，而会出现在线索池（`customerService.js:710-712` 只按 `business_status='lead'` 过滤，不要求无主）。手工新增 + 自动分配规则命中时同样如此。 |
| 根因 | `status`（旧字段）与 `business_status`（新状态机）双写不完整。迁移 `database/migrations/110_sync_customer_business_status.sql` 注释已记录过同类漂移，并做过一次性回填；但**新增写点没有补上**，回填之后继续产生新漂移。 |
| 影响 | 客户分类、正式/线索列表、跟进与回收自动化、报表口径全部受影响；用户会认为“导入成功了但客户不见了”。属于核心业务数据正确性问题。 |
| 修复方向 | 在两个 INSERT 中根据 `status` 显式写入 `business_status`（或统一走一个受控的 `createCustomer` 入口）；上线前用只读 SQL 统计 `status IN ('following','quoted','negotiating','signed') AND business_status='lead'`，确认后一次性回填；补“导入/新增后必须出现在正式列表”的集成测试；长期考虑把 `business_status` 设为唯一真源，`status` 降级为派生/兼容字段。 |
| 置信度 | **已确认**（源码 + 基线默认值 + 迁移 110 注释；未运行 HTTP） |

#### P0-13 备份恢复前端不传 `confirm_code`，恢复操作 100% 失败且错误被吞

| 项 | 内容 |
|---|---|
| 关键证据 | 后端 `backend/routes/backup.js:18-22` 的 `restoreBackupSchema` 要求 `confirm_code` 必填；`:57-69` 的 `/backup/restore` 先过 Joi 校验；`:71-79` 另提供 `GET /backup/confirm-code/:id`；`backend/services/backupRouteService.js:127-131` 会比对确认码。前端 `frontend/src/api/system.js:40` 只发 `{ id }`；`frontend/src/views/system/backup.vue:126-129` 从未调用 `confirm-code` 接口，且 `.catch(() => {})` 同时吞掉“用户取消”和“请求失败”。 |
| 影响 | 任何一次“恢复备份”都会在 Joi 校验层返回 400；前端无任何错误提示。备份恢复这一灾备能力在 UI 上等于不存在，却在页面上呈现为可操作按钮。与 AGENTS.md「备份必须验证可恢复」直接冲突。 |
| 修复方向 | 前端先 `GET /backup/confirm-code/:id` 获取确认码，再随 `{id, confirm_code}` 提交；区分“用户取消”和“请求失败”，失败必须可见；恢复成功后提示并刷新列表；补一条使用测试备份的 E2E；在隔离库执行一次真实恢复演练并记录结果。 |
| 置信度 | **已确认**（前后端契约逐行对照；未实际执行恢复） |

### 11.2 新增 P1

| ID | 问题 | 关键证据 | 影响 | 修复方向 | 置信度 |
|---|---|---|---|---|---|
| P1-21 | 登录失败提示被 `refreshCaptcha()` 立即清空 | `frontend/src/views/login/index.vue:153-154`（`refreshCaptcha` 首行 `apiError.value=''`）；`handleLogin` 失败分支先写 `apiError` 再调用 `refreshCaptcha()`（约 `:216-225`）；`frontend/src/utils/request.js:102-106` 对 `/login` 的 401 不弹 toast | 密码错误/验证码错误时页面无可见错误，用户误以为按钮无响应；未提交的登录页改动仍未修正该顺序 | 先保存错误文案再刷新验证码，或给 `refreshCaptcha` 加 `preserveError` 参数；登录 401 至少保留横幅；补组件测试 | 已确认 |
| P1-22 | 三处 `el-upload` 直传绕过 axios CSRF 拦截器 | `payment/index.vue:155-165,261`；`customer/Detail.vue:421-436,971`；`service/index.vue:187-202,391` 均用 `:action` 直传，虽 `with-credentials` 但无 `:headers`；`backend/middleware/csrf.js:50-67` 要求 POST 带 `X-CSRF-Token`；`frontend/src/utils/request.js:61-64` 只给 axios 请求注入该头 | 回款导入、客户附件上传、服务工单附件上传全部 403；用户只看到上传失败 | 统一用 `:headers="{ 'X-CSRF-Token': getCookie('csrf-token') }"`，或改用 `:http-request` 走 axios 封装；抽公共上传组件；补请求头断言测试 | 已确认（静态） |
| P1-23 | 前端调用 `/platform/*`，后端实际挂载在 `/api-platform/*` | 前端 `frontend/src/api/system.js:75-83` 共 9 个 `/platform/*` 调用；后端 `backend/routes/api-platform.js:275` `registry.register('api-platform', ...)`；`backend/core/ModuleRegistry.js:35` 生成 `/${name}` 前缀；`backend/app.js:367-369` 挂到 apiRouter、`:526` 再挂 `/api/v1`。测试 `backend/tests/apiPlatform.test.js:34` 手工挂载 `/api/v1/platform`，反而掩盖了真实前缀 | API 密钥、Webhook、API 文档页面全部 404；测试通过但生产不可用 | 前端改为 `/api-platform/*`（或后端加显式 `/platform` 别名并写清路由表）；测试改为使用真实 ModuleRegistry 挂载；补一条路由存在性契约测试 | 已确认（静态） |
| P1-24 | 日志导出/客户模板下载未声明 `responseType:'blob'` | `frontend/src/api/system.js:31` `exportLog` 无 blob；`frontend/src/api/customer.js:69` `getCustomerTemplate` 无 blob；`frontend/src/components/CustomerImport.vue:106-108` 直接 `URL.createObjectURL(res)` | 日志导出把 xlsx 当 JSON 解析后包成 Blob，文件损坏但提示成功；模板下载对非 Blob 调用 `createObjectURL` 抛 TypeError | 两个 API 补 `{ responseType: 'blob' }`；抽统一下载函数，先校验 `content-type`，后端返回 JSON 错误时正确提示；补测试 | 已确认 |
| P1-25 | 合同编辑删除回款计划只改前端数组，未下发 `delete_plan_ids` | `frontend/src/views/contract/list.vue:132-136` 仅 `form.plans.splice`；`:338` 提交只带 `plans`；后端 `backend/routes/contract/crud.js:146` 已支持 `delete_plan_ids`；`backend/services/contractCrudService.js:178-205` 只删除显式 id、其余 upsert | 已删除的计划保存后“复活”；若与新增计划同日，迁移 123 生效后会撞唯一键 1062 | 前端记录被删计划 id 并随提交下发；后端校验这些 plan 属于当前合同；补编辑-删除-保存回归测试 | 已确认 |
| P1-26 | 报价编辑的币种/汇率/商机字段被 `stripUnknown` 丢弃 | `frontend/src/views/quotation/edit.vue:547-568` 提交 `currency`、`exchange_rate`、`opportunity_id`；`backend/routes/quote.js:290-298` 的 `updateQuoteSchema` 无这些字段；`backend/services/quoteService.js:285` 只解构 `id/customer_id/items/discount/valid_days/remark/status`；`backend/middleware/validate.js:20` 明确 `stripUnknown:true` | 编辑外币报价后币种/汇率/商机静默丢失，金额仍按人民币口径保存，财务与对客报价可能错算；用户看到“修改成功” | schema 与 service 补齐三个字段并校验币种/汇率合法性；明确金额换算与存储口径；补“编辑后回读一致”测试 | 已确认 |
| P1-27 | 正式客户列表多项筛选被静默丢弃；`lost`/`paused` 标签页永远为空 | 前端 `frontend/src/views/customer/List.vue:292-295` 发送 `status`、`lifecycle_status`（另有逾期/标签参数）；后端 `backend/routes/customers.js:39-52` 的 `formalSchema` 只有 company/contact/phone/source/level/business_status/owner/date/sort；`customerService.js:781-786` 的 `listFormalCustomers` 也只接受这一子集；`FILTER_TAB_OPTIONS` 含 `lost`/`paused`（`frontend/src/constants/customer.js:99-107`），但基础 WHERE 的 `FORMAL_BUSINESS_STATUSES` 不含二者（`backend/constants/poolStatus.js:42-47`、`customerService.js:803`） | “已流失/暂停跟进”标签页永远空；状态、生命周期、逾期、标签筛选看似可选但完全不生效；用户会据此得出错误经营判断 | 明确正式列表的状态集合：若标签页要展示 lost/paused，必须扩展 schema 与查询集合；为每个前端发送字段建立 allowlist 契约测试；禁止依赖 `stripUnknown` 静默吞参数 | 已确认 |
| P1-28 | 前端允许 D 级客户，后端所有客户枚举只接受 A/B/C | `frontend/src/views/customer/List.vue:226-230` 含 `{ label: 'D级 - 非意向客户', value: 'D' }`；后端 `backend/routes/customers.js:46/61/93/103/126` 与 `backend/routes/pool.js:34` 均为 `valid('A','B','C')` | 选择 D 级筛选或保存 D 级客户直接 400；历史 D 级数据无法通过正式 UI 编辑 | 产品确认等级枚举：要么全链路加入 D（含迁移/字典/报表），要么前端移除 D；补前后端枚举一致性测试 | 已确认 |

### 11.3 P2 候选（子代理报告，未逐项复核）

以下条目来自前端契约子代理，主审计**未逐行复核**，修复前必须先复现；其中部分可能与 P1-22～P1-28 重叠：

- **列表/筛选契约**：公海列表部分筛选字段被 `stripUnknown` 丢弃；潜客池前端发 `level`、后端只认 `lead_level`；标签筛选、逾期卡片筛选未生效；客户/合同导出范围包含 lead/sea。
- **组织/菜单**：部门根节点 `parent_id: null` 被 Joi 拒绝；HR 因父菜单要求 `system` 权限而看不到系统菜单；采购看板前端路由 `/purchase/request` 缺失；库存前端用 `product` 权限、后端要求 `purchase`；经理 API 平台菜单元数据权限码不一致。
- **交互/数据质量**：团队看板日期参数被忽略；导入进度/取消配置未透传；多处空 `catch` 静默失败；一处裸 `el-empty`；硬编码十六进制颜色；`roleCode` 重复定义；7 天保护期文案过期；侧边栏缺入口；JSDoc 与实现漂移；登录页 `else` 分支不可达。
- **建议**：统一做一次“前端发送字段 × 后端 Joi schema”静态比对（可用脚本生成报告），再决定哪些字段该补、哪些前端该删；不要逐个手改后再靠人工记忆。

### 11.4 对路线图的影响

1. **阶段 A（止血）新增**：P0-12 先做只读统计与回填方案；P0-13 在任何人再次声称“备份可用”之前修复，并完成一次隔离库恢复演练。
2. **阶段 B（数据库与权限对齐）**：P1-23（路由前缀）、P1-27/P1-28（枚举与筛选契约）并入契约对齐；为路由存在性、Joi allowlist、前后端枚举一致性各加一条自动化测试。
3. **阶段 C（授权与资金安全）**：P1-25（回款计划删除）与 P1-26（报价币种/汇率）进入资金正确性批次；两者都可能直接影响金额。
4. **快速见效项**：P1-21、P1-22、P1-24 改动小、用户感知强，可与 P0 修复同批完成。
5. **验收**：新增“导入/新增客户后出现在正确列表”“备份恢复可执行”“上传携带 CSRF 头”“报价编辑后回读一致”四个 E2E 场景；未跑通不得标记完成。

### 11.5 V1.1 复核记录

- **已回读并确认**：`importService.js`、`customerService.js`（导入 INSERT、正式列表、线索列表）、`customerDetailService.js`（新增/更新）、`000_real_baseline.sql`、`110_sync_customer_business_status.sql`、`backup.js`、`backupRouteService.js`、`api/system.js`、`system/backup.vue`、`login/index.vue`、`utils/request.js`、`middleware/csrf.js`、三处 `el-upload`、`ModuleRegistry.js`、`app.js` 挂载、`api-platform.js`、`contract/list.vue`、`contract/crud.js`、`contractCrudService.js`、`quotation/edit.vue`、`quote.js`、`quoteService.js`、`customers.js`、`constants/customer.js`、`constants/poolStatus.js`、`middleware/validate.js`。
- **未执行**：真实登录/上传/恢复请求、E2E、前端生产构建、备份恢复演练、数据库写操作。
- **未验证项**：11.3 全部候选、P0-12 的存量漂移数量（需在生产库只读统计）、P0-13 在 NAS 环境下的实际恢复行为。

### 11.6 更新后的计数

- **P0：13 项**（V1 11 + V1.1 2）。
- **P1：28 项**（V1 20 + V1.1 8）。
- **P2：V1 18 项 + 约 20 项候选（待复核）**。
- **P3：不变**。

> 本报告为 V1.1。仍未验证的项见第 9 章与 11.5；在 P0 未清之前，不应上线。

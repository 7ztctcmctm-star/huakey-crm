# 铧旗 CRM 全项目审计报告

> **审计日期**: 2026-08-18
> **分支**: `fix/v1.0.1-security-patch`
> **审计方式**: 4 路并行深度审计（安全 / 后端质量 / 前端 / 数据库与部署）+ 关键文件人工复核交叉验证
> **状态**: 只读审计，未修改任何文件

---

## 0. 结论摘要

代码层面**未发现可远程利用的 SQL 注入 / RCE / 反序列化**等可直接接管系统的漏洞；认证体系（httpOnly Cookie + CSRF double-submit + 黑名单 + 实时查库刷新权限）与输入校验基础扎实。

但存在 **11 个高危问题** 与 **14 个中危问题**，集中在三类：

1. **授权一致性缺口（最优先）**：列表/详情普遍有数据权限，而部分**写接口与搜索接口缺失**，销售可越权查看/修改他人数据；
2. **前后端 API 契约断裂（必然故障）**：6 处 15+ 个前端调用的端点与后端路由对不上，全部 404；
3. **状态机业务链断裂**：跟进/报价驱动的客户状态推进与设计文档不符。

| 级别 | 数量 | 代表问题 |
|---|---|---|
| 严重 | 0 | — |
| 高 | 11 | 数据越权 ×4、API 404 ×6、跟进状态推进 bug ×1 |
| 中 | 14 | 无权限删除、验证码内存 DoS、init 漂移、迁移非原子、NAS 凭据硬编码等 |
| 低 | ~15 | 纵深防御缺失、死代码、文档过期等 |

另发现 **CLAUDE.md 与代码事实大面积脱节**（7 处以上），会误导后续开发，建议单独安排一次文档校准。

---

## 1. 安全审计（后端）

### 高

#### H-SEC-1 被禁用/删除用户的 JWT 7 天内依然有效
- [backend/middleware/auth.js:108-111](backend/middleware/auth.js#L108-L111)
- `authenticateToken` 每请求仅查 `must_change_password`，**不检查 `status`**。管理员禁用（status=0）或删除用户后，其已签发 token 仍可调用除 `/auth/me` 外全部接口。
- 建议：DB 查询加 `AND status = 1`，命中即 401。

#### H-SEC-2 客户 360 视图 IDOR — 任意销售可遍历查看全库客户详情
- [backend/routes/customer/detail.js:229](backend/routes/customer/detail.js#L229) → [backend/controllers/customerController.js:110-117](backend/controllers/customerController.js#L110-L117)
- `GET /customers/:id/360` 只挂 `checkPermission('customer:list')`，无 `checkDataPermission`；service 直接按 id 查全量 360 视图（联系人/商机/合同/跟进）。
- 建议：路由补 `checkDataPermission('customer', 'owner_id')`。

#### H-SEC-3 报价/合同写操作缺数据权限 — 可修改他人单据
- [backend/routes/quote.js:321,324](backend/routes/quote.js#L321)、[backend/routes/contract/crud.js:166-170](backend/routes/contract/crud.js#L166)、[backend/routes/contract/payment.js:61-77](backend/routes/contract/payment.js#L61)
- `quote/update`、`quote/delete`、`contract/update`、`contract/delete`、`contract/cancel`、`contract/payment/*` 只挂功能权限，无数据范围；`quoteService.updateQuote`（[quoteService.js:237](backend/services/quoteService.js#L237)）不接收 user、无归属校验，UPDATE 仅 `WHERE id = ?`。
- 建议：写接口统一挂 `checkDataPermission`，service 将数据范围拼入 UPDATE WHERE。

#### H-SEC-4 合同搜索无任何权限 — 全库合同号/客户名可枚举
- [backend/routes/contract/crud.js:175](backend/routes/contract/crud.js#L175) → [backend/services/contractCrudService.js:229-241](backend/services/contractCrudService.js#L229-L241)
- `GET /contract/search` 仅 `authenticateToken`，返回全库 `contract_no` + 客户公司名。
- 建议：挂 `checkPermission('contract')` + `checkDataPermission('contract', 'create_by')`。

### 中

| 编号 | 位置 | 问题 |
|---|---|---|
| M-SEC-1 | [routes/knowledge.js:779,847,924](backend/routes/knowledge.js#L779) | 知识库话术/FAQ/文档删除仅 authenticateToken，任意登录用户可删任意内容（含文件实体） |
| M-SEC-2 | [routes/procurement-plan.js:88](backend/routes/procurement-plan.js#L88) | 采购计划删除无权限码、无归属校验 |
| M-SEC-3 | [routes/integration.js:60](backend/routes/integration.js#L60) | `/integration/send-email` 未挂权限，任意登录用户可用公司 SMTP 外发任意收件人邮件 |
| M-SEC-4 | [routes/auth.js:122](backend/routes/auth.js#L122) + [services/authService.js:25,33-43](backend/services/authService.js#L25) | `/captcha` 无独立限流；Redis 未启用时 `captchaStore`（Map）只增不减，可内存 DoS |
| M-SEC-5 | [routes/contract/payment.js:68-77](backend/routes/contract/payment.js#L68) | 回款列表/导出/对账单缺数据权限（同 H-SEC-3 模式） |

### 低

- **L1** [auth.js:69](backend/middleware/auth.js#L69) `jwt.verify` 未显式指定 `{ algorithms: ['HS256'] }`
- **L2** [middleware/logger.js](backend/middleware/logger.js) `getIpAddress` 无条件信任 `X-Forwarded-For`，登录审计 IP / 限流可被伪造绕过
- **L3** [authService.js:84](backend/services/authService.js#L84) 验证码 key 用 `Math.random` 生成（非密码学随机）
- **L4** [authService.js:188-248](backend/services/authService.js#L188) `/auth/me` 缓存 30 秒，用户禁用后最长 30s 仍返回旧数据（与 H-SEC-1 叠加）
- **L5** 生产明文 HTTP 部署（[app.js:28-50](backend/app.js#L28) 显式关 HSTS），依赖反代层 TLS——nginx 已配 443，但需确保部署落地
- **L6** 权限缓存 5 分钟 TTL，角色权限变更未主动清缓存（CLAUDE.md 已注明）
- **L7** [auth.js:130](backend/middleware/auth.js#L130) `roleCode` 兜底回退 JWT 旧值，与"不信任过期值"设计意图相悖

---

## 2. 前端审计

### 高（确定性功能故障，全部经前后端路由逐条核对）

| 编号 | 前端调用 | 后端实际 | 影响 |
|---|---|---|---|
| H-FE-1 | [api/analytics.js:8-17](frontend/src/api/analytics.js#L8) `GET /analytics/*` ×4 | [app.js](backend/app.js) 无 `/analytics` 挂载；实际在 [routes/report/analytics.js](backend/routes/report/analytics.js) `/report/*` | 销售/经理看板销售分析区必然 404 |
| H-FE-2 | [api/customer.js:17](frontend/src/api/customer.js#L17) `post(url, params, {responseType:'blob'})` | [request.js:173-175](frontend/src/utils/request.js#L173) `post()` **丢弃第三参** | 客户/报表导出必失败（blob 配置被吞，返回损坏字符串） |
| H-FE-3 | [api/product.js:15-19](frontend/src/api/product.js#L15) `/inventory/add\|update\|delete\|movement/add` | [routes/inventory.js:52-144](backend/routes/inventory.js#L52) 实际 `/in|out|adjust` | 出入库/预警修改全挂 |
| H-FE-4 | [api/calendar.js:4-6](frontend/src/api/calendar.js#L4) `/calendar/add\|update\|delete` | [routes/calendar.js:50-131](backend/routes/calendar.js#L50) 实际 `/events` | 日程增删改全挂 |
| H-FE-5 | [api/email.js:7-12](frontend/src/api/email.js#L7) `/email/accounts/*`、`/email/sync` | [routes/email.js:49-199](backend/routes/email.js#L49) 实际 `POST /account`、`DELETE /account/:id`（**后端无 update 端点**） | 邮箱账户管理/手动同步失败 |
| H-FE-6 | [api/customer.js:26](frontend/src/api/customer.js#L26) `POST /customer/assign-rules/create` | [routes/customer/assign.js:78](backend/routes/customer/assign.js#L78) 实际 `POST /assign-rules/add` | 新建分配规则 404 |

> 修复方向统一：**前端对齐后端路径**（H-FE-2 需在 [request.js](frontend/src/utils/request.js) 透传第三参 config：`post(url, data, config)`）。

### 中

- **M-FE-1** [router/index.js:609,620](frontend/src/router/index.js#L609) 无权限跳 `/login` 而非 403 页，已登录用户易误判掉线
- **M-FE-2** [views/login/index.vue:104-116](frontend/src/views/login/index.vue#L104) 前端校验比后端 Joi 严格（username ≤20 / password ≤20，后端 ≤50/200 无下限），21+ 位合法账号无法登录
- **M-FE-3** [routes/followUp.js:114](backend/routes/followUp.js#L114) `/follow-up/list` 需 `followup:calendar`，而客户详情页仅要求 `customer:view` → 部分角色打开详情页跟进记录 403
- **M-FE-4** [directives/permission.js:49-62](frontend/src/directives/permission.js#L49) `v-permission:disabled` 全库零使用（死代码），且仅对表单控件生效
- **M-FE-5** [composables/useTable.js:10-19](frontend/src/composables/useTable.js#L10) 无 error 状态，接口失败静默空表

### 低

- **L-FE-1** [views/login/index.vue:52](frontend/src/views/login/index.vue#L52) 验证码 `v-html` 未走 DOMPurify（内容为后端生成，风险低）
- **L-FE-2** [utils/request.js:103-138](frontend/src/utils/request.js#L103) 401 续期成功重试后再次 401 会再次续期，极端情况可能循环，建议加重试上限
- **L-FE-3** 死代码 API：[api/report.js:17](frontend/src/api/report.js#L17) `getReportDashboardStats`、[api/reminder.js:4](frontend/src/api/reminder.js#L4) `getNotifications`（后端为 `/notification-list`）、[api/dataQuality.js](frontend/src/api/dataQuality.js) 整体无引用
- **L-FE-4** [main.js:16](frontend/src/main.js#L16) + package.json：pinia 已挂载但全库无任何 store（死依赖，vite manualChunks 仍单独分包）
- **L-FE-5** 大文件组件：[views/customer/Detail.vue](frontend/src/views/customer/Detail.vue)（1193 行）、[views/service/index.vue](frontend/src/views/service/index.vue)（948 行）、[views/opportunity/list.vue](frontend/src/views/opportunity/list.vue)（843 行）
- **L-FE-6** [views/login/index.vue:88](frontend/src/views/login/index.vue#L88) 客户端包暴露版本号
- **L-FE-7** [router/index.js:72-76](frontend/src/router/index.js#L72) `/pool` 路由 + [views/pool/List.vue](frontend/src/views/pool/List.vue) + [backend/routes/pool.js](backend/routes/pool.js) 均在正常运行，**CLAUDE.md 声称"公海池已废弃"与事实相反**

---

## 3. 后端质量与业务逻辑审计

### 高

#### H-B-1 跟进状态推进条件使用旧版 `'new'` 字符串且漏掉 `lead` — 线索客户跟进后不推进状态
- [backend/services/followUpService.js:78](backend/services/followUpService.js#L78)
- `if (currentStatus === CUSTOMER_STATUS.SEA || currentStatus === 'new')` —— 新状态机中线索状态码是 `lead`（[customerStatus.js:8](backend/constants/customerStatus.js#L8)），`'new'` 是旧版遗留；`lead` 客户创建跟进记录后**状态不会推进到 following**，下游报价/商机链路随之断开（与该分支最近"潜客转正式同步 status"修复相关的业务链断裂同源）。
- 建议：改为 `[CUSTOMER_STATUS.LEAD, CUSTOMER_STATUS.SEA].includes(currentStatus)`。

### 中

- **M-B-1 报价创建不推进客户状态**：全库检索无任何 service 将客户推进到 `quoted`（CLAUDE.md 声称"报价创建：following → quoted"的联动**不存在**）。`quoteService.createQuote`（[quoteService.js:242](backend/services/quoteService.js#L242)）只更新报价自身状态。建议在 createQuote 内补状态推进 + status 变更日志。
- **M-B-2 迁移执行非原子**：[database/migrations/run_migrations.js:108-119](database/migrations/run_migrations.js#L108) 单文件 SQL 直接 `pool.query`，**无事务包裹**；失败后版本号不记录，重跑会重复执行已成功的前半部分（对非幂等迁移会产生脏数据或报错）。建议包 `START TRANSACTION/COMMIT`（DDL 在 MySQL 8 支持事务）。
- **M-B-3 初始化脚本漂移**：[deploy/init-complete.sql](deploy/init-complete.sql)（2556 行/91 表）中 `crm_customer.status` 仍是 `tinyint`、`pool_status` 是 `tinyint`、缺 `business_status`/`old_status_int`/`must_change_password` 等迁移 070/089/097 引入的字段。**用 init 全新初始化会得到旧结构**，再跑迁移会基于旧 schema 执行。建议将 init 文件降级为"最小基线"并注明必须跟随迁移，或由 CI 定期比对。

### 已验证良好（与文档一致）

- **级联删除** [services/userRouteService.js:161-236](backend/services/userRouteService.js#L161)：事务完整（beginTransaction/commit/rollback/release 成对），客户释放公海（owner_id=NULL）、商机转上级、上级不可用转待分配，均符合约定。
- **事务使用**：approvalService / assignService / customerService / authService / contractExportService 等所有事务点 commit/rollback/release 成对，未见遗漏。
- **cron**：[backend/cron/scheduler.js](backend/cron/scheduler.js) 5 个任务带重试（1s/2s/4s 递增）+ 执行日志 + 告警；[cronService.js](backend/services/cronService.js) 回收/提醒 SQL 逻辑正确（NULL last_follow_time 用 create_time 兜底）。

---

## 4. 数据库与部署审计

### 中

- **M-DEP-1 NAS 凭据硬编码在工作区脚本中**：`scripts/` 下 6 个 Python 文件（count_check.py / debug_cp.py / debug_docker.py / debug_import.py / debug_missing.py / verify_import.py）硬编码 `syadmin` / `Aa123456` @ `192.168.0.200`。**当前未被 git 跟踪**（[git ls-files scripts/](scripts/) 无 .py），但磁盘上存在真实生产 NAS 凭据，且 import_to_nas.py 会上传脚本到 NAS —— 若误提交或 NAS 端脚本泄露即为凭据泄露事件。
  - 建议：立即改为环境变量/本地密钥文件（不进仓库），并修改 NAS 上对应账号密码。
- **M-DEP-2 迁移编号断号**：`database/migrations/` 缺 **064 / 065**（063 → 066 直接跳号，共 105 个正向迁移）。若历史环境 schema_migrations 有记录则无碍，建议补注释说明或补两个空迁移占位。
- **M-DEP-3 `.env.test` 已提交进 git**：[.env.test](.env.test) 含 `demo_admin/Demo@123456` 等 E2E 凭据（文件注释已说明为 demo 数据、生产 seed:demo 硬阻断）。低风险但不符合最小暴露原则，建议改为仅保留 `.env.test.example`。

### 低

- **L-DEP-1** [app.js:26-27](backend/app.js#L26) 注释"NAS 部署走 HTTP，禁用 HSTS"与 [deploy/nginx-synology.conf](deploy/nginx-synology.conf) 已配置 443 TLS 的现状矛盾，建议复核后更新注释/逻辑。

### 已验证良好

- **docker-compose.prod.yml**：密钥全部 `${ENV}` 注入（无硬编码）、MySQL 端口不暴露宿主机、各服务 healthcheck 完整、数据卷独立。
- **nginx-synology.conf**：80→443 强制跳转（TLS1.2/1.3 + 现代密码套件 + session ticket 关闭）、`nosniff`/`DENY`/`Referrer-Policy` 安全头齐全。
- **.gitignore**：`.env` / `.env.secrets` / `.env.synology` / `nginx/certs/*` / `backend/logs/` 均已覆盖；仅 `.env.test` 遗漏。
- **迁移执行器** [run_migrations.js](database/migrations/run_migrations.js)：库名归一化（支持跨库/CI）、等待 DB 就绪、失败即中断退出、`schema_migrations` 版本表防重复。

---

## 5. 文档过期专项（CLAUDE.md 与代码事实脱节）

| # | CLAUDE.md 声称 | 实际代码 |
|---|---|---|
| 1 | "token 存 sessionStorage，userInfo 存 localStorage"（§14） | 已迁移 httpOnly Cookie + CSRF double-submit，userInfo/permissions 仅存内存（[useUser.js:18](frontend/src/composables/useUser.js#L18)） |
| 2 | "公海池页面已废弃、/customer/pool 返回 410"（§17.1） | `/pool` 路由 + 视图 + 侧边栏 + [backend/routes/pool.js](backend/routes/pool.js) 均在正常使用（迁移 098 定义 pool:view 权限） |
| 3 | "最新迁移 088，共 86 个"（目录结构） | 最新 **107**，共 105 个正向迁移 |
| 4 | "旧 /api/ 307 重定向至 2026-08-01 移除"（§8） | 307 已不存在（好），但文档未更新 |
| 5 | "报价创建：following → quoted"（§17.2） | 该联动代码**不存在**（M-B-1） |
| 6 | "跟进创建：new/sea → following"（§17.2） | 实际条件写死 `'new'` 且漏 `lead`（H-B-1） |
| 7 | 目录结构含 `deploy/nginx-synology.conf`、根目录 `docker-compose.synology.yml`、`scripts/` Python 运维脚本 | 实际在 `deploy/` 下多套 compose（prod/canary/test）+ nginx 多版本配置 |
| 8 | `crm_customer.status` 存储数值（§13.1 已更新为字符串 ✓） | 状态机相关 §13.1 已正确，但 §4 示例仍引用旧语义 |

> **建议**：本次审计后安排一次 CLAUDE.md 校准（30-60 分钟），以代码为准重写目录结构、认证存储、状态机触发点、部署章节。

---

## 6. 优先修复建议（P0/P1/P2）

### P0 — 数据越权与凭据泄露（尽快，本周）
1. **H-SEC-1** auth 中间件校验用户 `status=1`
2. **H-SEC-2 / H-SEC-3 / H-SEC-4** 客户 360 视图、报价/合同写接口、合同搜索补齐数据权限
3. **M-DEP-1** 清除工作区硬编码 NAS 凭据（改环境变量 + 轮换 NAS 密码）

### P1 — 确定性功能故障（1-2 周）
4. **H-FE-1 ~ H-FE-6** 前端 6 处 API 路径对齐（含 request.js 透传 config 修复导出）
5. **M-SEC-1 ~ M-SEC-3** 知识库/采购计划/SMTP 补权限
6. **H-B-1 / M-B-1** 跟进与报价状态推进修复（同步补 status 变更日志）

### P2 — 健壮性与工程（可排期）
7. **M-SEC-4** 验证码限流 + Map TTL 清理
8. **M-B-2 / M-B-3** 迁移事务化 + init 脚本标注过期
9. **M-FE-1 / M-FE-2 / M-FE-5** 403 页、校验对齐、useTable 错误态
10. **L-FE-3 / L-FE-4 / M-FE-4** 死代码清理（dataQuality api、pinia、v-permission:disabled）
11. **CLAUDE.md 文档校准**（第 5 节清单）

---

## 7. 做得好的地方（值得保持）

- **SQL 注入防护彻底**：60+ 动态拼接点全部参数化或白名单字段；动态表名/列名有白名单校验；`multipleStatements: false`
- **生产启动安全自检**（[app.js](backend/app.js) `validateProductionSecurity`）：强制 CORS_ORIGIN、禁 localhost、强制 128 位 JWT_SECRET、禁 SKIP_CAPTCHA/Swagger——"宁可起不来也不裸奔"
- **字段级脱敏覆盖全面**：product/quote/contract/supplier/purchase_item 全部出口含导出同步脱敏
- **日志脱敏**：`maskLogParams` 递归脱敏 18 类敏感字段，登录失败不落明文密码
- **会话纵深防御**：httpOnly + sameSite=strict + double-submit CSRF + 登出黑名单（SHA-256）+ 每请求查库刷新角色权限 + 强制改密白名单
- **前端 401 续期队列**严谨：避免递归、避免守卫死循环、排队重试
- **上传安全**：扩展名白名单 + magic bytes 深度校验 + 10MB 限制
- **Webhook SSRF 防护**：拒绝内网/保留地址（含云元数据地址）
- **部署工程化**：compose 密钥全注入、healthcheck 齐全、迁移器支持跨库与失败中断、cron 带重试与执行日志

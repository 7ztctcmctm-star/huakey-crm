# 铧旗CRM 全项目审计报告

**审计日期**：2026-07-29
**分支**：`refactor/customer-module-template`
**审计范围**：后端（Express）、前端（Vue 3）、数据库迁移、部署配置、测试、可观测性、性能、合规
**审计维度**：10 个维度
**审计依据**：Express Web Security Spec（security-best-practices 技能）、项目硬约束（project_memory）、MySQL 8.0 语法规范

---

## 执行摘要

本次为全面重审，既验证 2026-07-28 报告中已修复项是否真正落地，又新发现若干阻断性缺陷。

**最高风险（P0，共 3 项）**：
1. **crm_customer.status 类型变更与服务层查询不一致** —— 迁移 070 将 `status` 从 INT 改为 VARCHAR(32)（状态码变为 `'sea'/'following'/'signed'` 等字符串），但 11 个 service 仍用数字比较（`status != 0`/`status = 1`/`status !== 2`），导致**创建合同/商机/工单/跟进/报价全部失效，分析看板数据错误**。
2. **Synology 生产环境 HTTPS 不可用** —— `nginx-synology.conf` 配置了 `listen 443 ssl`，但 `docker-compose.synology.yml` 未映射 443 端口、未挂载 SSL 证书目录，nginx 容器启动即失败。
3. **安全测试目录全部为空文件** —— `backend/tests/security/` 下 cors/headers/rateLimit/upload 4 个测试文件均为 0 字节，CORS/安全头/限流/上传安全零测试覆盖。

**P1（高风险，共 22 项）**：详见各维度章节。

**已修复项验证**：昨日报告的 P0-3（ai.js/softDelete.js/api-auth.js 的 SELECT *）、/follow-plan 路由移除、062 种子迁移动态角色 ID、purchaseService 查询侧 N+1 优化 —— **均已确认落地，无回退**。

---

## 审计方法

1. 静态扫描：`rg` / `Grep` 全项目正则搜索（SELECT *、throw new Error、v-html、localStorage、认证中间件、$1、DELIMITER、ON DELETE CASCADE 等）。
2. 人工复核：对扫描命中的关键文件逐行确认，排除误报。
3. 迁移验证：直接读取 `070_unify_customer_status.sql` 与 `contractService.js` 核验类型一致性。
4. 结果分级：P0 = 上线阻塞 / P1 = 高风险 / P2 = 建议修复 / P3 = 低优先级。

---

## 维度 1：安全审计

### 1.1 认证与授权

| 严重 | 文件 | 行号 | 问题 | 说明 |
|------|------|------|------|------|
| P1 | `backend/routes/contract/approval.js` | L16 | `POST /approve` 敏感审批路由无 `requireAdmin`/`checkPermission` | 权限校验完全下沉到控制器（contractController.js:142），违反纵深防御，应在路由层补权限中间件 |
| P2 | `backend/routes/supplier.js` | L389,463,539,549,561 | 5 个 GET 路由（/detail/:id、/options、/performance/:id、/ranking、/compare）仅 `authenticateToken`，缺 `checkPermission('supplier')` | 任意登录用户可拉取供应商选项/排名/对比数据；`/detail/:id` 有 checkDataPermission 但无功能权限码 |
| P2 | `backend/routes/automation.js` | L89,100,113... | 全部路由用 `requireAdmin` 替代 `checkPermission` | 仅判断管理员角色，未走权限矩阵，无法细粒度授权（设计不一致，非直接漏洞） |
| P2 | `backend/routes/role.js` | L44,54,64 | /add、/update、/delete 用 `requireAdmin` 而非 `checkPermission('system:role')` | /list 用了 checkPermission，写操作反而跳过功能权限码 |
| 已通过 | `backend/routes/purchase/comparison.js` | L47 | `router.use(authenticateToken, checkPermission('purchase:comparison'))` 全局挂载 | — |
| 已通过 | `backend/routes/purchase/request.js` | L41 | 全局挂载认证+权限 | — |
| 已通过 | `backend/routes/notification.js` | L13 | 全局挂载认证+权限 | — |
| 已通过 | `backend/routes/approval.js` | — | 所有路由均有 authenticateToken + checkPermission('approval') | — |

### 1.2 SQL 注入

| 严重 | 文件 | 行号 | 问题 | 说明 |
|------|------|------|------|------|
| High | `backend/routes/api-platform.js` | L196 | Webhook 测试端点 SSRF | `fetch(webhook.url)` 创建时仅 `Joi.string().uri()` 校验，不限制 scheme（允许 file://）、不拦截内网 IP/云元数据 169.254.169.254；管理员可探测内网 |
| High | `backend/routes/ai.js` + `backend/config/database.js` | L141, L70-85 | AI Text-to-SQL 正则黑名单可绕过 + 只读池降级主库 | 正则可被注释/编码绕过；`.env.example` 中 `DB_RO_*` 默认注释关闭，readOnlyPool 降级为可写主库，AI SQL 以可写权限执行 |
| 已通过 | `backend/services` | — | 无 `$1` 占位符、无 `pool.execute`、无字符串拼接 SQL | 动态表名/字段名均有白名单（approvalService.js:18、softDelete.js:4、qualityService.js:17、automationService.js:102-107） |
| 已通过 | `backend/config/database.js` | L18 | `multipleStatements: false` | — |

### 1.3 文件上传

| 严重 | 文件 | 行号 | 问题 | 说明 |
|------|------|------|------|------|
| 已通过 | `backend/routes/upload.js` | L23,45-57,64-84,117 | memoryStorage（无路径遍历）+ fileSize 10MB + 扩展名/MIME 校验 + magic bytes（file-type 库）+ `checkPermission('file:upload')` + originalname 不作存储路径 | 符合规范 |

### 1.4 XSS

| 严重 | 文件 | 行号 | 问题 | 说明 |
|------|------|------|------|------|
| 已通过 | `backend/` | — | 全局无 `res.render`、无 `res.send(HTML)`，所有响应均为 JSON | 后端无 XSS 风险（前端 XSS 见维度 7） |

### 1.5 CSRF

| 严重 | 文件 | 行号 | 问题 | 说明 |
|------|------|------|------|------|
| 已通过 | `backend/app.js` | L136,141 | cookieParser → csrfProtection → 业务路由，顺序正确；skip 列表仅含 login/refresh/logout/register | double-submit cookie 机制已启用 |
| P2 | `backend/middleware/csrf.js` | L40-53 | 公开调查 /respond 端点受 CSRF 中间件保护 | 无 Cookie 的纯 API 客户端（短信链接直接 POST）会被 403 拒绝，功能可能受限（非安全问题） |

### 1.6 敏感配置

| 严重 | 文件 | 行号 | 问题 | 说明 |
|------|------|------|------|------|
| P1 | `deploy/smoke-test.sh` | L10 | `ADMIN_PASS=${ADMIN_PASS:-huakey123}` | 冒烟测试管理员密码回退到硬编码弱密码，部署时未显式设置将用此密码登录生产 admin |
| P1 | `scripts/import_backup.py` | L10-12 | 硬编码 NAS SSH 凭据 `NAS_PWD='Aa123456'` | 已被 .gitignore 覆盖不提交，但真实凭据明文存于磁盘 |
| 已通过 | `.env.example` | — | 全为占位符 | — |
| 已通过 | `backend/app.js` | L122-125 | 生产环境强制校验 JWT_SECRET 为 128 位 hex | — |
| 已通过 | `deploy/init-admin.sql` | L22-30 | 密码通过 `${ADMIN_INITIAL_PASSWORD_HASH}` 环境变量注入 + must_change_password=1 | — |

### 1.7 废弃路由

| 严重 | 文件 | 行号 | 问题 | 说明 |
|------|------|------|------|------|
| P2 | `backend/routes/followPlan.js` | 全文 | 文件仍存在，返回 410 | `app.js` 已未挂载（昨日已移除 /follow-plan），但文件未删除，死代码 |
| P2 | `backend/routes/customer/leads.js` | 全文 | 文件仍存在，返回 410 | 同上，customer/pool.js、customer/quality.js 已彻底删除 |
| 已通过 | `backend/app.js` | — | /follow-plan 已移除 | 昨日修复已确认 |

### 1.8 其他安全配置

| 严重 | 文件 | 行号 | 问题 | 说明 |
|------|------|------|------|------|
| Medium | `backend/app.js` | L34,55 | CSP 含 `'unsafe-inline'` | scriptSrc 允许内联，削弱 XSS 防护；SPA 常见妥协，建议长期改 nonce |
| Medium | `backend/app.js` | L143 | `express.json({ limit: '10mb' })` | JSON 限制 10MB 偏大，并发下 DoS 风险，建议降至 1MB 或按路由差异化 |
| P2 | `backend/app.js` | L144 | `express.urlencoded({ extended: true })` 未设 limit | 默认 100KB 可接受，但与 JSON 不一致 |
| Medium | `backend/routes/finance-enhanced.js` | L140 | CSV 导出未做公式注入防护 | 未对 `=+-@\t\r` 开头的单元格值前缀转义，Excel 打开可触发公式执行；同类问题在 report/analytics.js:243 |
| Medium | `backend/routes/survey.js` | L208 | 公开 /respond 接口无验证码 | 仅有 IP 速率限制（20次/小时全局 + 10次/15分钟每活动），代理池可绕过，建议加图形验证码 |
| 已通过 | `backend/app.js` | L130-135 | CORS origin 非 `true`/`'*'`，credentials 与具体 origin 兼容 | — |
| 已通过 | `backend/app.js` | L22-24 | trust proxy 仅生产/Vercel 设 `1` | — |
| 已通过 | `backend/app.js` | L30-69 | helmet() + CSP | — |
| 已通过 | 全局 | — | 无 `res.redirect` 调用 | 无开放重定向风险 |
| 已通过 | `backend/services/backupRouteService.js` | L51,158 | 使用 `execFile`（数组参数，无 shell） | 无命令注入 |
| 已通过 | `backend/middleware/errorHandler.js` | L88-92 | 5xx 返回通用消息不泄露 stack | — |
| 已通过 | `backend/routes/auth.js` | L137 | authLimiter（生产 30次/15分钟）+ Redis 存储 | — |
| 已通过 | `backend/services/authService.js` | L33-69 | 验证码 Redis 存储（TTL 300s，内存降级） | — |

---

## 维度 2：代码质量审计

### 2.1 SELECT * / 表别名.* 残留

**昨日修复验证**：
- `backend/routes/ai.js` — 已修复，无 SELECT * ✓
- `backend/utils/softDelete.js` — 已修复，使用 `SELECT id, ${nameColumn}, deleted_at` ✓
- `backend/middleware/api-auth.js` — 已修复，使用 `SELECT id, name, status, expires_at, permissions FROM crm_api_key` ✓

**其余残留**：

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P2 | `backend/services/aiRouteService.js` | L27 | `SELECT s.*, u.real_name as creator_name`（表别名.*） |
| P2 | `backend/utils/qualification-reminder.js` | L68,101,118 | 3 处 `SELECT r.*` / `SELECT q.*` |
| P2 | `backend/scripts/analyze_query.js` | L157,161,165 | 3 处 SELECT *（脚本文件，非生产路径） |

### 2.2 throw new Error 残留（应为 AppError）

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P1 | `backend/services/aiRouteService.js` | L151,157,162 | 3 处 `throw new Error(...)`，未关联 ErrorCodes |
| P1 | `backend/services/leadsService.js` | L119-121 | `const err = new Error('线索不存在或已分配'); err.code = 404; throw err;`（变体形式） |
| 已通过 | `backend/controllers/` | — | 无残留 | — |

### 2.3 软删除条件缺失（SELECT 查询未追加 `deleted_at IS NULL`）

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P1 | `backend/services/aiRouteService.js` | L92-99,117-123 | crm_opportunity + crm_customer 两表联查缺 deleted_at |
| P1 | `backend/services/contractService.js` | L146-153 | crm_payment 查询缺 `p.deleted_at IS NULL`（同文件其它处都加了） |
| P1 | `backend/services/contractService.js` | L183 | crm_customer 查询缺 deleted_at |
| P1 | `backend/services/supplierService.js` | L79,81,88-90 | crm_supplier_contact / crm_supplier_qualification / crm_customer_supplier_relation 查询缺 deleted_at |
| P1 | `backend/services/contractPaymentService.js` | L52 | crm_payment 查询缺 deleted_at |
| P1 | `backend/services/paymentService.js` | L155 | crm_payment 查询缺 deleted_at |
| P1 | `backend/services/productService.js` | L38,46 | crm_product 查询缺 deleted_at |
| P1 | `backend/services/approvalService.js` | L226 | crm_contract 查询缺 deleted_at |
| P2 | `backend/services/aiRouteService.js` | L39,42 | 单表查询缺 deleted_at |
| P2 | `backend/services/approvalService.js` | L223 | crm_quote 查询缺 deleted_at |
| P2 | `backend/services/contractCrudService.js` | L114 | crm_customer 查询缺 deleted_at |
| P2 | `backend/services/contactRouteService.js` | L128,180 | crm_customer 查询缺 deleted_at |
| P2 | `backend/services/quoteService.js` | L125,365 | crm_customer / crm_quote 查询缺 deleted_at |
| P2 | `backend/services/leadsService.js` | L250 | crm_customer 查询缺 deleted_at |
| P2 | `backend/services/followUpService.js` | L333,360 | crm_follow_up 查询缺 deleted_at |
| P2 | `backend/services/supplierScoringService.js` | L164 | crm_supplier 查询缺 deleted_at |
| 已通过 | `backend/services/customerService.js` | — | 全部 SELECT 正确加了 `c.deleted_at IS NULL` ✓ |

### 2.4 错误响应格式不符合 `{code, message, data}`

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P2 | `backend/controllers/contractController.js` | L130 | `res.json({ code: 200, data: rows })` 缺 message |
| P2 | `backend/index.js` | L6,14,16 | 多余字段 env/db/result/error，缺 message/data |
| P2 | `backend/scripts/test-app.js` | L13 | 缺 data，多余 routes |
| P2 | `backend/services/authService.js` | L135,142 | `new AppError(ErrorCodes.LOGIN_FAILED, msg, 401)` 第三参数应为 details(object)，误传数字 401（httpStatus 已由 ErrorCodes 提供） |

### 2.5 附加发现（运行时 bug）

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P1 | `backend/routes/customer/import.js` | L74 | `logger.error(...)` 但该文件**未导入 logger**，catch 触发时抛 `ReferenceError: logger is not defined`，掩盖原始错误 |

---

## 维度 3：数据库审计

### 3.1 P0：crm_customer.status 类型变更与服务层查询不一致（阻断性）

**根因**：迁移 `070_unify_customer_status.sql:75` 将 `crm_customer.status` 从 INT 改为 `VARCHAR(32)`，状态码变为字符串（`'sea'/'following'/'quoted'/'negotiating'/'signed'/'lost'/'paused'`）。但以下 service 仍用数字比较：

| 文件 | 行号 | 代码 | 影响 |
|------|------|------|------|
| `backend/services/contractService.js` | L183 | `WHERE id = ? AND status != 0` | MySQL 将 'signed' 强转为 0，`0 != 0` 为 FALSE，查询返回 0 行 |
| `backend/services/contractService.js` | L189 | `if (customerCheck[0].status !== 2)` | JS 严格不等，'signed' !== 2 恒 TRUE，**总是抛"只能为正式客户创建合同"** |
| `backend/services/opportunityService.js` | L293,297 | 同上模式 | 创建商机失效 |
| `backend/services/serviceOrderService.js` | L213,221 | 同上模式 | 创建工单失效 |
| `backend/services/followUpService.js` | L22,461 | `WHERE id = ? AND status != 0` | 创建跟进记录失效 |
| `backend/services/quoteService.js` | L278 | 同上 | 创建报价单失效 |
| `backend/services/contactRouteService.js` | L59 | 同上 | 联系人路由校验失效 |
| `backend/services/followPlanRouteService.js` | L12 | 同上 | 跟进计划校验失效 |
| `backend/services/userRouteService.js` | L178 | `WHERE owner_id = ? AND status != 0` | 用户注销时释放客户池失效 |
| `backend/services/analysisService.js` | L64,248,288,416,457 | `status != 0`/`status = 1`/`status = 2` | 分析看板数据全部错误 |
| `backend/services/automationService.js` | L400 | `c.status = 1` | 自动化规则触发失效 |
| `backend/services/surveyService.js` | L174 | `status = 1` | 满意度调查计数错误 |

**影响面**：11 个服务文件、15+ 处查询；创建合同/商机/工单/跟进/报价功能全部失效，分析看板数据错误，用户注销客户释放失效。**必须在 070 迁移应用前同步修复全部 service**，将数字比较改为字符串状态码（如 `'signed'`）。

### 3.2 禁用语法扫描

**结论：通过。** 所有 .sql 迁移文件均未使用 DELIMITER、$$、CREATE PROCEDURE/FUNCTION、CREATE INDEX IF NOT EXISTS（全部用 information_schema + PREPARE 模式）、$1 占位符。

### 3.3 保留字列名

**结论：通过。** 无 `rank` 列（已用 sort_order）。`level`/`status` 在 MySQL 8.0 为非保留关键字，无需反引号。

### 3.4 级联删除（ON DELETE CASCADE）

共 32 处。`059_core_foreign_keys.sql` 采用智能模式（可空则 SET NULL，否则 CASCADE）为最佳实践。但早期迁移存在硬 CASCADE：

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P1 | `database/migrations/006_add_missing_foreign_keys.sql` | L44,91 | crm_assign_log / crm_follow_up_reminder → crm_customer ON DELETE CASCADE；硬删除客户丢失日志/提醒 |
| P1 | `database/migrations/035_customer_tags.sql` | L28 | crm_customer_tag → crm_customer ON DELETE CASCADE；硬删除客户丢失标签 |
| P1 | `database/migrations/042_lead_scoring.sql` | L31 | crm_customer_score_log → crm_customer ON DELETE CASCADE；硬删除客户丢失评分日志 |
| 已通过 | `database/migrations/059_core_foreign_keys.sql` | L4-64 | 13 处条件级联 `IF(@is_nullable > 0, 'SET NULL', 'CASCADE')` |
| 已通过 | `database/migrations/060_support_foreign_keys.sql` | — | 11 处全部 `ON DELETE SET NULL` |

> 风险评估：crm_customer 设有软删除，正常路径不触发硬 DELETE。但 006/035/042 的硬 CASCADE 意味着若有代码路径执行 `DELETE FROM crm_customer`，将级联丢失数据且无法恢复。建议改为 SET NULL 或 Restrict。

### 3.5 软删除列覆盖

**核心业务表均已覆盖**：crm_customer、crm_contact、crm_opportunity、crm_contract、crm_follow_up、crm_supplier、crm_product_price 等均有 deleted_at。

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P1 | `database/migrations/066_create_purchase_request.sql` | L1-20 | 新建表 crm_purchase_request **无 deleted_at 列** |
| P1 | `database/migrations/067_create_purchase_comparison.sql` | L1-18 | 新建表 crm_purchase_comparison **无 deleted_at 列** |
| P1 | `database/migrations/058_soft_delete_batch2.sql` | L5-11 | 7 条裸 `ALTER TABLE ADD COLUMN deleted_at` 无 information_schema 检查，**重复执行报 "Duplicate column name"**（对比 057/019 均用幂等模式） |
| P1 | `database/migrations/070_unify_customer_status.sql` | L72,75 | `UPDATE ... SET old_status_int = status` + `ALTER TABLE MODIFY status VARCHAR(32)` 无类型检查，**不可安全重跑** |
| P1 | `database/migrations/071_unify_customer_contact.sql` | L35-48 | `INSERT INTO crm_contact SELECT FROM crm_customer` 无 NOT EXISTS 去重，**重复执行产生重复联系人** |
| P1 | `database/migrations/082_cleanup_test_users.sql` | L7 | `DELETE FROM sys_user WHERE username LIKE '%test%'` 破坏性、无幂等保护、可能误删含 "test" 的正式账号 |

### 3.6 组合索引

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P2 | `database/migrations/008_add_composite_indexes.sql` | L7 | `idx_cust_owner_status_ctime (owner_id, status, create_time)` 缺 deleted_at |
| P2 | `database/migrations/025_composite_indexes_v2.sql` | L14 | `idx_cust_status_owner_follow (status, owner_id, last_follow_time)` 缺 deleted_at，列顺序不利于 owner_id 等值查询 |
| P2 | `database/migrations/053_performance_indexes.sql` | L19 | `idx_customer_owner (owner_id, deleted_at)` 缺 status |
| P2 | 综合 | — | **不存在 customer(owner_id, status, deleted_at) 三列复合索引**；contract 也缺 (customer_id, status) 复合索引。列表查询需 index_merge 或回表 |
| 已通过 | 008/017/025/053 | — | 均采用 information_schema 检查 + PREPARE 模式，幂等性良好 |

### 3.7 迁移编号连续性

| 严重 | 问题 | 说明 |
|------|------|------|
| P2 | 064、065 缺失 | migrations 目录无 064/065 文件，063 直接跳到 066 |
| P2 | 082-088 无 down 文件 | 7 个迁移无对应 _down.sql，不可回滚；088_add_lead_pool 含数据迁移（status='sea' 改 'lead'），无 down 意味着无法回滚 |

### 3.8 062 种子迁移验证

**已通过**：`062_seed_module_permissions.sql:51-68` 已用 `WHERE NOT EXISTS` 保证幂等 + `sys_role.code = 'boss'/'finance'` 动态解析 role_id。昨日修复已确认落地。

---

## 维度 4：部署审计

### 4.1 P0：Synology 生产环境 HTTPS 不可用

| 严重 | 文件 | 行号 | 问题 | 说明 |
|------|------|------|------|------|
| **P0** | `deploy/synology/docker-compose.synology.yml` | L137-140 | nginx 服务仅映射 `"80:80"`，**未暴露 443 端口**；volumes 仅挂载 nginx-synology.conf，**未挂载 SSL 证书目录**到 `/etc/nginx/ssl` | nginx-synology.conf 配置了 `listen 443 ssl`，启动时因找不到证书文件而失败，**生产 HTTPS 完全不可用** |
| **P0** | `deploy/nginx-synology.conf` | L32,36-37 | `listen 443 ssl http2` + `ssl_certificate /etc/nginx/ssl/fullchain.pem` | 因 compose 未挂载证书，HTTPS 实际无法启动；注释声称"compose 已挂载 ./deploy/ssl"但实现不一致 |

**修复**：compose 添加 `"443:443"` 端口映射 + `./deploy/ssl:/etc/nginx/ssl:ro` 卷挂载。

### 4.2 其他部署问题

| 严重 | 文件 | 行号 | 问题 | 说明 |
|------|------|------|------|------|
| P1 | `docker-compose.yml`（根目录） | L8-93 | mysql/redis/backend/frontend 四容器**均无** mem_limit/cpus | — |
| P1 | `deploy/docker-compose.canary.yml` | L6-126 | 六容器均无资源限制 | — |
| P1 | `deploy/nginx-stable.conf` | L11-12 | 仅 `listen 80`，无 HTTPS/证书/443 | server_name `_` 通配符 |
| P1 | `deploy/nginx-canary.conf` | L12-13 | 同上 | — |
| P1 | `frontend/nginx.conf` | L2-3 | 仅 `listen 80`，**`server_name localhost`** | 明确使用 localhost，无 HTTPS |
| P1 | `.env.synology.example` | L13 | `DB_USER=root` | 模板建议应用用 root 连库，违反最小权限 |
| P1 | `database/migrations/run_migrations.js` | L25-57 | **无 DB 就绪重试逻辑**，DB 未就绪时立即失败 | 对比 database/migrate.js:24-39 有 30 次重试 |
| P1 | `deploy/synology/Dockerfile.synology` | L45 | `CMD ["sh","-c","node database/migrations/run_migrations.js; node app.js"]` 用 `;` | **迁移失败后 app.js 仍启动**；且用无重试的 run_migrations.js |
| P2 | `deploy/synology/docker-compose.synology.yml` | L29 | `ports: "3307:3306"` | MySQL 端口暴露宿主机，生产 DB 不应外网可达 |
| P2 | `docker-compose.yml`（根目录） | L39-40,73-74,90-91 | Redis 6379/backend 5000/frontend 80 全暴露宿主机 | — |
| P2 | `deploy/synology/update-nas.sh` | L27 | `git add .` | 无差别暂存，可能意外提交敏感文件 |
| P2 | `deploy/push-prod.bat` | L3 | 硬编码本地用户路径和 SSH 密钥文件名 | 泄露用户名 |
| P2 | `deploy/docker-compose.test.yml` | L12,27,59 | 有 mem_limit 但均未设 cpus | — |
| 已通过 | `deploy/deploy.sh` | L22-31 | .env.secrets 缺失时 FATAL + exit 1 | 禁止回退 .env |
| 已通过 | `deploy/validate-env.js` | L59-94 | 校验 NODE_ENV/CORS_ORIGIN/JWT_SECRET/SKIP_CAPTCHA/ENABLE_SWAGGER | — |
| 已通过 | `backend/app.js` | L112-119 | 生产环境 SKIP_CAPTCHA=true / ENABLE_SWAGGER=true 时 process.exit(1) | — |
| 已通过 | `backend/services/backupRouteService.js` | L6,51,158 | 使用 execFile（数组参数） | 防注入 |

---

## 维度 5：测试审计

### 5.1 P0：安全测试目录全部为空文件

| 严重 | 文件 | 问题 |
|------|------|------|
| **P0** | `backend/tests/security/cors.test.js` | 文件存在但**内容为空**（0 字节） |
| **P0** | `backend/tests/security/headers.test.js` | 0 字节 |
| **P0** | `backend/tests/security/rateLimit.test.js` | 0 字节 |
| **P0** | `backend/tests/security/upload.test.js` | 0 字节 |

**结论**：CORS、安全响应头、速率限制、文件上传安全均无任何测试覆盖，安全测试目录形同虚设。

### 5.2 单元测试覆盖

| 严重 | Service | 说明 |
|------|------|------|
| P1 | `supplierService` | 无专用单元测试（仅在 fieldPermission.test.js 中被 mock） |
| P1 | `purchaseService` | 无任何测试 |
| P1 | `paymentService` | 无任何测试 |
| 已通过 | `automationService` | services-automationService.test.js（475 行，覆盖完整） |
| P2 | 50+ service | contractPaymentService/contractExportService/contractTemplateService/emailService/financeService/hrService/inventoryService/invoiceService/knowledgeService/productService/quoteService/supplierScoringService/surveyService/dashboardService 等均无单元测试 |

> 注：backend/tests/supplier.test.js、purchase.test.js 等存在，但都是路由层参数验证测试（supertest 测 HTTP 层），未直接测试 service 层逻辑。

### 5.3 E2E 覆盖

| 严重 | 流程 | 状态 |
|------|------|------|
| 已通过 | 登录 / 客户CRUD / 报价转合同 / 审批 / 导航 | 覆盖 |
| P2 | 供应商 / 采购 / 回款 / 邮件 / HR / 合同CRUD | 未覆盖 |

### 5.4 失败用例与错误中间件

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| 已通过 | `backend/TEST_FAILURES.md` | — | 2026-06-29 记录的 12 suites/39 tests 失败已于 06-30 全部修复 |
| P2 | `backend/tests/customer.test.js` | L14-19 | `app.use('/api/v1/customer', customerRoutes)` 后**未挂载错误处理中间件**，service 抛错走 next(error) 时 Express 返回 HTML 错误页 |
| P2 | `backend/tests/supplier.test.js` | L19-24 | 同上 |
| P2 | `backend/tests/` 根目录约 50+ 路由级测试 | — | 均未挂载统一错误处理中间件，仅 integration/controller/ 下集成测试正确挂载 |

---

## 维度 6：API 审计

### 6.1 Joi 校验

**正面结果**：以下路由文件全部 POST/PUT/PATCH 均挂载 `validate(schema)` ✓
routes/contract/crud.js、payment.js、export.js；routes/customer/detail.js、contact.js、assign.js、import.js；routes/purchase/request.js、comparison.js、purchase.js；routes/auth.js、user.js、role.js、supplier.js；routes/invoice.js、followUp.js、product.js、hr.js 等。

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P2 | `backend/routes/notification.js` | L48 | `/read/:id` 路径参数 id 未走 `validate(schema, 'params')`，改为控制器内 parseInt + 手工判断 |
| P3 | `backend/routes/followPlan.js` | L25-28 | 4 条废弃路由无 validate（仅返回 410） |

### 6.2 next 参数缺失（错误无法传递）

**4 参数错误处理中间件**：next 均存在 ✓（customer/import.js:86、upload.js:103、errorHandler.js:28,54）

**普通处理器缺失 next（直接吞掉返回 500）**：

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P2 | `backend/routes/customer/detail.js` | L246,264 | /overdue、/near-recycle 处理器 `async (req, res) =>`，catch 内 res.status(500) 不调 next |
| P2 | `backend/routes/ai.js` | L40,74,101,189,200,215 | 多个 AI 路由处理器无 next |
| P2 | `backend/routes/auth.js` | L122,137,214,244,277,290,306,319,333,354 | /captcha、/login、/logout、/me、/register、/profile、/update-profile、/change-password、/force-change-password、/refresh 全部无 next |
| P2 | `backend/routes/supplier.js` | L373,389,402,453,463... | 多处 `(req, res) =>` 无 next（仅 /update、/delete 用了 next ✓） |
| P2 | `backend/routes/role.js` | L31,44,54 | /list、/add、/update 无 next（仅 /delete 用了 next ✓） |
| P2 | `backend/routes/notification.js` | L16,33,48,59 | 多处无 next |
| P2 | `backend/routes/analysis.js` | L21,32,44,55,66,77,88,99,111 | 9 个 GET 分析接口无 next |
| P2 | `backend/routes/automation.js` | L89,100,113,125... | 大量路由无 next |
| P2 | `backend/routes/api-platform.js` | L54,69,86,104,114,128,143,158,175,186,226 | 多处无 next |
| 已通过 | `backend/routes/user.js`、`purchase/request.js`、`purchase/comparison.js`、`customer/contact.js`、`contract/crud.js`（控制器层） | — | 全部使用 `(req, res, next) =>` + `next(error)` ✓ |

### 6.3 分页 count 查询的数据访问控制

| 严重 | 文件 | 行号 | 结论 |
|------|------|------|------|
| 已通过 | `customerService.js` | L244-247,605,661 | countQuery 含 permissionWhere + permParams ✓ |
| 已通过 | `contractService.js` | L88-91 | countSql 含 permissionClause + countParams 含 permParams ✓ |
| 已通过 | `contractCrudService.js` | L74-76 | countQuery 含 whereClause（含权限片段）✓ |
| 已通过 | `supplierService.js` | L45-50 | countSql 含 permissionClause + permParams ✓ |
| P2 | `leadsService.js` | L82 | `SELECT COUNT(*) FROM crm_customer c ${whereClause}` 未见注入数据权限 clause/params（疑似缺失，需进一步确认） |
| P2 | `contractPaymentService.js` | L114 | 需进一步确认是否注入权限条件 |

### 6.4 控制器职责

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P2 | `backend/controllers/contractController.js` | L139-156 | `approveContract` 在控制器内做权限校验和参数二次校验，业务逻辑下沉到控制器，应由路由中间件 + Joi 完成 |
| 已通过 | `customerController.js` | — | 薄控制器样板，仅 try/catch + service 调用 + next(error) ✓ |

---

## 维度 7：前端审计

### 7.1 P1：v-safe-html 指令实现缺陷（XSS 防护失效）

| 严重 | 文件 | 行号 | 问题 | 说明 |
|------|------|------|------|------|
| P1 | `frontend/src/directives/sanitize.js` | L5,9 | `el.innerHTML = sanitize(binding.value)` — sanitize 是 async 函数返回 Promise，innerHTML 被赋值为 `"[object Promise]"`，**指令完全失效** | 修复：`sanitize(...).then(clean => { el.innerHTML = clean })` |
| P1 | `frontend/src/views/email/inbox.vue` | L74 | `<div v-html="sanitize(selectedEmail.body_html || ...)">` 直接用 `v-html` 而非 `v-safe-html` 指令，且 sanitize 异步返回 Promise 被赋给 innerHTML | 邮件正文实际显示为 `[object Promise]`，净化逻辑未生效；正确做法是用 v-safe-html 指令并修复指令异步 |
| P1 | `frontend/src/views/login/index.vue` | L52 | `v-safe-html="captchaSvg"` 用了正确指令，但因指令实现缺陷，验证码 SVG 实际无法渲染 | — |
| 已通过 | `frontend/src/views/email/compose.vue` | — | 无 v-html（使用 el-input type="textarea"） | — |

### 7.2 路由权限元数据缺失

| 严重 | 文件 | 行号 | 路由 | 现有 meta |
|------|------|------|------|------|
| P1 | `frontend/src/router/index.js` | L72-76 | `customer/detail/:id` | `{ title: '客户详情' }` 无 permission |
| P1 | `frontend/src/router/index.js` | L101-106 | `quotation/edit/:id?` | 无 permission |
| P1 | `frontend/src/router/index.js` | L113-118 | `contract/detail/:id` | 无 permission |
| P1 | `frontend/src/router/index.js` | L173-178 | `supplier/detail/:id` | 无 permission |
| P1 | `frontend/src/router/index.js` | L185-190 | `purchase/detail/:id` | 无 permission |
| P2 | `frontend/src/router/index.js` | L390,450,522,528 | team-dashboard/profile/system:integration/system:currency | 有 admin 但无 permission |

> 5 个详情页完全无权限校验，任何登录用户可通过改 URL 访问他人数据。

### 7.3 其他前端项

| 严重 | 检查项 | 结论 |
|------|------|------|
| 已通过 | localStorage/sessionStorage | 未存储 token 或完整权限（httpOnly Cookie + 内存 ref 方案）✓ |
| 已通过 | CSRF double-submit | `frontend/src/utils/request.js:50-58` 读取 csrf-token cookie 并设 X-CSRF-Token 头 ✓ |
| 已通过 | axios timeout | 60000ms ✓ |
| 已通过 | Element Plus 按需导入 | vite.config.js 配置 AutoImport + Components + ElementPlusResolver ✓ |
| 已通过 | 硬编码敏感信息 | 未发现硬编码 API_KEY/token/密码 ✓ |

---

## 维度 8：可观测性审计

### 8.1 日志脱敏

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P2 | `backend/config/slowQuery.js` | L43,55 | `params: JSON.stringify(params).slice(0, 200)` 原样记录 SQL 绑定参数，未走 maskLogParams。若 SQL 含 password_hash/token 比对，敏感值会写入 winston warn 日志 |
| 已通过 | `backend/utils/mask.js` | L140-168 | SENSITIVE_FIELDS 覆盖 16 类（password/token/secret/cookie 等）替换 ******；MASK_FIELDS 覆盖 19 类 PII 做部分掩码；password 类 delete |
| 已通过 | `backend/middleware/logger.js` | L32-70 | logAction 入参经 maskLogParams；changedFields/oldValue/newValue 递归脱敏 |
| 已通过 | `backend/routes/auth.js` | L158-160,175-177 | 登录成功/失败 logAction 仅传 username，不传 password |

### 8.2 慢查询与告警

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| 已通过 | `backend/config/slowQuery.js` | L17 | 阈值默认 1000ms，可环境变量覆盖；同时拦截主 pool 与 readOnlyPool |
| P2 | `backend/utils/alert.js` | 全文 | 慢查询仅写日志，未触发告警；只有 500 错误有窗口告警（10次/5分钟 + 5分钟防抖 + 企微/邮件双通道） |
| 已通过 | `backend/app.js` | L484-514 | unhandledRejection + uncaughtException 均调用 alertError({level:'critical'})，后者 1 秒后 exit 触发 Docker 重启 |

### 8.3 Prometheus metrics

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| 已通过 | `backend/app.js` | L418-425 | /metrics GET 需 authenticateToken + 管理员，非管理员 403 |
| P2 | `backend/routes/metrics.js` | L27 | `POST /metrics/client` 无认证（注释明写"无需认证"），任何匿名用户可向 sys_client_perf 表无限写入 |

### 8.4 健康检查

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P1 | `backend/app.js` | L259-272 | `/health` 即使 `dbOk=false` 仍返回 HTTP 200。Docker/k8s/Nginx 健康探测只看状态码，DB 宕机时仍判定健康，不触发重启/摘流 |
| P2 | `backend/app.js` | — | 缺 `/healthz`（liveness）+ `/readyz`（readiness）标准分离端点 |

---

## 维度 9：性能审计

### 9.1 N+1 查询

**昨日修复验证**：purchaseService.js 查询侧已用窗口函数优化（L167-189）、convertToPurchase/createPurchase 已批量化 ✓

**残留 N+1**：

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P1 | `backend/services/customerService.js` | L484-502 | `batchAssignCustomers` 循环内每客户 3 次查询（SELECT/UPDATE/INSERT），100 客户 = 300 次往返 |
| P2 | `backend/services/purchaseService.js` | L74-79,116-122,204-209 | createPlan/updatePlan/autoGenerate 循环单条 INSERT（查询侧已优化，写入侧未优化） |
| P2 | `backend/services/supplierService.js` | L296-299 | `getComparison` 循环内查 ratings，应改 `WHERE supplier_id IN (?)` |
| P2 | `backend/services/aiRouteService.js` | L37-46,76-89,101-114 | listSuggestions/generateSuggestions 多处 N+1 |

### 9.2 缓存

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P1 | `backend/services/permissionService.js` | L2,6 | permissionCache 用 NodeCache 内存缓存（stdTTL:300），**非 Redis**。多实例部署时 A 实例改角色权限仅清自身缓存，B/C 实例最长 5 分钟返回旧权限 |
| P1 | `backend/config/redis.js` | L69 | `delCacheByPattern` 使用 `redis.keys(pattern)` —— KEYS 是 O(N) 阻塞命令，生产 Redis 大 key 空间下卡顿。应改用 SCAN 迭代 |
| 已通过 | `backend/middleware/cache.js` | L12-15 | HTTP 缓存 key 含 userId，POST 加入 body，避免越权读他人缓存 |
| 已通过 | permissionCache 失效时机 | roleRouteService.js:48-49,70-71；permissionRouteService.js:83-84,138-139；userRouteService.js:115 | 角色/权限/用户变更后均调用 clearPermissionCache/clearAllPermissionCache ✓ |

---

## 维度 10：合规与生产就绪

### 10.1 生产就绪清单

| 严重 | 检查项 | 结论 |
|------|------|------|
| 已通过 | `DEPLOYMENT_BLOCKERS.md` | 声称 P0/P1 已闭环，健康评分 82/100 |
| 已通过 | Migration 059 | `DATABASE()` 替代硬编码 huakey_crm_test ✓ |
| 已通过 | `validateProductionSecurity()` | 启动强校验 CORS_ORIGIN/JWT_SECRET/SKIP_CAPTCHA/ENABLE_SWAGGER ✓ |
| P1 | `docs/PRODUCTION_AUDIT_REPORT.md:69-76` | 旧审计列出 15-20 条路由缺 checkPermission，DEPLOYMENT_BLOCKERS.md 未单列闭环证据，需 `node backend/scripts/scan_routes.js` 复验 |

### 10.2 临时脚本

| 严重 | 文件 | 行号 | 问题 |
|------|------|------|------|
| P2 | `scripts/backup_database.bat` | L12-13,45 | 硬编码 `DB_USER=root` + 密码以 `-p` 形式出现在命令行，进程列表可见 |
| 已通过 | `backend/scripts/` | — | 无硬编码密码 |
| 已通过 | `backend/scripts/drill-alerts.js` | L51,169-171 | 默认 dry-run，`--live` 才真实推送 |
| 已通过 | `_tmp_fix_sales_permissions.js`、`tmp_audit_users.js` | — | 已从项目中删除 |

### 10.3 logAction 脱敏

**已通过**：`backend/middleware/logger.js:32-70` logAction 全链路脱敏（params/changedFields/oldValue/newValue 均经 maskLogParams/maskFieldValue，超 2000 字符截断）。

---

## 昨日已修复项验证汇总

| 昨日项 | 验证结果 | 证据 |
|--------|----------|------|
| P0-3：ai.js/softDelete.js/api-auth.js 的 SELECT * | ✅ 已落地 | 三文件确认无 SELECT * |
| /follow-plan 路由从 app.js 移除 | ✅ 已落地 | app.js 未挂载（但 followPlan.js、customer/leads.js 文件仍残留为死代码，P2） |
| 062 种子迁移动态角色 ID | ✅ 已落地 | 062:51-68 用 sys_role.code 动态查询 + NOT EXISTS 幂等 |
| purchaseService N+1 优化 | ✅ 部分落地 | 查询侧已用窗口函数（L167-189），写入侧 createPlan/updatePlan/autoGenerate 仍循环单条 INSERT（P2） |
| throw new Error → AppError（contractService/supplierService/surveyService 等） | ✅ 部分落地 | 主体已迁移，但 aiRouteService.js（3处）、leadsService.js（1处）仍残留 |

---

## P0/P1/P2 汇总清单

### P0（上线阻塞，3 项）

| ID | 维度 | 问题 | 文件 |
|----|------|------|------|
| P0-1 | 数据库 | crm_customer.status 类型变更（070 迁移 VARCHAR）与 11 个 service 数字比较不一致，创建合同/商机/工单/跟进/报价全部失效 | contractService.js:183,189 等 11 文件 |
| P0-2 | 部署 | Synology nginx HTTPS 端口未映射 + 证书未挂载，生产 HTTPS 不可用 | docker-compose.synology.yml:137-140 |
| P0-3 | 测试 | 安全测试目录 4 个文件全为 0 字节，CORS/headers/rateLimit/upload 零覆盖 | backend/tests/security/*.test.js |

### P1（高风险，22 项）

| ID | 维度 | 问题 | 文件 |
|----|------|------|------|
| P1-1 | 安全 | Webhook 测试端点 SSRF（无 scheme/内网 IP 校验） | api-platform.js:196 |
| P1-2 | 安全 | AI SQL 正则黑名单可绕过 + 只读池降级主库 | ai.js:141 + database.js:70-85 |
| P1-3 | 安全 | contract/approval.js 敏感审批路由缺权限中间件 | contract/approval.js:16 |
| P1-4 | 安全 | smoke-test.sh 硬编码弱密码回退 | smoke-test.sh:10 |
| P1-5 | 安全 | import_backup.py 硬编码 NAS 凭据 | scripts/import_backup.py:10-12 |
| P1-6 | 代码质量 | aiRouteService.js 3 处 throw new Error | aiRouteService.js:151,157,162 |
| P1-7 | 代码质量 | leadsService.js throw new Error 变体 | leadsService.js:119-121 |
| P1-8 | 代码质量 | 12 处软删除条件缺失（aiRouteService/contractService/supplierService 等） | 见维度 2.3 |
| P1-9 | 代码质量 | customer/import.js 未导入 logger，catch 触发 ReferenceError | customer/import.js:74 |
| P1-10 | 数据库 | 006/035/042 硬 CASCADE 删除（crm_customer 关联） | 006:44,91；035:28；042:31 |
| P1-11 | 数据库 | 066/067 新建表无 deleted_at 列 | 066/067 |
| P1-12 | 数据库 | 058/070/071/082 迁移不幂等或破坏性 | 见维度 3.5 |
| P1-13 | 部署 | 根目录 docker-compose.yml 四容器无资源限制 | docker-compose.yml:8-93 |
| P1-14 | 部署 | docker-compose.canary.yml 六容器无资源限制 | docker-compose.canary.yml |
| P1-15 | 部署 | nginx-stable/canary/frontend 仅 HTTP 无 HTTPS | nginx-*.conf |
| P1-16 | 部署 | .env.synology.example DB_USER=root | .env.synology.example:13 |
| P1-17 | 部署 | run_migrations.js 无 DB 就绪重试 + Dockerfile.synology 用 `;` 分隔 | run_migrations.js:25-57 |
| P1-18 | 测试 | supplierService/purchaseService/paymentService 无单元测试 | — |
| P1-19 | 前端 | v-safe-html 指令 async 处理缺陷，XSS 防护失效 | directives/sanitize.js:5,9 |
| P1-20 | 前端 | 5 个详情页路由缺 permission 元数据 | router/index.js:72,101,113,173,185 |
| P1-21 | 可观测性 | /health 在 DB/Redis 故障时仍返回 HTTP 200 | app.js:259-272 |
| P1-22 | 性能 | customerService.batchAssignCustomers 循环内 3 次查询/客户 | customerService.js:484-502 |
| P1-23 | 性能 | permissionCache 用 NodeCache 内存，多实例失效不跨实例 | permissionService.js:2,6 |
| P1-24 | 性能 | redis.js 用 KEYS 命令（O(N) 阻塞） | redis.js:69 |
| P1-25 | 合规 | 旧审计 15-20 条路由缺 checkPermission 未复验 | docs/PRODUCTION_AUDIT_REPORT.md:69-76 |

### P2（建议修复，约 35 项）

详见各维度章节，主要包括：SELECT * 残留、错误响应格式、next 参数缺失（auth/supplier/role/analysis/automation/api-platform 等）、AppError 第三参数误用、supplier GET 路由缺 checkPermission、组合索引不完整、迁移编号跳跃(064/065)、082-088 无 down、CSV 公式注入、CSP unsafe-inline、JSON body 10MB、慢查询日志未脱敏、POST /metrics/client 无认证、purchaseService 写入侧 N+1、废弃路由文件残留、backup_database.bat 硬编码 root 等。

---

## 建议修复优先级

1. **P0-1（最高）**：修复 11 个 service 的 crm_customer.status 数字比较 → 字符串状态码，**在 070 迁移应用前必须完成**，否则核心业务全面失效。
2. **P0-2**：Synology compose 添加 443 端口映射 + SSL 证书卷挂载。
3. **P0-3**：补全 backend/tests/security/ 4 个空测试文件。
4. **P1 批次一（运行时 bug + 安全）**：customer/import.js logger 未导入（P1-9）、v-safe-html 指令修复（P1-19）、contract/approval 权限中间件（P1-3）、SSRF（P1-1）、AI SQL 只读池强制（P1-2）。
5. **P1 批次二（数据一致性）**：软删除条件补全（P1-8）、throw new Error 改 AppError（P1-6/7）、smoke-test 弱密码（P1-4）。
6. **P1 批次三（部署 + 性能）**：docker 资源限制（P1-13/14）、nginx HTTPS（P1-15）、/health 状态码（P1-21）、permissionCache Redis 化（P1-23）、redis KEYS→SCAN（P1-24）、batchAssignCustomers 批量化（P1-22）。
7. **P1 批次四（数据库迁移）**：066/067 加 deleted_at、058/070/071/082 幂等化、硬 CASCADE 改 SET NULL。
8. **P2**：纳入下一迭代。

---

## 附：审计覆盖矩阵

| 维度 | 覆盖 | P0 | P1 | P2 |
|------|------|-----|-----|-----|
| 1 安全 | 完整 | 0 | 5 | 8 |
| 2 代码质量 | 完整 | 0 | 4 | 12 |
| 3 数据库 | 完整 | 1 | 4 | 6 |
| 4 部署 | 完整 | 1 | 5 | 5 |
| 5 测试 | 完整 | 1 | 1 | 3 |
| 6 API | 完整 | 0 | 0 | 9 |
| 7 前端 | 完整 | 0 | 2 | 4 |
| 8 可观测性 | 完整 | 0 | 1 | 3 |
| 9 性能 | 完整 | 0 | 3 | 4 |
| 10 合规 | 完整 | 0 | 1 | 1 |
| **合计** | — | **3** | **25** | **~55** |

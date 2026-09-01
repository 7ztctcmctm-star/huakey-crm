# CLAUDE.md

## 项目概述

铧旗CRM — 企业级客户关系管理系统，面向外贸/制造企业的销售全流程管理。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 (`<script setup>` Composition API) + Vite 7 + Element Plus 2.5 |
| 路由 | Vue Router 4 (history mode) |
| HTTP | axios (封装在 `@/utils/request`，自动注入 token) |
| 后端 | Express 4.x (端口 5000) |
| 数据库 | MySQL 8.0 via mysql2/promise (连接池 + 可选只读池) |
| 缓存 | Redis (可选，`REDIS_ENABLED` 控制) |
| 认证 | JWT (jsonwebtoken) + bcryptjs，7天过期，token 黑名单 |
| 校验 | Joi (路由级 schema 校验) |
| 日志 | winston (JSON 每日轮转) |
| 部署 | Docker Compose 群晖 NAS (MySQL + Redis + App + Nginx) |

## 目录结构

```
huakey-crm/
├── backend/
│   ├── app.js                     # Express 入口：中间件链 + 路由挂载
│   ├── config/
│   │   ├── database.js            # mysql2 连接池 (主库50/20 + 只读池)
│   │   ├── redis.js               # ioredis 客户端 (可选)
│   │   ├── roles.js               # 角色常量 (ADMIN_ROLE_CODES)
│   │   ├── logger.js              # winston 日志配置
│   │   ├── metrics.js             # Prometheus 指标 (Counter/Histogram/Gauge)
│   │   ├── slowQuery.js           # 慢查询拦截 (>1s 告警)
│   │   ├── swagger.js             # OpenAPI 文档 (/api/docs)
│   │   └── fieldPermissions.js    # 字段级敏感数据控制
│   ├── middleware/
│   │   ├── auth.js                # authenticateToken (JWT + token黑名单 + 实时权限)
│   │   ├── permission.js          # checkPermission + checkDataPermission + checkFieldPermission
│   │   ├── admin.js               # requireAdmin / requireManager
│   │   ├── validate.js            # Joi schema 校验
│   │   ├── errorHandler.js        # appErrorHandler + globalErrorHandler
│   │   ├── rateLimiter.js         # API 限流 (1000/15min per IP)
│   │   ├── responseFormat.js      # 统一 {code, message, data} 包装
│   │   ├── logger.js              # 操作日志自动记录到 sys_log
│   │   ├── traceId.js             # 注入 crypto.randomUUID() → X-Trace-Id
│   │   └── cache.js               # Redis 响应缓存 (cache(ttl))
│   ├── routes/
│   │   ├── auth.js                # 登录/注册/验证码/刷新token
│   │   ├── user.js                # 用户CRUD (含级联删除)
│   │   ├── customer/              # 客户模块 (ModuleRegistry: list/detail/pool/assign/import)
│   │   ├── product/module.js      # 产品模块 (ModuleRegistry)
│   │   ├── report/module.js       # 报表模块 (ModuleRegistry)
│   │   ├── dataManagement/module.js # 数据质量模块 (ModuleRegistry)
│   │   ├── hr.js                  # 员工档案/佣金/组织架构
│   │   ├── followUp.js            # 跟进记录
│   │   ├── opportunity.js         # 商机
│   │   ├── contract.js            # 合同
│   │   ├── quote.js               # 报价
│   │   ├── purchase.js            # 采购 + purchase/request + purchase/comparison
│   │   ├── finance-enhanced.js    # 财务增强
│   │   ├── role.js / dept.js      # 角色/部门
│   │   ├── permission.js          # 权限分配
│   │   └── ...30+ 其他路由
│   ├── services/                  # 业务逻辑层 (65 files，与 routes 对应)
│   ├── core/ModuleRegistry.js     # 模块注册器 (prefix + router 管理)
│   ├── constants/
│   │   ├── customer.js            # 旧版客户状态 (0-5 数值)
│   │   └── customerStatus.js      # 新版客户状态机 (lead→sea→following→...→signed|lost)
│   ├── errors/
│   │   ├── AppError.js            # 结构化业务异常
│   │   └── codes.js               # 错误码枚举 (HTTP_STATUS*1000+序号)
│   ├── cron/scheduler.js          # node-cron 定时任务 (公海回收/逾期提醒/合同到期/供应商评分)
│   └── utils/                     # alert/mask/validator/pagination/softDelete/fieldLog 等
├── frontend/
│   └── src/
│       ├── main.js                # Vue 入口 (Pinia + 4个全局指令 + web-vitals)
│       ├── App.vue                # 根组件 (GlobalErrorBoundary 包裹)
│       ├── router/index.js        # 路由 + permission/admin 守卫
│       ├── utils/request.js       # axios 封装 (token注入/401刷新队列/统一错误处理)
│       ├── api/*.js               # API 函数 (26 modules，对应后端路由)
│       ├── composables/           # useUser(单例)/useTable/useChart/useAssign/...
│       ├── directives/permission.js # v-permission/v-permission-all/v-permission-disabled
│       ├── utils/permission.js    # hasPermission/hasAnyPermission/hasAllPermissions
│       ├── layout/                # Sidebar + HeaderBar (毛玻璃) + AI Chat 侧边栏
│       ├── views/                 # 40+ 功能页面 (按模块分目录)
│       ├── components/            # 公共组件 (AiChat/CustomerFilter/CustomerTable...)
│       └── styles/apple.css       # Apple 设计系统 (CSS 变量 + Element Plus 全覆盖覆写)
├── database/
│   ├── migrations/                # 三位数编号正向迁移 SQL (最新 107，共 105 个)，含对应 _down.sql 回滚脚本
│   ├── migrations/run_migrations.js # 迁移执行器（维护 schema_migrations 版本表，事务包裹）
│   ├── seeds/                     # 种子数据 (test_data_modules.sql)
│   └── backups/                   # 备份目录
├── deploy/
│   ├── docker-compose.prod.yml    # 生产 compose (mysql+redis+app)，密钥经环境变量注入
│   ├── docker-compose.canary.yml / docker-compose.test.yml
│   ├── nginx-synology.conf        # 群晖 Nginx 反代（80→443 TLS）
│   ├── init-complete.sql          # ⚠️ 仅最小基线快照，导入后必须执行迁移补齐结构
│   └── backup/                    # 备份脚本 (mysql-backup.sh / restore-test.sh 等)
├── scripts/                       # Python 运维脚本 (备份导入/数据修复)；NAS 凭据经 config_local.py 读取（gitignore）
└── .env                           # DB/JWT/Redis/CORS/微信通知/验证码 等配置
```

## 请求处理管道

```
请求 → Compression → Helmet(CSP) → TraceId → metrics → CORS → CookieParser → JSON Body →
  → /api/v1 Router → apiLimiter → globalLogMiddleware → responseFormat →
  → 各业务路由（authenticateToken / checkPermission / validate(Joi) 在路由层按需挂载） →
  → Route Handler → Service Layer → Database →
  → appErrorHandler → globalErrorHandler → 响应 {code, message, data}
```

**说明**：
- `authenticateToken`、`checkPermission`、`validate(Joi)` 由各路由文件根据需求自行挂载，不在 `app.js` 中统一挂载；
- `appErrorHandler` 和 `globalErrorHandler` 必须位于所有路由之后，否则无法捕获路由中抛出的错误；
- `apiLimiter` 位于 `/api/v1` Router 内，对 `/api/v1` 下所有接口生效；登录/验证码接口在 `routes/auth.js` 内有独立的限流策略。

## 统一响应格式

```json
{"code": 200, "message": "操作成功", "data": {...}}
```

- `responseFormat` 中间件自动包装非三元组格式的响应
- 前端 axios 返回 `response.data` 直接解构

## 权限模型 (RBAC)

```
sys_user (用户)
  ├── dept_id → sys_dept
  ├── role_id → sys_role (boss/manager/sales/hr/purchaser/finance/engineer)
  └── manager_id → sys_user (直属上级)

sys_role_permission (角色-权限)
  └── permission_id → sys_permission (customer, customer:view, customer:add, ...)

sys_data_permission (数据权限: all/dept_and_sub/dept/self/custom)
```

**三层权限检查**：
1. `authenticateToken` — JWT 验证 + token 黑名单 + 每次请求从 DB 查最新角色基本信息（`role_code`、`view_all`、`manage_all`），不信任 JWT 中的过期值；
2. `checkPermission('code')` — 功能权限，查 `sys_role_permission` + `crm_user_permission`，结果使用 **node-cache 缓存 5 分钟**；
3. `checkDataPermission(module, ownerColumn)` — 数据范围过滤，查 `sys_data_permission`，结果同样使用 **node-cache 缓存 5 分钟**。

**缓存失效**：
- 用户直接权限（`crm_user_permission`）变更时会调用 `clearPermissionCache(userId)` 主动失效该用户缓存；
- 角色权限（`sys_role_permission`）或数据权限（`sys_data_permission`）变更时，目前依赖 5 分钟 TTL 自然过期，未主动清除该角色下所有用户缓存；如需实时生效，应在角色权限保存后调用 `clearAllPermissionCache()`。

**敏感字段** (`config/fieldPermissions.js`)：
- product: `cost_price`
- purchase_item: `unit_price, amount, total_price`
- supplier: `bank_account, tax_id, contact_phone, contact_email`

**角色定义** (`config/roles.js`)：
| code | name | view_all | manage_all | 说明 |
|------|------|----------|------------|------|
| boss | 老板 | YES | YES | 全部权限 |
| manager | 部门经理 | YES | NO | 看全部，管理本部门 |
| sales | 销售人员 | NO | NO | 看客户池，仅编辑自己的 |
| hr | 人力资源 | NO | NO | 查看权限 |
| purchaser | 采购专员 | NO | NO | 采购管理 |
| finance | 财务专员 | YES | NO | 财务查看 |
| engineer | 工程师 | NO | NO | 技术支持 |

`ADMIN_ROLE_CODES = new Set(['super_admin'])` — 只有此角色绕过所有权限检查。

## 客户生命周期状态机

```
线索(5) → 潜客(1) → 正式客户(2) → 流失(3)
                ↓              ↓
         公海池(pool_status=1)  删除(0)
```

新版字符串状态 (`customerStatus.js`)：`lead → sea → following → quoted → negotiating → signed | lost`

## 软删除 + 级联规则

- 所有核心表有 `deleted_at` 列，查询统一 `WHERE deleted_at IS NULL`
- FK 策略: `ON DELETE SET NULL` (保留引用) 或 `ON DELETE CASCADE` (级联删除)
- 删除用户时的事务级联 (最新实现，`services/userRouteService.js`)：
  1. `sys_user` → `status=0, deleted_at=NOW()`
  2. `crm_employee_profile` → `leave_date=CURDATE()` (自动离职)
  3. `crm_customer WHERE owner_id=?` → `owner_id=NULL, pool_status=1` (释放到公海)
  4. `crm_opportunity WHERE owner_id=?` → `owner_id=manager_id`（直属上级），无可用上级时 `owner_id=NULL`（待分配）
  5. 跟进记录保留不动 (归属客户，不归属用户)

## 错误处理

**错误码**：`errors/codes.js`，格式 `HTTP_STATUS * 1000 + 序号`：
```
401001 TOKEN_EXPIRED    401004 LOGIN_FAILED       403001 PERMISSION_DENIED
404001 USER_NOT_FOUND   404002 CUSTOMER_NOT_FOUND 400001 VALIDATION_ERROR
400005 BUSINESS_VALIDATION                       500001 INTERNAL_ERROR
```

**两层错误中间件** (`middleware/errorHandler.js`)：
1. `appErrorHandler` — 捕获 AppError + Joi ValidationError → 结构化 JSON
2. `globalErrorHandler` — 兜底，映射 DB 错误 (`ER_DUP_ENTRY`→409)，5xx 触发告警

**告警** (`utils/alert.js`)：企业微信 webhook + 邮件，5 分钟去重，500 错误窗口 ≥10 次触发。

## 关键约定

1. **路由只管路由**，业务逻辑全部在 `services/`
2. **后端 API 前缀**: `/api/v1/` (旧 `/api/` 307 重定向已移除)
3. **权限码命名**: `模块` 或 `模块:操作` (如 `customer`, `customer:view`, `system:user:delete`)
4. **前端 API 函数**: `request.get/post(url, params)` 自动拼接 `/api/v1` 前缀
5. **表单校验**: 后端 Joi schema validate 中间件，前端 Element Plus el-form rules
6. **错误处理**: Service 层统一使用 `AppError(ErrorCodes.XXX, 'msg')`，由 `appErrorHandler` 统一捕获并返回结构化错误码
7. **日志**: winston，所有关键操作带 `traceId` (crypto.randomUUID)
8. **验证码**: `SKIP_CAPTCHA=true` 时用固定验证码 `abcd`
9. **字符集**: 全部 `utf8mb4_unicode_ci`，备份导入注意双重编码问题
10. **双重编码修复**: `UPDATE t SET col = CONVERT(BINARY CONVERT(col USING latin1) USING utf8mb4)`
11. **迁移编号**: 三位数字 `NNN_description.sql`，INSERT IGNORE 幂等执行
12. **模块注册器**: 仅 customer/product/report/data-quality 使用，其余 40+ 路由传统直挂
13. **用户状态**: composable `useUser.js` 单例模式，`verifyAuth()` 有缓存避免重复 `/auth/me` 调用
14. **前端状态**: 认证已迁移为后端 `httpOnly` Cookie（sameSite=strict）+ double-submit CSRF（`X-CSRF-Token`）；`userInfo`/permissions 仅存内存（`useUser.js` 单例），**不落任何 storage**。axios 封装 `request.js` 支持透传第三参 config（如 `responseType: 'blob'`）。
15. **前端权限指令**: `v-permission="'code'"` (任意匹配)、`v-permission:all` (全部匹配)；`v-permission:disabled` 已废弃（零使用，勿再使用）

## 当前分支

`fix/v1.0.1-security-patch` — 安全补丁（强制改密/CSRF/认证迁移）+ 2026-08-18 全项目审计修复（数据权限补齐、API 契约对齐、状态机修复，见 `docs/audit-report-2026-08-18.md`）

---

## 补充约定与项目上下文

> 本章节用于补充核心约定中未覆盖到位的细节，尤其是处于重构期时容易让新成员困惑的部分。建议随项目演进定期更新。

### 1. 客户状态机迁移说明

当前项目处于新旧状态定义过渡期：

| 来源 | 字段/常量 | 说明 | 使用建议 |
|---|---|---|---|
| 旧版数值状态 | `constants/customer.js` | `0=删除,1=潜客,2=正式客户,3=流失,5=线索` | 数据库 `crm_customer.status` 当前仍存储数值，兼容查询时可用 |
| 新版字符串状态机 | `constants/customerStatus.js` | `lead → sea → following → quoted → negotiating → signed \| lost` | 新增业务逻辑优先使用此状态机，避免再扩展旧数值语义 |

**当前策略**：
- 数据库层保留数值 `status`，新版状态机通过常量映射读写；
- 服务端新增代码统一引用 `customerStatus.js`；
- 旧版 `customer.js` 仅用于兼容历史数据，计划随数据迁移逐步下线；
- 状态推进触发点：`followUpService.addFollowUp`（`new/sea → following`）、`quoteService.createQuote`（`following → quoted`）。

### 2. 角色权限澄清

| 角色 | 是否绕过功能权限 | 是否绕过数据权限 | 说明 |
|---|---|---|---|
| `super_admin` | 是 | 是 | 系统超级管理员，仅用于平台级运维 |
| `boss` | 否 | 否（默认看全部） | 仍需经过 `checkPermission` 和 `checkDataPermission`，但数据权限范围通常为 `all` |
| `manager` | 否 | 否 | 数据范围通常为 `dept_and_sub`，可管理本部门成员 |
| `sales` | 否 | 否 | 数据范围通常为 `self`，可查看公海客户 |

**注意**：`ADMIN_ROLE_CODES = new Set(['super_admin'])` 是硬编码的"完全绕过"角色，与 `boss` 不同。新增"全部权限"角色时不要直接等同于 `super_admin`。

### 3. 公海池语义与 `pool_status` 定位

当前重构方向：**以 `owner_id IS NULL` 作为公海/待分配唯一标准**，`pool_status` 降级为只读缓存/兼容字段。

- **新代码**判断公海统一使用 `owner_id IS NULL`；
- `pool_status` 仍保留，用于：
  - 兼容旧接口和旧报表；
  - 作为冗余索引/缓存，加快部分历史查询；
- 用户删除级联释放客户时，仍写入 `owner_id=NULL, pool_status='sea'`（迁移 097 后为 VARCHAR 枚举），但业务逻辑以 `owner_id` 为准；
- 独立公海池页面 `/customer/pool` 已废弃，相关操作统一到客户列表。

### 4. Service 错误处理规范

统一采用以下优先级：

| 场景 | 推荐方式 | 示例 |
|---|---|---|
| 明确业务校验失败 | `throw new AppError(code, message, statusCode)` | `throw new AppError(400005, '客户不在公海中', 400)` |
| 参数/数据未找到 | `throw new AppError(NOT_FOUND_CODE, ...)` | `throw new AppError(404002, '客户不存在', 404)` |
| 底层/未知异常 | `throw new Error('msg')` 由 `globalErrorHandler` 兜底 | 数据库连接失败、第三方接口异常 |
| 原生 Error 带状态码 | `const e = new Error('msg'); e.statusCode = 400; throw e;` | 仅用于简单校验，逐步迁移到 `AppError` |

**避免**：在 Service 中直接返回 `{ code, message, data }` 三元组，应由中间件统一包装。

### 5. 本地开发工作流

```bash
# 1. 安装依赖
cd frontend && npm install
cd ../backend && npm install

# 2. 配置环境变量
cp .env.example .env   # 根据实际情况修改 DB/JWT/Redis 配置

# 3. 初始化数据库
# 方式 A：完整导入
mysql -u root -p huakey_crm < deploy/init-complete.sql
# 方式 B：按版本表执行迁移（幂等，已执行的会自动跳过）
cd database/migrations && node run_migrations.js

# 4. 启动后端
cd backend && npm run dev   # nodemon，监听 5000 端口

# 5. 启动前端
cd frontend && npm run dev  # Vite，默认 5173
```

**常用命令**：
- 查看迁移列表：`ls database/migrations | sort`
- 查看最新迁移编号：`ls database/migrations | tail -n 1`
- 运行单条迁移：`mysql -u root -p huakey_crm < database/migrations/073_unify_pool_owner_id.sql`

### 6. 测试约定

当前项目测试覆盖较轻，约定如下：

- 新增 Service 层复杂逻辑建议补单元测试（`backend/tests/`）；
- 新增接口建议补接口测试（可用 `supertest` + 测试数据库）；
- 前端核心交互组件建议补组件测试（Vitest + Vue Test Utils）；
- 运行测试：`npm test`（前后端分别执行）；
- 测试数据库使用独立 schema，避免污染开发数据。

### 7. Git 工作流

- **主分支**：`main`（生产）
- **开发分支**：`develop`
- **特性分支**：`feature/<模块>-<简述>`，例如 `feature/customer-pool-unify`
- **修复分支**：`fix/<问题简述>`
- **重构分支**：`refactor/<范围>`，例如当前 `refactor/customer-module-template`

**提交信息**：建议遵循 Conventional Commits，例如：
- `feat(customer): 统一公海池与客户列表`
- `fix(follow-up): 跟进后未自动推进客户状态`
- `docs(claude): 补充项目上下文约定`

### 8. API 版本演进策略

- 当前前缀：`/api/v1/`
- 旧前缀 `/api/` 的 307 重定向**已移除**（2026-08-18 审计确认）；
- 新增破坏性变更时，优先通过新增字段/参数保持兼容，避免随意升级到 `v2`；
- 若必须大版本升级，新建 `routes/v2/` 目录，并在 `app.js` 中挂载 `/api/v2/`。

### 9. ModuleRegistry 与传统路由

当前项目存在两种路由组织方式：

| 方式 | 使用模块 | 特点 |
|---|---|---|
| `ModuleRegistry` | `customer`、`product`、`report`、`dataManagement` | 统一前缀、统一权限校验、便于批量注册 |
| 传统直挂 | 其余 40+ 路由 | 简单直接，但中间件/权限校验分散 |

**建议**：
- 新模块优先使用 `ModuleRegistry`，除非特别简单；
- 老模块逐步迁移，但不要一次性全量重构，避免引入回归风险；
- 无论哪种方式，权限校验、参数校验、响应格式化统一由中间件处理。

### 10. 数据权限配置

数据权限存储在 `sys_data_permission`，通过 `data_scope` 字段控制：

| data_scope | 含义 | SQL 拼接规则 |
|---|---|---|
| `all` | 全部数据 | 不追加 owner/dept 条件 |
| `dept_and_sub` | 本部门及子部门 | `dept_id IN (当前部门及子部门)` |
| `dept` | 仅本部门 | `dept_id = 当前部门` |
| `self` | 仅自己 | `owner_id = 当前用户` |
| `custom` | 自定义规则 | 读取 `sys_data_permission` 关联规则表动态拼接 |

**注意**：`custom` 目前使用较少，新增自定义规则需同步更新 `checkDataPermission` 中间件。

### 11. 缓存策略

Redis 通过 `REDIS_ENABLED` 控制启用，当前使用场景：

| 场景 | 缓存键 | TTL | 失效策略 |
|---|---|---|---|
| 权限码缓存 | `permissions:{roleId}` | 5 分钟 | 角色权限变更时主动失效 |
| 响应缓存 | 由 `cache(ttl)` 中间件指定 | 按需 | 数据变更时手动失效或等待过期 |
| 限流计数 | `rate_limit:{ip}` | 15 分钟 | 自然过期 |

**最佳实践**：
- 写操作后主动失效相关缓存，避免脏读；
- 关键业务数据优先保证一致性，不盲目加缓存；
- Redis 未启用时，项目应能降级运行（权限缓存失效回查数据库）。

### 12. 目录索引速查

快速了解项目规模：

```bash
# 后端路由数量
ls backend/routes/**/*.js | wc -l

# 前端页面视图数量
ls frontend/src/views/**/*.vue | wc -l

# 数据库迁移数量
ls database/migrations/*.sql | wc -l

# Service 文件数量
ls backend/services/*.js | wc -l
```

### 13. 常用常量速查

#### 13.1 客户状态映射

**当前状态**：`crm_customer.status` 已通过迁移 `070_unify_customer_status.sql` 从 `TINYINT` 改为 `VARCHAR(32)`，直接存储字符串状态码。旧数值备份在 `old_status_int` 字段中。

| 旧数值（`old_status_int`） | 新字符串状态码 | 含义 | 说明 |
|---|---|---|---|
| `0` | — | 已删除 | 软删除标记，不参与业务状态机 |
| `1` | `following` | 跟进中 | 旧版"潜客"统一映射为 following |
| `2` | `signed` | 已签约 | 旧版"正式客户"映射为 signed |
| `3` | `lost` | 已流失 | 旧版"流失"映射为 lost |
| `5` | `following` | 跟进中 | 旧版"线索"统一映射为 following |

**动态配置表**：`sys_customer_status` 存储当前有效状态码，`sys_customer_status_transition` 存储允许的状态流转规则。新增/调整状态应通过这两张表配置，而不是修改 `customerStatus.js` 硬编码。

**常用状态码速查**：

| 状态码 | 含义 | 是否终态 |
|---|---|---|
| `sea` | 公海客户 | 否 |
| `following` | 跟进中 | 否 |
| `quoted` | 已报价 | 否 |
| `negotiating` | 谈判中 | 否 |
| `signed` | 已签约 | 是 |
| `lost` | 已流失 | 是 |
| `paused` | 暂停跟进 | 否 |

#### 13.2 高频权限码

| 权限码 | 说明 |
|---|---|
| `customer` | 客户模块访问 |
| `customer:view` | 查看客户详情 |
| `customer:add` | 新增客户 |
| `customer:edit` | 编辑客户 |
| `customer:delete` | 删除客户 |
| `customer:pool` | 公海池操作（认领/释放） |
| `customer:assign` | 客户分配 |
| `system:user` | 用户管理 |
| `system:role` | 角色管理 |

### 14. 敏感字段权限

当前敏感字段列表：

| 模块 | 字段 |
|---|---|
| 产品 | `cost_price` |
| 采购项 | `unit_price`、`amount`、`total_price` |
| 供应商 | `bank_account`、`tax_id`、`contact_phone`、`contact_email` |

**端到端流程**：
1. 后端 `fieldPermissions.js` 定义字段与角色可见性；
2. `checkFieldPermission` 中间件对查询结果脱敏；
3. 前端列表/详情/导出统一按后端返回的可见性渲染；
4. 导出/报表场景下，敏感字段默认脱敏为 `*` 或隐藏。

**新增敏感字段**：在 `backend/config/fieldPermissions.js` 中注册，并同步更新前端展示逻辑。

### 15. 部署与回滚

#### 15.1 发布流程

1. 在 `main` 分支打标签：`git tag v1.x.x`；
2. **发布前备份数据库**；
3. 执行新增数据库迁移（幂等，已执行的会自动跳过）：`cd database/migrations && node run_migrations.js`；
4. 部署后端：`npm install && pm2 restart app`（或 Docker Compose 重启 app 容器）；
5. 部署前端：`npm run build`，将 `dist/` 同步到 Nginx 静态目录；
6. 验证 `/api/health` 健康检查接口。

#### 15.2 回滚策略

- **代码回滚**：`git checkout <上一个稳定标签>` 后重新部署；
- **数据库回滚**：优先使用对应迁移的 `_down.sql` 脚本，若无则手动编写回滚 SQL；
- **配置回滚**：保留 `.env` 备份，修改前复制为 `.env.bak`。

### 16. 告警与监控

| 监控项 | 实现 | 说明 |
|---|---|---|
| 应用指标 | `config/metrics.js` | Prometheus `/metrics` 端点 |
| 慢查询 | `config/slowQuery.js` | >1s 记录 warn 日志 |
| 错误告警 | `utils/alert.js` | 企业微信 webhook + 邮件，5 分钟去重 |
| 错误窗口告警 | `globalErrorHandler` | 500 错误窗口 ≥10 次触发 |

**日志查询**：
- 本地开发：`backend/logs/app-YYYY-MM-DD.log`
- 生产：挂载到群晖目录或接入 ELK/Loki

### 17. 当前重点重构上下文

> 记录进行中的重大变更，避免上下文丢失。

#### 17.1 公海池（独立路由回归版）

- **现状（2026-08 更新）**：公海池以独立路由回归，**并非废弃**：
  - `frontend/src/views/pool/List.vue` + 路由 `/pool` + 侧边栏"公海池"菜单（`pool:view` 权限码）
  - `backend/routes/pool.js`：`POST /pool`（公海列表）、`POST /pool/claim`（认领，`pool:claim`）、`POST /pool/release`（释放）
  - 权限码 `pool:view` / `pool:claim` / `customer:release` 由迁移 098 定义
- **核心语义**：`owner_id IS NULL` 为公海唯一标准（兼容旧 `pool_status` 字段）；`pool_status` 迁移 097 后为 `VARCHAR(8)` 枚举（`private`/`sea`）
- 旧端点 `POST /api/v1/customer/pool-list`、`/customer/claim-pool`、`/customer/release-to-pool` 保留兼容，内部调用同一 controller

#### 17.2 跟进驱动客户状态与自动回收

- **目标**：让跟进记录驱动客户状态变化，并建立逾期未跟进自动提醒/回收规则；
- **核心触发点（2026-08-18 修复后）**：
  - 跟进创建：`lead / sea / 旧版 new → following`（`followUpService.js`，`advance_status=false` 可手动覆盖）；
  - 报价创建：`following → quoted`；
  - 每次跟进更新 `last_follow_time`；
- **自动化规则**：
  - 下次跟进前 1 天、当天提醒负责人；
  - `following` 状态超过 N 天未跟进进入"即将回收"预警；
  - 超过 M 天（M > N）未跟进自动释放到公海；
  - 释放前 1 天通知负责人；
- **相关文件**：
  - `backend/services/followUpService.js`
  - `backend/services/quoteService.js`
  - `backend/cron/cronService.js`
  - `database/migrations/072_prompt3_scoring_rule.sql`

> **⚠️ 领域边界（重要）**：按 `docs/customer-center-freeze-v1.md`，**报价/商机/合同模块不得自动修改 `crm_customer` 状态**（`quoteService.createQuote` 中原来的 `following → quoted` 联动已于 2026-08-04 移除，`quoteService.test.js` 有守护测试）。客户状态推进只能由客户中心模块（`customerService`/跟进模块）或用户在客户详情页手动触发。**不要恢复该联动。**

#### 17.3 待补充

- [x] 完成新版字符串状态机与数据库数值的映射（已补充到 CLAUDE.md 13.1）；
- [ ] 完成客户详情页行动卡（下次跟进时间/逾期天数/最近跟进摘要）；
- [ ] 完成 `crm_scoring_rule` 表与供应商评分任务的联调。

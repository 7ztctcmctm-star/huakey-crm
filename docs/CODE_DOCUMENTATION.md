# 📖 铧旗 CRM 系统 — 标准化代码文档

> **生成时间**: 2026-08-08 14:54  
> **文档版本**: v1.1（v1.1 补充核心服务层文档）  
> **面向读者**: 开发工程师、技术主管、新成员接手  
> **覆盖范围**: 后端中间件 / 服务层 / 配置层 / 工具层 / 常量 / 错误处理  
> **维护规则**: 代码迭代后同步更新本文档对应章节

---

## 目录

- [1. 系统架构总览](#1-系统架构总览)
- [2. 后端目录结构](#2-后端目录结构)
- [3. 中间件层 (Middleware)](#3-中间件层-middleware)
  - [3.1 认证中间件 auth.js](#31-认证中间件-authjs)
  - [3.2 权限中间件 permission.js](#32-权限中间件-permissionjs)
  - [3.3 错误处理中间件 errorHandler.js](#33-错误处理中间件-errorhandlerjs)
  - [3.4 限流中间件 rateLimiter.js](#34-限流中间件-ratelimiterjs)
  - [3.5 操作日志中间件 logger.js](#35-操作日志中间件-loggerjs)
  - [3.6 参数校验中间件 validate.js](#36-参数校验中间件-validatejs)
  - [3.7 缓存中间件 cache.js](#37-缓存中间件-cachejs)
  - [3.8 响应格式中间件 responseFormat.js](#38-响应格式中间件-responseformatjs)
  - [3.9 链路追踪中间件 traceId.js](#39-链路追踪中间件-traceidjs)
  - [3.10 CSRF 防护中间件 csrf.js](#310-csrf-防护中间件-csrfjs)
- [4. 配置层 (Config)](#4-配置层-config)
  - [4.1 数据库配置 database.js](#41-数据库配置-databasejs)
  - [4.2 Redis 配置 redis.js](#42-redis-配置-redisjs)
  - [4.3 角色常量 roles.js](#43-角色常量-rolesjs)
- [5. 错误处理体系 (Errors)](#5-错误处理体系-errors)
  - [5.1 AppError 统一异常类](#51-apperror-统一异常类)
  - [5.2 ErrorCodes 错误码枚举](#52-errorcodes-错误码枚举)
- [6. 工具层 (Utils)](#6-工具层-utils)
  - [6.1 分页查询 pagination.js](#61-分页查询-paginationjs)
  - [6.2 统一响应 response.js](#62-统一响应-responsejs)
  - [6.3 告警工具 alert.js](#63-告警工具-alertjs)
  - [6.4 软删除工具 softDelete.js](#64-软删除工具-softdeletejs)
  - [6.5 SSE 管理器 sseManager.js](#65-sse-管理器-ssemanagerjs)
  - [6.6 数据验证器 validator.js](#66-数据验证器-validatorjs)
  - [6.7 数据脱敏工具 mask.js](#67-数据脱敏工具-maskjs)
  - [6.8 LLM 客户端 llmClient.js](#68-llm-客户端-llmclientjs)
  - [6.9 通知工具 notification.js](#69-通知工具-notificationjs)
  - [6.10 系统配置工具 config.js](#610-系统配置工具-configjs)
  - [6.11 CSV 安全导出 csvExport.js](#611-csv-安全导出-csvexportjs)
  - [6.12 数据清洗工具 dataCleaner.js](#612-数据清洗工具-datacleanerjs)
  - [6.13 字段变更日志 fieldLog.js](#613-字段变更日志-fieldlogjs)
  - [6.14 供应商资质提醒 qualification-reminder.js](#614-供应商资质提醒-qualification-reminderjs)
  - [6.15 查询辅助工具 queryHelper.js](#615-查询辅助工具-queryhelperjs)
  - [6.16 批量任务队列 queue.js](#616-批量任务队列-queuejs)
  - [6.17 供应商评分入口 scoring.js](#617-供应商评分入口-scoringjs)
  - [6.18 Supabase 存储客户端 supabaseStorage.js](#618-supabase-存储客户端-supabasestoragejs)
- [7. 常量层 (Constants)](#7-常量层-constants)
  - [7.1 客户状态 customerStatus.js](#71-客户状态-customerstatusjs)
  - [7.2 池状态 poolStatus.js](#72-池状态-poolstatusjs)
- [8. 核心层 (Core)](#8-核心层-core)
  - [8.1 模块注册器 ModuleRegistry.js](#81-模块注册器-moduleregistryjs)
- [9. 服务层 (Services) — 核心](#9-服务层-services--核心)
  - [9.1 认证服务 authService.js](#91-认证服务-authservicejs)
  - [9.2 客户服务 customerService.js](#92-客户服务-customerservicejs)
- [10. 路由层 (Routes) — 核心](#10-路由层-routes--核心)
  - [10.1 认证路由 auth.js](#101-认证路由-authjs)
  - [10.2 客户中心三页面路由](#102-客户中心三页面路由)
  - [10.3 商机路由 opportunity.js](#103-商机路由-opportunityjs)
  - [10.4 报价路由 quote.js](#104-报价路由-quotejs)
  - [10.5 合同路由 contract/](#105-合同路由-contract)
  - [10.6 跟进路由 followUp.js](#106-跟进路由-followupjs)
  - [10.7 回收站路由 recycle.js](#107-回收站路由-recyclejs)
  - [10.8 标签路由 tag.js](#108-标签路由-tagjs)
  - [10.9 合同模板路由 contractTemplate.js](#109-合同模板路由-contracttemplatejs)
  - [10.10 全部路由挂载清单](#1010-全部路由挂载清单)
- [10b. 控制器层 (Controllers)](#10b-控制器层-controllers)
  - [10b.1 客户控制器 customerController.js](#10b1-客户控制器-customercontrollerjs)
  - [10b.2 商机控制器 opportunityController.js](#10b2-商机控制器-opportunitycontrollerjs)
  - [10b.3 报价控制器 quoteController.js](#10b3-报价控制器-quotecontrollerjs)
  - [10b.4 合同控制器 contractController.js](#10b4-合同控制器-contractcontrollerjs)
- [11b. 前端详细文档（P3 批量）](#11b-前端详细文档p3-批量)
  - [11b.1 API 请求层 — 大型模块](#11b1-api-请求层--大型模块)
  - [11b.2 API 请求层 — 中型模块](#11b2-api-请求层--中型模块)
  - [11b.3 API 请求层 — 小型模块](#11b3-api-请求层--小型模块)
  - [11b.4 前端基础设施](#11b4-前端基础设施)
  - [11b.5 Composables 剩余](#11b5-composables-剩余)
- [12b. 脚本工具文档（P3）](#12b-脚本工具文档p3)
- [11. 前端架构概览](#11-前端架构概览)
- [12. API 响应格式规范](#12-api-响应格式规范)
- [13. 文档覆盖率报告](#13-文档覆盖率报告)
- [14. 维护与更新指南](#14-维护与更新指南)

---

## 1. 系统架构总览

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│   Nginx      │────▶│  Express App │
│  (Vue 3 SPA) │     │  (反向代理)   │     │  (Node.js)   │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                   │
                           ┌───────────────────────┼───────────────────────┐
                           │                       │                       │
                    ┌──────▼──────┐         ┌──────▼──────┐        ┌──────▼──────┐
                    │   MySQL 8.0 │         │  Redis 7    │        │  WeChat     │
                    │  (主数据库)   │         │  (可选缓存)  │        │  Webhook    │
                    └─────────────┘         └─────────────┘        └─────────────┘
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Element Plus + ECharts + Pinia |
| 后端 | Node.js + Express 4 + mysql2/promise + Joi |
| 数据库 | MySQL 8.0 (utf8mb4) |
| 缓存 | Redis 7 (ioredis，可选，降级安全) |
| 认证 | JWT (jsonwebtoken + bcryptjs) + httpOnly Cookie |
| 安全 | CSRF double-submit + 限流 + 字段级权限 |
| 定时任务 | node-cron |
| 文件存储 | Supabase Storage / 本地磁盘 |
| 部署 | Docker + Container Manager (NAS) |
| AI | Ollama (qwen2.5:3b，Text-to-SQL) |

---

## 2. 后端目录结构

```
backend/
├── config/            # 配置层
│   ├── database.js    # MySQL 连接池（主库 + 只读库）
│   ├── redis.js       # Redis 连接 + 缓存工具函数
│   ├── roles.js       # 角色常量定义
│   ├── logger.js      # Winston 日志配置
│   └── fieldPermissions.js  # 字段级敏感字段注册表
├── constants/         # 业务常量
│   ├── customerStatus.js    # 客户状态枚举
│   ├── poolStatus.js        # 池状态枚举
│   └── customer.js          # 客户常量
├── controllers/       # 控制器层（少量，主要在路由层）
│   ├── contractController.js
│   ├── customerController.js
│   ├── opportunityController.js
│   └── quoteController.js
├── core/              # 核心框架
│   └── ModuleRegistry.js    # 模块注册器
├── errors/            # 错误处理
│   ├── AppError.js    # 统一业务异常类
│   └── codes.js       # 错误码枚举
├── middleware/        # 中间件层
│   ├── auth.js        # JWT 认证
│   ├── permission.js  # 功能权限 + 数据权限 + 字段权限
│   ├── errorHandler.js # 全局错误处理
│   ├── rateLimiter.js # 限流
│   ├── logger.js      # 操作日志
│   ├── validate.js    # Joi 参数校验
│   ├── cache.js       # Redis 缓存
│   ├── responseFormat.js # 响应格式统一
│   ├── traceId.js     # 链路追踪
│   ├── csrf.js        # CSRF 防护
│   ├── admin.js       # 管理员校验
│   └── api-auth.js    # API Key 认证
├── routes/            # 路由层（50+ 文件）
│   ├── auth.js        # 认证路由
│   ├── customers.js   # 客户路由
│   ├── ...
├── services/          # 服务层（65+ 文件）
│   ├── authService.js
│   ├── customerService.js
│   ├── ...
├── utils/             # 工具层
│   ├── pagination.js  # 分页查询
│   ├── response.js    # 响应工具
│   ├── alert.js       # 告警
│   ├── softDelete.js  # 软删除
│   ├── sseManager.js  # SSE 推送
│   ├── validator.js   # 数据验证器
│   ├── mask.js        # 数据脱敏
│   ├── llmClient.js   # AI/LLM 客户端
│   ├── notification.js # 通知（企业微信/邮件）
│   ├── csvExport.js   # CSV 导出
│   ├── queryHelper.js # 查询助手
│   ├── queue.js       # 任务队列
│   ├── fieldLog.js    # 字段变更日志
│   ├── config.js      # 系统配置工具
│   ├── dataCleaner.js # 数据清洗
│   ├── scoring.js     # 评分工具
│   ├── supabaseStorage.js # Supabase 存储
│   ├── qualification-reminder.js # 资格提醒
│   └── perfume.js     # 性能监控
├── workers/           # 后台任务
│   └── batchWorker.js # 批处理 Worker
├── cron/              # 定时任务
│   └── cronJobs.js
├── tools/             # 工具脚本
├── tests/             # 测试套件
└── api/               # API 平台
```

---

## 3. 中间件层 (Middleware)

### 3.1 认证中间件 auth.js

**文件路径**: `backend/middleware/auth.js`  
**负责人**: 系统架构  
**依赖**: `jsonwebtoken`, `crypto`, `../config/database`, `../config/logger`, `../config/roles`

#### 模块概述

JWT 认证中间件，负责请求身份验证、Token 黑名单检查、角色权限实时查询。认证令牌通过 httpOnly Cookie 或 Authorization Header 传递。

#### API

##### `getTokenFromRequest(req)`

从请求中提取 Token，优先级：Cookie > Authorization Header。禁止 URL query 传参。

| 参数 | 类型 | 说明 |
|------|------|------|
| `req` | `Request` | Express 请求对象 |
| **返回** | `string\|null` | Token 字符串或 null |

##### `authenticateToken(req, res, next)`

JWT 认证中间件，验证流程：
1. 提取 Token（Cookie / Bearer Header）
2. `jwt.verify` 校验签名与有效期
3. 检查 Token 黑名单（`sys_token_blacklist` 表，SHA-256 哈希比对）
4. 从 DB 查询最新角色权限（`sys_role`），不依赖 JWT payload 中的过期值
5. 查询用户 `must_change_password` 状态，首次登录强制改密
6. 注入 `req.user`：`{ userId, username, roleId, roleCode, viewAll, manageAll, mustChangePassword }`

**错误响应**:

| HTTP | Code | 场景 |
|------|------|------|
| 401 | 401 | 未提供 Token / Token 过期 / Token 无效 / Token 已黑名单 |
| 403 | 403 | 需强制修改密码 |
| 500 | 500 | DB 查询失败 |

##### `generateToken(user)`

签发 JWT Token。

| 参数 | 类型 | 说明 |
|------|------|------|
| `user.id` | `number` | 用户 ID |
| `user.username` | `string` | 用户名 |
| `user.role_id` | `number` | 角色 ID |
| `user.role_code` | `string` | 角色 code |
| `user.view_all` | `number` | 全局查看权限 (0/1) |
| `user.manage_all` | `number` | 全局管理权限 (0/1) |
| **返回** | `string` | JWT Token（有效期 7d，由 `JWT_EXPIRES_IN` 控制） |

#### 安全设计

- Token 传递仅限 Cookie 和 Authorization Header，**禁止 URL query**
- Token 黑名单：登出时将 SHA-256 哈希写入 `sys_token_blacklist`，过期后自动清理
- 角色权限实时查询：不依赖 JWT payload 中的值，每次请求从 DB 获取最新权限
- 强制改密：`must_change_password = 1` 时仅允许访问 `/auth/force-change-password`、`/auth/logout`、`/auth/me`、`/auth/refresh`

---

### 3.2 权限中间件 permission.js

**文件路径**: `backend/middleware/permission.js`  
**依赖**: `../config/database`, `../services/permissionService`, `../config/roles`

#### 模块概述

三级权限体系中间件：功能权限（操作级）+ 数据权限（行级）+ 字段权限（列级）。

##### `checkPermission(permissionCodes)`

功能权限检查中间件。

| 参数 | 类型 | 说明 |
|------|------|------|
| `permissionCodes` | `string\|string[]` | 权限编码或编码数组（OR 语义） |

**逻辑**:
1. 超管（`super_admin`）或 `manageAll` 角色直接通过，记录审计日志
2. 调用 `getUserPermissions()` 获取用户权限列表（带缓存）
3. 检查权限码是否命中（任一命中即通过）
4. 不命中返回 403

##### `checkDataPermission(module, ownerColumn)`

数据权限检查中间件，注入 `req.dataPermission`。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `module` | `string` | — | 模块名称 |
| `ownerColumn` | `string` | `'owner_id'` | 负责人列名 |

**数据权限类型**:

| type | 说明 |
|------|------|
| `all` | 全部数据 |
| `dept` | 本部门 |
| `dept_and_sub` | 本部门及子部门 |
| `self` | 仅本人（含未分配的 lead/sea 客户） |
| `custom` | 自定义部门 |

##### `buildDataPermissionWhere(dataPermission, tableAlias)`

根据数据权限构建 SQL WHERE 子句，返回 `{ clause, params }` 使用参数化查询防 SQL 注入。

##### `checkFieldPermission(module)`

字段级权限中间件，通过 `Object.defineProperty` 延迟计算 `req.restrictedFields`。非管理员用户会根据 `fieldPermissions` 注册表获取敏感字段列表。

##### `stripRestrictedFields(data, restrictedFields)`

从响应数据中移除受限字段，支持对象和数组。

---

### 3.3 错误处理中间件 errorHandler.js

**文件路径**: `backend/middleware/errorHandler.js`  
**依赖**: `../errors/AppError`, `../errors/codes`, `../utils/alert`

#### 模块概述

双层错误处理架构：

| 层 | 函数 | 职责 |
|----|------|------|
| 第一层 | `appErrorHandler` | 处理已知错误（AppError + Joi），快速响应终止 |
| 第二层 | `globalErrorHandler` | 兜底未知错误，记日志 + 告警 + 500 响应 |

**DB 错误映射**:

| DB 错误码 | 映射 HTTP | 映射消息 |
|-----------|-----------|----------|
| `ER_DUP_ENTRY` | 409 | 数据重复，请核对后重试 |

**告警策略**:
- 仅 `statusCode >= 500` 触发告警（4xx 是客户端问题，不告警）
- 告警发送到企业微信 + 邮件
- 5 分钟内 500 错误超过 10 次触发阈值告警
- 不向客户端泄露堆栈信息

---

### 3.4 限流中间件 rateLimiter.js

**文件路径**: `backend/middleware/rateLimiter.js`  
**依赖**: `express-rate-limit`, `ioredis`

#### 模块概述

基于 IP + Endpoint 维度的请求限流，支持 Redis 持久化存储（重启后计数不丢失）和内存降级。

##### 预置限流器

| 限流器 | 窗口 | 生产环境上限 | 开发环境上限 | 说明 |
|--------|------|-------------|-------------|------|
| `apiLimiter` | 15 min | 1000 | 1000 | 全局 API 限流，跳过 `/health` |
| `authLimiter` | 15 min | 30 | 1000 | 登录限流 |
| `surveyRespondLimiter` | 15 min | 10 | 100 | 公开调查回复限流（按 IP + campaign_id） |
| `surveyGlobalResponderLimiter` | 1 hour | 20 | 200 | 公开调查全局限流（按 IP） |

##### `createRateLimiter(options)`

创建自定义限流器。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `options.windowMs` | `number` | `900000` | 窗口时间（ms） |
| `options.max` | `number` | `100\|1000` | 窗口内最大请求数 |
| `options.message` | `object` | — | 超限响应消息 |
| `options.skip` | `function` | — | 跳过函数 |

##### `RedisRateLimitStore`

基于 ioredis 的限流存储后端，Key 格式 `ratelimit:{ip}:{endpoint}`，TTL 等于窗口时间。

---

### 3.5 操作日志中间件 logger.js

**文件路径**: `backend/middleware/logger.js`  
**依赖**: `../config/database`, `../utils/mask`

#### 模块概述

统一操作日志记录，支持路由级和全局自动日志。

##### 核心函数

| 函数 | 说明 |
|------|------|
| `logAction({ module, action, method, url, params, ipAddress, userId, userName, description, status, errorMsg, changedFields, oldValue, newValue })` | 写入 `sys_log` 表，支持字段变更日志（old/new 值自动脱敏） |
| `logMiddleware(module)` | 路由级日志中间件，劫持 `res.json` 拦截响应 |
| `globalLogMiddleware(req, res, next)` | 全局自动日志中间件，自动识别模块和操作类型 |
| `createRouteLogger(moduleName)` | 创建路由级日志记录器 |
| `getIpAddress(req)` | 获取客户端 IP（支持 X-Forwarded-For） |
| `extractUserInfo(req)` | 从 `req.user` 提取用户信息 |

##### 数据脱敏

所有日志参数均经过 `maskLogParams()` 脱敏处理，字段变更日志中的 old/new 值按字段名逐个脱敏。

##### 模块映射

URL 路径 `/api/{segment}` 自动映射到模块名称：

| URL Segment | 模块名称 |
|-------------|---------|
| `customer` / `follow-up` | 客户管理 |
| `leads` | 线索管理 |
| `opportunity` | 商机管理 |
| `quote` | 报价管理 |
| `contract` | 合同管理 |
| `service` | 售后服务 |
| `user` | 用户管理 |
| `auth` | 认证管理 |
| `report` | 数据报表 |
| `product` | 产品管理 |
| `supplier` | 供应商管理 |
| `ai` | AI助手 |
| ... | 系统管理（默认） |

---

### 3.6 参数校验中间件 validate.js

**文件路径**: `backend/middleware/validate.js`  
**依赖**: `joi`

##### `validate(schema, source)`

Joi 参数校验中间件。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `schema` | `Joi.Schema` | — | Joi 校验 schema |
| `source` | `string` | `'body'` | 校验来源：`'body'` / `'params'` / `'query'` |

**特性**: `abortEarly: false`（返回所有错误）、`stripUnknown: true`（移除未知字段）、`convert: true`（自动类型转换）。

##### `queryValidate(schema)`

查询参数专用校验，等同于 `validate(schema, 'query')`。

##### `paginationFields`

公共分页字段片段，减少各路由 `listSchema` 重复定义。

```javascript
{
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(20),
  keyword: Joi.string().allow('', null).max(200).default('')
}
```

---

### 3.7 缓存中间件 cache.js

**文件路径**: `backend/middleware/cache.js`  
**依赖**: `../config/redis`

##### `cache(ttl)`

请求缓存中间件，支持 GET 和 POST。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `ttl` | `number` | `300` | 缓存有效期（秒） |

**特性**:
- Redis 不可用时自动降级（直接透传）
- 缓存 Key 包含 `userId`，避免不同权限用户读到他人缓存
- POST 请求将 body 序列化加入 Key
- 仅缓存 `code === 200` 的响应

##### `createCache(ttlSeconds, keyBuilder)`

可自定义缓存 Key 的中间件。

##### `invalidateCache(patterns)`

按模式批量清除缓存（写操作后调用），使用 SCAN 迭代替代 `KEYS` 命令。

---

### 3.8 响应格式中间件 responseFormat.js

**文件路径**: `backend/middleware/responseFormat.js`

统一所有 API 响应为 `{ code, message, data }` 三元组。

- 已符合格式的 body 直接放行
- 非标准格式（裸对象、数组、字符串）自动包装为 `{ code: 200, message: 'success', data: body }`
- `null`/`undefined` body 包装为 `{ code: 200, message: 'success', data: null }`

---

### 3.9 链路追踪中间件 traceId.js

**文件路径**: `backend/middleware/traceId.js`

为每个请求生成 UUID v4 追踪 ID，注入 `req.traceId` 并写入响应头 `X-Trace-Id`。

---

### 3.10 CSRF 防护中间件 csrf.js

**文件路径**: `backend/middleware/csrf.js`

#### 模块概述

Double-submit cookie 模式 CSRF 防护，作为 `sameSite=strict` 之外的纵深防御层。

##### 工作流程

1. GET 请求：若无 `csrf-token` Cookie，生成并设置（非 httpOnly，供前端读取）
2. 非 GET 请求：比对 `X-CSRF-Token` Header 与 Cookie 中的 token
3. 不匹配返回 403

##### 跳过路径

| 路径 | 原因 |
|------|------|
| `/api/v1/auth/login` | 有验证码机制 |
| `/api/v1/auth/refresh` | 有 Token 刷新机制 |
| `/api/v1/auth/logout` | 清除 Cookie |
| `/api/v1/auth/register` | 需管理员认证 |

**测试环境**: `NODE_ENV === 'test'` 时跳过校验，避免集成测试维护 cookie。

---

## 4. 配置层 (Config)

### 4.1 数据库配置 database.js

**文件路径**: `backend/config/database.js`  
**依赖**: `mysql2/promise`, `../utils/alert`

#### 模块概述

MySQL 连接池配置，支持主库 + 只读库分离。

##### 配置项

| 参数 | 环境变量 | 默认值 | 说明 |
|------|---------|--------|------|
| host | `DB_HOST` | `localhost` | 主库地址 |
| port | `DB_PORT` | `3306` | 主库端口 |
| user | `DB_USER` | `root` | 用户名 |
| password | `DB_PASSWORD` | — | 密码 |
| database | `DB_NAME` | `huakey_crm` | 数据库名 |
| connectionLimit | — | `50`（生产）/ `20`（开发） | 连接池大小 |
| queueLimit | — | `50` | 等待队列上限 |
| acquireTimeout | — | `5000` | 获取连接超时 |
| charset | — | `utf8mb4` | 字符集 |

##### 只读连接池

当配置 `DB_RO_HOST` 时创建只读连接池，用于报表、AI 查询、搜索等读操作。未配置时降级使用主库。

##### `queryWithTrace(traceId, sql, params)`

在 SQL 前注入 `/* traceId=xxx */` 注释，便于慢查询分析和链路追踪。

##### 错误处理

连接池 `error` 事件触发企业微信 + 邮件告警。启动时测试连接，失败则退出进程（测试环境除外）。

---

### 4.2 Redis 配置 redis.js

**文件路径**: `backend/config/redis.js`  
**依赖**: `ioredis`, `../utils/alert`

#### 模块概述

Redis 连接与缓存工具函数，支持优雅降级（Redis 不可用时所有缓存函数静默返回，不影响业务）。

##### 配置项

| 参数 | 环境变量 | 默认值 | 说明 |
|------|---------|--------|------|
| enabled | `REDIS_ENABLED` | `false` | 是否启用 |
| host | `REDIS_HOST` | `127.0.0.1` | Redis 地址 |
| port | `REDIS_PORT` | `6379` | Redis 端口 |
| password | `REDIS_PASSWORD` | — | 密码 |

##### 缓存工具函数

| 函数 | 说明 |
|------|------|
| `getCache(key)` | 获取缓存，失败返回 `null` |
| `setCache(key, value, ttl)` | 设置缓存（JSON 序列化 + EX 过期） |
| `delCache(key)` | 删除单个 Key |
| `delCacheByPattern(pattern)` | 按通配符删除（使用 SCAN 非阻塞迭代） |
| `clearByPrefix(prefix)` | 按前缀清除 |
| `_scanKeys(pattern)` | SCAN 迭代获取匹配 Key（替代 `KEYS`） |

##### 降级策略

- `REDIS_ENABLED === 'false'` 时 `redis = null`，所有缓存函数返回 `null`/静默
- 连接错误时打印警告并告警，但不中断服务
- 重试策略：最多 3 次，间隔 `min(times * 200, 2000)` ms

---

### 4.3 角色常量 roles.js

**文件路径**: `backend/config/roles.js`

#### 角色定义

##### 数字 ID（向后兼容，逐步弃用）

| 常量 | 值 | 说明 |
|------|-----|------|
| `ADMIN` | 1 | 系统管理员/老板 |
| `MANAGER` | 2 | 部门经理/总经理 |
| `SALES` | 3 | 销售人员 |
| `HR` | 4 | 人力资源 |
| `PURCHASE` | 5 | 采购专员 |
| `FINANCE` | 6 | 财务专员 |
| `ENGINEER` | 11 | 工程师 |

##### 角色 Code（新标准）

| 常量 | Code | 说明 |
|------|------|------|
| `SUPER_ADMIN` | `'super_admin'` | 超管 |
| `ADMIN` | `'admin'` | 管理员/部门经理 |
| `BOSS` | `'boss'` | 老板 |
| `SALES` | `'sales'` | 销售 |
| `HR` | `'hr'` | 人力 |
| `PURCHASE` | `'purchase'` | 采购 |
| `FINANCE` | `'finance'` | 财务 |
| `ENGINEER` | `'engineer'` | 工程师 |

##### `ADMIN_ROLE_CODES`

超管角色 code 集合（`Set`），仅 `super_admin` 可绕过功能权限检查。

---

## 5. 错误处理体系 (Errors)

### 5.1 AppError 统一异常类

**文件路径**: `backend/errors/AppError.js`

```javascript
class AppError extends Error {
  constructor(errorDef, message, details) {
    super(message || errorDef.message);
    this.name = 'AppError';
    this.code = errorDef.code;
    this.httpStatus = errorDef.httpStatus;
    this.status = errorDef.httpStatus;
    this.details = details || null;
  }
  toJSON() {
    return { code: this.code, message: this.message, data: this.details };
  }
}
```

**使用方式**:
```javascript
throw new AppError(ErrorCodes.LOGIN_FAILED, '用户名或密码错误');
throw new AppError(ErrorCodes.VALIDATION_ERROR, '参数错误', { field: 'username' });
```

---

### 5.2 ErrorCodes 错误码枚举

**文件路径**: `backend/errors/codes.js`  
**格式**: `HTTP_STATUS * 1000 + 自增序号`

| 错误码 | Code | HTTP | 消息 |
|--------|------|------|------|
| `TOKEN_EXPIRED` | 401001 | 401 | Token 已过期 |
| `TOKEN_INVALID` | 401002 | 401 | 无效的 Token |
| `TOKEN_BLACKLISTED` | 401003 | 401 | Token 已失效 |
| `LOGIN_FAILED` | 401004 | 401 | 用户名或密码错误 |
| `PERMISSION_DENIED` | 403001 | 403 | 无操作权限 |
| `USER_NOT_FOUND` | 404001 | 404 | 用户不存在 |
| `CUSTOMER_NOT_FOUND` | 404002 | 404 | 客户不存在 |
| `OPPORTUNITY_NOT_FOUND` | 404003 | 404 | 商机不存在 |
| `CONTRACT_NOT_FOUND` | 404004 | 404 | 合同不存在 |
| `QUOTE_NOT_FOUND` | 404005 | 404 | 报价不存在 |
| `RECORD_NOT_FOUND` | 404006 | 404 | 记录不存在 |
| `VALIDATION_ERROR` | 400001 | 400 | 参数校验失败 |
| `DUPLICATE_USERNAME` | 400002 | 400 | 用户名已存在 |
| `CAPTCHA_EXPIRED` | 400003 | 400 | 验证码已过期 |
| `CAPTCHA_WRONG` | 400004 | 400 | 验证码错误 |
| `BUSINESS_VALIDATION` | 400005 | 400 | 业务校验失败 |
| `INTERNAL_ERROR` | 500001 | 500 | 服务器内部错误 |
| `DB_ERROR` | 500002 | 500 | 数据库错误 |
| `FILE_UPLOAD_FAILED` | 500003 | 500 | 文件上传失败 |

---

## 6. 工具层 (Utils)

### 6.1 分页查询 pagination.js

**文件路径**: `backend/utils/pagination.js`

##### `paginatedQuery(pool, options)`

通用分页查询工具，封装 `COUNT(*) + LIMIT/OFFSET` 模式。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `options.baseQuery` | `string` | — | 列表 SQL（不含 ORDER BY / LIMIT / OFFSET） |
| `options.countQuery` | `string` | — | 计数 SQL |
| `options.params` | `Array` | `[]` | 绑定到两个查询的参数 |
| `options.page` | `number` | `1` | 页码 |
| `options.pageSize` | `number` | `20` | 每页条数 |
| `options.orderBy` | `string` | `'create_time DESC'` | 排序子句 |

**返回**: `{ list, total, page, pageSize }`

---

### 6.2 统一响应 response.js

**文件路径**: `backend/utils/response.js`

| 函数 | 说明 |
|------|------|
| `success(res, data, message)` | 成功响应 `{ code: 200, message, data }` |
| `fail(res, message, code)` | 失败响应（默认 400） |
| `serverError(res, message)` | 服务器错误（500） |
| `notFound(res, message)` | 资源不存在（404） |
| `forbidden(res, message)` | 无权限（403） |

---

### 6.3 告警工具 alert.js

**文件路径**: `backend/utils/alert.js`  
**依赖**: `./notification`

##### `alertError(context)`

发送错误告警到企业微信和邮件。

| 参数 | 类型 | 说明 |
|------|------|------|
| `context.level` | `'error'\|'critical'` | 错误级别 |
| `context.source` | `string` | 错误来源 |
| `context.message` | `string` | 错误详情 |
| `context.traceId` | `string` | 请求追踪 ID |

**防抖**: 同一类错误 5 分钟内只发一次。  
**降级**: 通知发送失败静默处理，不影响业务。  
**阈值告警**: 5 分钟内 500 错误超 10 次触发 `critical` 级别告警。

##### `record500Error()`

记录 500 错误到滑动窗口，达到阈值时触发告警。

---

### 6.4 软删除工具 softDelete.js

**文件路径**: `backend/utils/softDelete.js`

| 函数 | 说明 |
|------|------|
| `softDelete(tableName, id)` | 软删除记录（`deleted_at = NOW()`） |
| `softDeleteBatch(tableName, ids)` | 批量软删除 |
| `restore(tableName, id)` | 恢复软删除 |
| `permanentDelete(tableName, id)` | 彻底删除 |
| `getDeletedList(tableName, options)` | 获取已删除记录列表（分页） |

**安全**: 表名白名单防 SQL 注入，标识符正则校验。

**允许的表**: `crm_customer`, `crm_opportunity`, `crm_contract`, `crm_quote`, `crm_supplier`, `crm_purchase_order`, `crm_service_order`, `crm_product`

---

### 6.5 SSE 管理器 sseManager.js

**文件路径**: `backend/utils/sseManager.js`

单例模式 SSE 连接管理器，按 `userId` 分组管理客户端连接。

| 方法 | 说明 |
|------|------|
| `add(userId, res)` | 添加连接 |
| `remove(userId, res)` | 移除连接 |
| `send(userId, payload)` | 向指定用户推送消息 |
| `broadcast(payload)` | 广播给所有在线用户 |
| `getOnlineCount()` | 获取在线连接数 |

---

### 6.6 数据验证器 validator.js

**文件路径**: `backend/utils/validator.js`

`DataValidator` 类，支持 `required` / `format` / `range` 三种规则类型。

| 方法 | 说明 |
|------|------|
| `validate(record)` | 验证单条记录，返回 `{ valid, errors }` |
| `validateBatch(records)` | 批量验证，返回 `{ validRecords, invalidRecords }` |

### 6.7 数据脱敏工具 mask.js

**文件路径**: `backend/utils/mask.js`

PII（个人身份信息）脱敏工具库，用于日志记录、接口响应中对敏感字段进行自动脱敏。

#### 脱敏函数

| 函数 | 说明 | 示例 |
|------|------|-------|
| `maskPhone(phone)` | 手机号脱敏：前3+****+后4 | `13812345678` → `138****5678` |
| `maskEmail(email)` | 邮箱脱敏：首尾各留1字符 | `test@example.com` → `t***t@example.com` |
| `maskIdCard(idCard)` | 身份证脱敏：前4+**********+后4 | `110101199001011234` → `1101**********1234` |
| `maskBankCard(cardNo)` | 银行卡脱敏：**** **** **** + 后4 | `6222021234561234` → `**** **** **** 1234` |
| `maskBankAccount(account)` | 银行账号脱敏：全 * 除后4位 | `6222021234561234` → `************1234` |
| `maskTaxId(taxId)` | 税号脱敏：前3+*+后3 | `91110108MA01ABC123` → `911*************123` |
| `maskAddress(address)` | 地址脱敏：前3+*+后3 | `北京市朝阳区` → `北京市***市朝阳区` |
| `maskName(name)` | 姓名脱敏：首+*+尾 | `张三丰` → `张*丰` |

#### 批量脱敏

| 函数 | 说明 |
|------|------|
| `maskSensitiveData(data, fields[])` | 对 data 对象中指定 fields 进行脱敏（自动识别 phone/email/id_card/bank_card 等字段名） |
| `maskFieldValue(fieldName, value)` | 按字段名对单个值脱敏（用于变更日志 changed_fields 的 old/new 值） |
| `maskLogParams(obj)` | 递归遍历对象，自动识别敏感字段并脱敏（用于日志 params） |

#### 敏感字段清单

- **密码/令牌类**（直接替换为 `******`）：password, old_password, new_password, confirm_password, pwd, token, access_token, refresh_token, authorization, cookie, api_key, apikey, secret, client_secret, app_secret, webhook_url, webhook_key, signature
- **PII 类**（部分脱敏保留明文）：phone, mobile, telephone, email, id_card, idcard, bank_card, bankcard, account_no, credit_card, creditcard, bank_account, bankaccount, tax_id, taxid, address, contact_phone, contact_email, passport, ssn
- **业务敏感字段**（替换为 `******`）：cost_price, unit_price, total_price, amount

### 6.8 LLM 客户端 llmClient.js

**文件路径**: `backend/utils/llmClient.js`

统一 LLM 调用客户端，支持三种 AI 提供商切换（通过 `AI_PROVIDER` 环境变量）。

#### 提供商配置

| Provider | 环境变量 | 默认值 | API 格式 |
|----------|----------|--------|----------|
| `ollama` (默认) | `OLLAMA_URL` / `OLLAMA_MODEL` | `http://127.0.0.1:11434` / `qwen2.5:3b` | Ollama 原生 `/api/chat` |
| `openai` | `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | `gpt-3.5-turbo` | OpenAI 兼容 `/chat/completions` |
| `mimo` | `MIMO_API_KEY` / `MIMO_BASE_URL` / `MIMO_MODEL` | `mimo-v2.5-flash` | OpenAI 兼容 |

#### 核心函数

| 函数 | 说明 |
|------|------|
| `chatCompletion(messages, options?)` | 发送聊天请求，返回 `Promise<string>`；支持 `maxTokens`(默认200)、`temperature`(默认0.7)、`signal`(AbortSignal)、`system`(系统提示词) |
| `getProviderStatus()` | 检查当前 LLM 服务状态（3s 超时），返回 `{ online, provider, model, models, supportsImage }` |
| `getProviderConfig()` | 获取当前提供商配置对象 |

#### 限制
- Ollama 不支持图片输入（`hasImageContent` 检测后报错）
- OpenAI 图片支持仅限 `gpt-4*` 模型
- MiMo 未配置 API Key 时打印警告但不阻断

### 6.9 通知工具 notification.js

**文件路径**: `backend/utils/notification.js`

多通道消息通知工具，支持企业微信 Webhook + 邮件告警。

#### 通道配置

| 通道 | 环境变量 | 用途 |
|------|----------|------|
| 企业微信 | `WECHAT_WEBHOOK_URL` | 文本/Markdown 消息推送 |
| 邮件 | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `ALERT_EMAIL_TO` | 告警邮件（端口465为SSL） |

#### 发送函数

| 函数 | 说明 |
|------|------|
| `sendText(content, mentionedList?)` | 发送企业微信文本消息 |
| `sendMarkdown(content)` | 发送企业微信 Markdown 消息 |
| `sendEmailAlert(context)` | 发送告警邮件（level/source/message/traceId/timestamp） |
| `sendFollowupReminder(data)` | 跟进提醒（type: overdue/today/upcoming，含客户名/负责人） |
| `sendPaymentOverdue(data)` | 回款逾期通知（合同号/客户/金额/逾期天数） |
| `sendOpportunityReminder(data)` | 商机提醒（商机名/客户/阶段/预期金额） |

#### 安全设计
- Webhook 未配置时返回 rejected Error（不静默吞掉）
- 邮件发送失败仅记录日志不抛出（降级）
- 企业微信请求失败记录日志后 reject

### 6.10 系统配置工具 config.js

**文件路径**: `backend/utils/config.js`

从 `sys_config` 表读取系统配置，内存缓存 60 秒。

| 函数 | 说明 | 默认值 |
|------|------|--------|
| `getConfig(key, defaultValue?)` | 通用配置读取 | — |
| `getOverdueDays()` | 跟进逾期天数阈值 | 15 |
| `isFollowupReminderEnabled()` | 是否启用跟进提醒 | true |
| `getNearRecycleDays()` | 近回收期天数 | 7 |
| `getRecycleDays()` | 回收天数 | 15 |
| `clearConfigCache()` | 清空配置缓存 | — |

### 6.11 CSV 安全导出 csvExport.js

**文件路径**: `backend/utils/csvExport.js`

CSV 导出工具，内置 **公式注入防护**（CSV/DDE Injection）。

| 函数 | 说明 |
|------|------|
| `escapeCsvCell(value)` | 对以 `=+-@\t\r` 开头的单元格前加 `'` 禁用公式解析 |
| `buildCsv(rows, headers?)` | 将对象数组转为 CSV 字符串（自动转义逗号/引号/换行） |

### 6.12 数据清洗工具 dataCleaner.js

**文件路径**: `backend/utils/dataCleaner.js`

`DataCleaner` 静态工具类，用于导入数据前的清洗与查重。

| 方法 | 说明 |
|------|------|
| `cleanCustomerData(data[])` | 批量清洗客户字段（公司名/联系人/电话/邮箱/地址/行业/来源/备注） |
| `cleanString(str)` | 去首尾空格 + 合并连续空格 |
| `cleanPhone(phone)` | 只保留数字（去掉 `+` 和特殊字符） |
| `cleanEmail(email)` | trim + 转小写 |
| `detectDuplicates(data[], keyFields[])` | 批量数据内部查重，返回 `{index, record, duplicateOf}[]` |
| `filterExistingDuplicates(data, pool, tableName, matchFields[])` | 批量与 DB 已有记录查重，返回 `{newRecords, skippedCount}` |

### 6.13 字段变更日志 fieldLog.js

**文件路径**: `backend/utils/fieldLog.js`

字段级变更审计工具，对比新旧数据生成变更记录并写入 `sys_log`。

| 导出 | 说明 |
|------|------|
| `computeFieldChanges(oldData, newData, allowedFields[])` | 对比生成 `{changedFields, oldValue, newValue}`（无变更返回 null） |
| `logFieldChanges(req, {module, action, oldData, newData, allowedFields, description})` | 自动计算变更 + 调用 `logAction` 写入审计日志 |
| `FIELD_LABEL_MAP` | 字段中文名映射表（company_name→公司名称 等 28 个字段） |

**设计要点**: 统一转字符串比较避免类型差异；仅追踪 `allowedFields` 白名单内字段。

### 6.14 供应商资质提醒 qualification-reminder.js

**文件路径**: `backend/utils/qualification-reminder.js`

供应商资质到期提醒工具，由定时任务调用。

| 函数 | 说明 |
|------|------|
| `checkQualificationExpiry()` | 扫描 90/60/30/15/7 天内到期资质，写入 `crm_qualification_reminder` 表（去重） |
| `getPendingReminders()` | 获取未通知的提醒列表 |
| `markReminderAsNotified(ids)` | 批量标记已通知 |
| `getExpiringSoonList(days=30)` | 即将到期列表（含 days_left 字段） |
| `getExpiredList()` | 已过期列表（含 days_expired 字段） |
| `updateQualificationStatus()` | 批量更新资质状态：过期→3, 30天内→2, 正常→1 |

**常量**: `REMINDER_DAYS = [90, 60, 30, 15, 7]`

### 6.15 查询辅助工具 queryHelper.js

**文件路径**: `backend/utils/queryHelper.js`

通用分页查询模板，减少各 service 重复代码。

| 函数 | 说明 |
|------|------|
| `paginatedQuery(pool, {baseTable, selectFields, whereClause?, params?, page?, pageSize?, orderBy?})` | 统一 COUNT+LIST 分页查询，返回 `{total, list, page, pageSize}` |

**安全设计**: page 最小 1，pageSize 范围 1-200，offset 自动计算。

### 6.16 批量任务队列 queue.js

**文件路径**: `backend/utils/queue.js`

基于 Redis 的批量任务队列，支持死信队列。

| 函数 | 说明 |
|------|------|
| `enqueue(type, payload, userId)` | 将任务推入队列（LPUSH） |
| `processBatch(pool, handler)` | 从队列 RPOP 逐条处理，失败任务写入死信队列 |
| `getDeadLetters(limit=100)` | 获取死信队列中的失败任务列表 |

**常量**: `QUEUE_KEY = 'crm:batch:queue'`、`DEAD_LETTER_KEY = 'crm:batch:dead'`

**限制**: Redis 不可用时 `enqueue` 直接抛错。

### 6.17 供应商评分入口 scoring.js

**文件路径**: `backend/utils/scoring.js`

兼容层文件，实际逻辑已迁移至 `services/supplierScoringService.js`。

| 函数 | 说明 |
|------|------|
| `calculateSupplierScore(supplierId)` | 计算单个供应商评分（委托 service） |
| `checkAllSuppliersScores()` | 批量检查所有供应商评分（定时任务调用） |
| `getCurrentPeriod()` | 获取当前评分周期 |

**设计**: 保留原导出签名避免改动 `routes/cronJobs.js` 等调用方。原 PostgreSQL `ON CONFLICT` 已在 service 层改为 MySQL 兼容的 SELECT-then-INSERT/UPDATE。

### 6.18 Supabase 存储客户端 supabaseStorage.js

**文件路径**: `backend/utils/supabaseStorage.js`

Supabase Storage 文件存储客户端，未配置时回退到本地文件存储。

| 函数 | 说明 |
|------|------|
| `getSupabaseStorage()` | 惰性初始化 Supabase Storage 客户端（单例），自动创建 `attachments` bucket |

**环境变量**: `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`，未配置时返回 null（降级为本地存储）

---

## 7. 常量层 (Constants)

### 7.1 客户状态 customerStatus.js

**文件路径**: `backend/constants/customerStatus.js`

##### 状态编码

| 常量 | Code | 名称 | 标签颜色 |
|------|------|------|---------|
| `LEAD` | `'lead'` | 线索 | `#909399` |
| `SEA` | `'sea'` | 公海客户 | `#909399` |
| `FOLLOWING` | `'following'` | 跟进中 | `#409EFF` |
| `QUOTED` | `'quoted'` | 已报价 | `#67C23A` |
| `NEGOTIATING` | `'negotiating'` | 谈判中 | `#E6A23C` |
| `SIGNED` | `'signed'` | 已签约 | `#67C23A` |
| `LOST` | `'lost'` | 已流失 | `#F56C6C` |
| `PAUSED` | `'paused'` | 暂停跟进 | `#909399` |

##### 销售漏斗主路径

```
LEAD → SEA → FOLLOWING → QUOTED → NEGOTIATING → SIGNED
```

##### 导出函数

| 函数 | 说明 |
|------|------|
| `isValidCustomerStatus(code)` | 判断状态编码是否有效 |
| `isEndStatus(config)` | 判断状态是否为终态 |

---

### 7.2 池状态 poolStatus.js

**文件路径**: `backend/constants/poolStatus.js`

##### pool_status 枚举

| 常量 | Code | 说明 |
|------|------|------|
| `PRIVATE` | `'private'` | 私有（有负责人或 lead 客户） |
| `SEA` | `'sea'` | 公海（被释放的非 lead 客户） |

##### business_status 枚举

| 常量 | Code | 说明 |
|------|------|------|
| `LEAD` | `'lead'` | 线索/潜客 |
| `FOLLOWING` | `'following'` | 跟进中 |
| `QUOTED` | `'quoted'` | 已报价 |
| `NEGOTIATING` | `'negotiating'` | 商务谈判 |
| `SIGNED` | `'signed'` | 已成交 |
| `LOST` | `'lost'` | 流失 |

##### 业务语义

| 分类 | 条件 |
|------|------|
| 线索池 | `business_status = 'lead'`（不论 `pool_status`） |
| 正式客户 | `business_status IN (following/quoted/negotiating/signed)` 且 `pool_status = 'private'` |
| 公海池 | `pool_status = 'sea'` 且 `business_status != 'lead'` |

> **注意**: lead 客户即使 `owner_id IS NULL`，`pool_status` 仍为 `'private'`（不属于公海）。

---

## 8. 核心层 (Core)

### 8.1 模块注册器 ModuleRegistry.js

**文件路径**: `backend/core/ModuleRegistry.js`

单例模式模块注册器，支持模块化注册路由、权限点、迁移文件。

| 方法 | 说明 |
|------|------|
| `register(name, { routes, permissions, migrations })` | 注册模块 |
| `getAllRoutes()` | 获取所有模块路由 |
| `getAllPermissions()` | 获取所有模块权限点 |
| `get(name)` | 获取指定模块 |

---

## 9. 服务层 (Services) — 核心

### 9.1 认证服务 authService.js

**文件路径**: `backend/services/authService.js`  
**依赖**: `bcryptjs`, `jsonwebtoken`, `crypto`, `svg-captcha`

#### 模块概述

认证业务逻辑层，涵盖验证码、登录/登出、用户信息、密码管理、注册。

##### 密码策略

- 正则：至少 8 位，含大写字母、小写字母和数字
- 正则：`/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/`
- bcrypt 加盐：`rounds = 10`

##### 验证码

| 函数 | 说明 |
|------|------|
| `getCaptcha()` | 生成 SVG 验证码（4 位，排除 0o1il），TTL 300s |
| `verifyCaptcha(key, captcha)` | 校验验证码（大小写不敏感），一次性使用 |
| `setDevCaptcha()` | 开发模式预置固定验证码 |

验证码存储优先 Redis，失败降级内存 `Map`。

##### 核心函数

###### `login(pool, { username, password })`

用户登录验证。

| 参数 | 类型 | 说明 |
|------|------|------|
| `username` | `string` | 用户名 |
| `password` | `string` | 密码 |

**返回**: 用户对象（含 `must_change_password`, `role_code`, `view_all`, `manage_all`）  
**抛出**: `LOGIN_FAILED` / `VALIDATION_ERROR`

###### `logout(pool, token)`

登出，将 Token 加入黑名单。

| 参数 | 类型 | 说明 |
|------|------|------|
| `token` | `string` | JWT Token |

**返回**: `{ userId, username }`  
**逻辑**: SHA-256 哈希 Token → 写入 `sys_token_blacklist`（`INSERT IGNORE`）

###### `getMe(pool, userId)`

获取当前用户信息（含功能权限、菜单权限、数据权限）。

**缓存**: 30s 内存缓存（`Map`），避免每次页面刷新执行 3 个权限查询。

**返回**: `{ id, username, realName, phone, email, deptId, roleId, roleCode, mustChangePassword, viewAll, manageAll, permissions, menus, dataPermissions }`

###### `clearMeCache(userId)`

清除指定用户的 `/auth/me` 缓存（权限变更后调用）。

###### `changePassword(pool, userId, oldPassword, newPassword)`

修改密码，需验证旧密码，重置 `must_change_password = 0`。

###### `forceChangePassword(pool, userId, newPassword)`

强制修改密码（首次登录/重置密码后），无需旧密码。使用事务 + `FOR UPDATE` 行锁。

###### `register(pool, { username, password, real_name })`

注册新用户（仅管理员），默认角色 `sales`，强制首次登录改密。

###### `updateProfile(pool, userId, data)`

更新个人信息（`real_name`, `phone`, `email`）。

---

### 9.2 客户服务 customerService.js

**文件路径**: `backend/services/customerService.js`  
**依赖**: `../constants/customerStatus`, `../constants/poolStatus`, `../utils/pagination`, `../errors/AppError`

#### 模块概述

客户核心服务层，提供客户 CRUD、状态流转、分页查询等功能。

##### 客户来源白名单

```
展会, Facebook, Instagram, LinkedIn, 独立站, 其他网络渠道, 转介绍, 电话, 其他
```

来源父级映射：`网络 → [Facebook, Instagram, LinkedIn, 独立站, 其他网络渠道]`

##### 状态配置缓存

- `loadStatusConfig(pool)`: 从 `sys_customer_status` 加载状态配置（缓存）
- `loadStatusTransitions(pool)`: 从 `sys_customer_status_transition` 加载流转规则（缓存）
- `clearStatusConfigCache()`: 清空缓存

##### `listCustomers(pool, params, permission)`

查询客户列表（分页、关键字、多维筛选）。

| 参数 | 说明 |
|------|------|
| `params.page` / `params.pageSize` | 分页 |
| `params.company_name` / `params.contact_name` / `params.phone` | 关键字搜索 |
| `params.source` / `params.level` / `params.status` / `params.customer_type` | 筛选 |
| `params.owner_id` / `params.start_date` / `params.end_date` | 范围筛选 |
| `params.overdue` / `params.unassigned` / `params.overdue_follow` | 特殊条件 |
| `params.tag_id` / `params.sort` | 标签/排序 |
| `permission` | `{ clause, params }` 数据权限片段 |

**返回**: `{ list, total, page, pageSize }`

##### 排序白名单

| Key | SQL |
|-----|-----|
| `create_time_desc` | `c.create_time DESC` |
| `last_follow_time_asc` | `c.last_follow_time IS NULL ASC, c.last_follow_time ASC` |
| `last_follow_time_desc` | `c.last_follow_time DESC` |

##### `canTransition(pool, fromCode, toCode)`

判断状态流转是否合法，查询 `sys_customer_status_transition` 表。

##### `getDefaultStatus(pool)`

获取默认客户状态（`sys_customer_status.is_default = 1`）。

---

## 9.4 客户服务完整 API（customerService.js 续）

**文件路径**: `backend/services/customerService.js`  
**全文约 730 行**

### 9.4.1 状态流转

#### `transitionStatus(pool, customerId, toCode, operatorId, reason)`

通用客户状态流转。

| 参数 | 类型 | 说明 |
|------|------|------|
| `customerId` | `number` | 客户 ID |
| `toCode` | `string` | 目标状态编码（须为 `CUSTOMER_STATUS_CODES` 成员） |
| `operatorId` | `number` | 操作人 ID |
| `reason` | `string?` | 流转原因（`require_reason` 规则时必填） |

**返回**: `{ id, status, from_status }`  
**抛出**: `VALIDATION_ERROR` / `CUSTOMER_NOT_FOUND` / `BUSINESS_VALIDATION`

#### `forwardStatus(pool, customerId, operatorId)`

沿主销售漏斗前进一步（`LEAD→SEA→FOLLOWING→QUOTED→NEGOTIATING→SIGNED`）。

**返回**: `{ id, status, from_status }`  
**抛出**: `CUSTOMER_NOT_FOUND` / `BUSINESS_VALIDATION`（终态无法推进）

#### `backwardStatus(pool, customerId, operatorId, reason)`

沿主销售漏斗回退一步。

**返回**: `{ id, status, from_status }`  
**抛出**: `CUSTOMER_NOT_FOUND` / `BUSINESS_VALIDATION`（起点无法回退）

#### `mapStatusToBusinessStatus(toCode)`

内部函数：将 `customerStatus` 映射为 `businessStatus`。`sea`/`paused` 映射为 `following`。

---

### 9.4.2 分配与认领

#### `assignCustomer(pool, customerId, toUserId, operatorId, remark)`

分配客户负责人。

| 参数 | 类型 | 说明 |
|------|------|------|
| `customerId` | `number` | 客户 ID |
| `toUserId` | `number\|null` | 分配目标用户 ID，`null` 表示回收为待分配 |
| `operatorId` | `number` | 操作人 ID |
| `remark` | `string?` | 备注 |

**返回**: `{ fromUserId }`  
**副作用**: 写入 `crm_assign_log` 日志，重置 `pool_status='private'`、清除 `protect_until`

#### `batchAssignCustomers(pool, customerIds, toUserId, operatorId, remark)`

批量分配客户负责人（事务保护）。

**优化**: 批量查询 + 批量 UPDATE + 批量 INSERT 日志（各 1 次 SQL），避免循环。

**返回**: `{ count }`

#### `claimCustomer(pool, customerId, userId)`

认领公海客户（Phase 1 版本）。

**逻辑**: 校验 `pool_status='sea'` → 检查保护期 → 设置 `pool_status='private'`、`owner_id`、7 天保护期 → 写入 `crm_pool_log`。

**抛出**: `CUSTOMER_NOT_FOUND` / `BUSINESS_VALIDATION`（不在公海 / 保护期内）

#### `releaseCustomer(pool, customerId, userId)`

释放客户到公海（Phase 1 版本）。

**逻辑**: 设置 `pool_status='sea'`、`owner_id=NULL`、清除 `protect_until` → 写入 `crm_pool_log`。

---

### 9.4.3 潜客转化

#### `convertToCustomer(pool, id)`

潜客转化为正式客户（Prompt 4-1 版本）。

**字段变更**: `customer_type: prospect→customer`、`lifecycle_status: →active`、`business_status: lead→following`、`status: →CUSTOMER_STATUS.FOLLOWING`

#### `convertLeadToCustomer(pool, customerId, operatorId)`

潜客转正式客户（Phase 2 增强版，事务保护）。

**与 `convertToCustomer` 区别**: 同时写入 `crm_assign_log` 转化日志，返回 `from_status`/`to_status`。

**返回**: `{ id, company_name, from_status, to_status }`

---

### 9.4.4 三页面查询（Phase 2）

#### `listLeads(pool, params, permission)`

查询潜客池列表（`business_status='lead'`）。

| 参数 | 说明 |
|------|------|
| `params.company_name` / `params.contact_name` / `params.phone` | 搜索 |
| `params.source` / `params.lead_level` / `params.owner_id` | 筛选 |
| `params.sort` | 排序（`SORT_MAP` 白名单） |
| `permission` | `{ clause, params }` 数据权限片段 |

**返回**: `{ list, total }`

#### `listFormalCustomers(pool, params, permission)`

查询正式客户列表（`business_status IN (following/quoted/negotiating/signed)` 且 `pool_status='private'`）。

**额外筛选**: `business_status`、`level`、`start_date`/`end_date`

**子查询**: 商机数、合同数、下次跟进时间

#### `listPoolCustomersNew(pool, params, permission)`

查询公海池列表（`pool_status='sea'` 且 `business_status!='lead'`）。

**子查询**: 释放时间、释放人（`crm_pool_log` 最近一条 release/auto_release）

---

### 9.4.5 三业务操作（Phase 2）

#### `releaseCustomerToPool(pool, customerId, operatorId, reason)`

释放客户到公海（Phase 2 增强版，事务保护）。

**校验**: 非 lead 客户、当前不在公海  
**副作用**: 写入 `crm_pool_log`（action='release'）

#### `claimPoolCustomer(pool, customerId, userId)`

领取公海客户（Phase 2 增强版，事务保护）。

**校验**: 在公海、非 lead 客户、保护期已过  
**副作用**: 7 天保护期、写入 `crm_pool_log`（action='claim'）  
**返回**: `{ id, company_name, protect_until }`

---

### 9.4.6 逾期与回收预警

#### `getOverdueCustomers(pool, params, permission)`

获取逾期客户列表（`last_follow_time` 超过 `overdue_days` 天，排除 signed/lost）。

#### `getNearRecycleCustomersList(pool, params, permission)`

获取即将回收客户列表（`following` 状态超过 `near_recycle_days` 未跟进）。

---

### 9.4.7 导出汇总

| 导出函数 | 说明 |
|---------|------|
| `listCustomers` | 综合客户列表（含全维度筛选） |
| `listLeads` | 潜客池列表 |
| `listFormalCustomers` | 正式客户列表 |
| `listPoolCustomersNew` | 公海池列表 |
| `getCustomer` | 客户详情（含联系人 + 跟进 + 附件） |
| `transitionStatus` / `forwardStatus` / `backwardStatus` | 状态流转 |
| `assignCustomer` / `batchAssignCustomers` | 分配负责人 |
| `claimCustomer` / `claimPoolCustomer` | 认领公海 |
| `releaseCustomer` / `releaseCustomerToPool` | 释放公海 |
| `convertToCustomer` / `convertLeadToCustomer` | 潜客转化 |
| `getOverdueCustomers` / `getNearRecycleCustomersList` | 逾期/回收预警 |
| `loadStatusConfig` / `loadStatusTransitions` / `canTransition` / `getDefaultStatus` / `clearStatusConfigCache` | 状态配置管理 |

---

## 9.5 商机服务 opportunityService.js

**文件路径**: `backend/services/opportunityService.js`  
**依赖**: `../errors/AppError`, `./quoteService`, `./contractService`

### 9.5.1 常量

#### 阶段映射 `STAGE_MAP`

| Stage | 名称 |
|-------|------|
| 1 | 询盘 |
| 2 | 需求确认 |
| 3 | 方案报价 |
| 4 | 谈判 |
| 5 | 成交 |
| 6 | 失败 |

#### 默认阶段概率 `DEFAULT_STAGE_PROBABILITY`

| Stage | 赢率(%) |
|-------|---------|
| 1 | 10 |
| 2 | 25 |
| 3 | 50 |
| 4 | 75 |
| 5 | 100 |
| 6 | 0 |

#### 阶段回退规则矩阵 `BACKWARD_RULES`

| 当前阶段 | 允许回退到 |
|---------|------------|
| 2 | [1] |
| 3 | [1, 2] |
| 4 | [1, 2, 3] |
| 5(成交) | 不允许 |
| 6(失败) | 不允许 |

---

### 9.5.2 核心 API

#### `generateOpportunityNo(connection)`

生成商机编号（`OPP-YYMMDD-NNN`），使用 `FOR UPDATE` 锁防并发重复。

#### `getSourceList(pool, onlyActive=true)`

获取商机来源字典列表。

#### `validateSourceId(pool, sourceId)`

校验 `source_id` 有效性（可空，非空时查 `crm_opportunity_source` 表）。

#### `listOpportunities(pool, params, permission)`

查询商机列表（分页、筛选）。

| 参数 | 说明 |
|------|------|
| `name` / `customer_name` / `opportunity_no` | 关键字搜索 |
| `customer_id` / `stage` / `owner_id` / `source_id` | 筛选 |
| `permission` | 数据权限片段 |

**返回**: `{ list, total }`  
**子查询**: 客户名、负责人名、来源名、停滞天数（`DATEDIFF(NOW(), update_time)`）

#### `getOpportunity(pool, opportunityId)`

获取商机详情（基础版，不含权限校验）。

#### `getOpportunityWithPermission(pool, id, permission)`

获取商机详情（带数据权限校验）。含 `lost_reason`、`source_name`。

#### `getOpportunityForPermission(pool, id)`

轻量查询（仅 `id` + `owner_id`），用于权限校验。

---

### 9.5.3 阶段推进与回退

#### `advanceStage(pool, opportunityId, newStage, changedBy, options)`

推进商机阶段。

| 参数 | 类型 | 说明 |
|------|------|------|
| `newStage` | `number` | 目标阶段 (1-6) |
| `changedBy` | `number` | 操作人 ID |
| `options.changeReason` | `string?` | 变更原因 |
| `options.stageProbability` | `object?` | 自定义阶段概率映射 |

**逻辑**: 校验阶段值 → 检查当前阶段（成交/失败不可推进） → 自动设置赢率 → 写 `crm_opportunity_stage_log`

**返回**: `{ oldStage, newStage, stageName }`

#### `backwardStage(pool, opportunityId, targetStage, changedBy, options)`

阶段回退（v1.1）。

**校验**: 按 `BACKWARD_RULES` 矩阵校验、目标必须小于当前阶段、成交/失败不可回退

**副作用**: 重置赢率为目标阶段默认概率，写 `crm_opportunity_stage_log`

**返回**: `{ oldStage, newStage, stageName }`

---

### 9.5.4 创建与更新

#### `createOpportunity(pool, data, userId)`

创建商机。

| 参数 | 说明 |
|------|------|
| `data.customer_id` | 客户 ID（必须为 following/quoted/negotiating/signed 状态） |
| `data.name` | 商机名称 |
| `data.source_id` | 来源 ID（可空，校验有效性） |
| `data.expected_amount` / `data.expected_date` | 预期金额/日期 |
| `data.stage` / `data.win_rate` | 初始阶段/赢率（默认 1/10） |
| `data.owner_id` | 负责人（默认为创建者） |

**返回**: `{ id, opportunity_no }`

**领域边界**: 仅读取 `customer.status`，不修改客户数据（遵守 `customer-center-freeze-v1.md`）。

#### `updateOpportunity(pool, id, data)`

更新商机（`opportunity_no` 不允许更新）。

**可更新字段**: `customer_id`, `name`, `expected_amount`, `expected_date`, `stage`, `win_rate`, `remark`, `owner_id`, `source_id`

**返回**: 旧数据对象（用于日志）

#### `deleteOpportunity(pool, id)`

软删除商机。

---

### 9.5.5 统计与时间轴

#### `getFunnelStats(pool, permission)`

销售漏斗统计。

**返回**:
```json
{
  "total_count": 100,
  "total_amount": 500000.00,
  "funnel": [
    { "stage": 1, "stage_name": "询盘", "count": 50, "amount": 250000, "cumulative_count": 50, "win_rate": 10 },
    ...
  ],
  "failed": { "count": 5, "amount": 10000 }
}
```

#### `getStageStats(pool, opportunityId)`

商机阶段停留时间统计。基于 `crm_opportunity_stage_log` 计算每阶段停留小时数。

**返回**: `{ stages: [{ stage, name, hours }], total_hours }`

#### `getStageLog(pool, opportunityId)`

获取阶段变更日志列表（含操作人姓名、每阶段停留小时数）。

#### `getTimeline(pool, opportunityId)`

获取商机销售时间轴（聚合阶段日志 + 报价单 + 合同，按时间倒序）。

---

### 9.5.6 跨模块联动

#### `createQuoteFromOpportunity(pool, opportunityId, quoteData, userId)`

从商机创建报价单，创建后自动推进商机到 stage 3（方案报价）。

**逻辑**: 查商机 → 注入 `customer_id`/`opportunity_id` → 调用 `quoteService.createQuote` → 尝试推进阶段（不阻塞）

#### `createContractFromOpportunity(pool, opportunityId, contractData, userId)`

从商机创建合同，创建后自动推进商机到 stage 5（成交）。

**逻辑**: 查商机 → 注入 `customer_id`/`opportunity_id` → 调用 `contractService.createContract` → 尝试推进阶段（不阻塞）

---

### 9.5.7 导出汇总

| 导出函数 | 说明 |
|---------|------|
| `listOpportunities` | 商机列表（分页/筛选） |
| `getOpportunity` / `getOpportunityWithPermission` / `getOpportunityForPermission` | 详情查询（3 种粒度） |
| `createOpportunity` / `updateOpportunity` / `deleteOpportunity` | CRUD |
| `advanceStage` / `backwardStage` | 阶段推进/回退 |
| `getFunnelStats` / `getStageStats` / `getStageLog` / `getTimeline` | 统计与时间轴 |
| `getSourceList` / `validateSourceId` / `generateOpportunityNo` | 辅助 |
| `createQuoteFromOpportunity` / `createContractFromOpportunity` | 跨模块联动 |

---

## 9.6 合同服务 contractService.js

**文件路径**: `backend/services/contractService.js`  
**依赖**: `../errors/AppError`, `../errors/codes`

### 9.6.1 常量

#### 合同状态映射 `STATUS_MAP`

| Status | 名称 | 说明 |
|--------|------|------|
| 1 | 待执行 | 默认/新建 |
| 2 | 执行中 | — |
| 3 | 已完成 | 终态，不可变更 |
| 4 | 已取消 | 终态 |

> **注意**: `approval_status` 独立管理审批流程 (1=待审批, 2=已通过, 3=已拒绝)。

#### 回款状态子查询 `PAYMENT_STATUS_CLAUSE`

| Key | SQL 条件 |
|-----|----------|
| `overdue` | 存在 `crm_payment_plan` 且 status='overdue' |
| `partial` | 有回款记录且存在未完成计划 |
| `completed` | 所有计划均已完成 |
| `pending` | 无回款记录 |

---

### 9.6.2 核心 API

#### `listContracts(pool, params, permission)`

查询合同列表（分页、筛选）。

| 参数 | 说明 |
|------|------|
| `keyword` | 搜索合同编号 / 客户名称 |
| `status` / `approval_status` / `payment_status` | 筛选 |
| `customer_id` | 按客户筛选 |
| `permission` | 数据权限片段 |

**子查询**: 已回款金额、计划总额、货币符号

#### `getContract(pool, contractId)`

获取合同详情（含回款计划、回款记录、已回金额、计划总额）。

**返回**: 合同对象 + `plans`（回款计划列表）+ `payments`（回款记录列表）+ `paid_amount` + `plan_total`

#### `createContract(pool, data, createBy)`

创建合同（事务保护，含回款计划批量插入）。

| 参数 | 说明 |
|------|------|
| `data.customer_id` | 客户 ID（必须 status='signed'） |
| `data.opportunity_id` | 商机 ID（校验同客户） |
| `data.quote_id` | 报价 ID |
| `data.amount` | 合同金额 |
| `data.sign_date` / `data.delivery_date` | 签约/交付日期 |
| `data.payment_terms` / `data.remark` | 付款条件/备注 |
| `data.plans` | 回款计划数组 `[{ plan_date, plan_amount, remark }]` |

**编号格式**: `CON-YYYYMMDD-NNN`  
**校验**: 客户必须为 `signed` 状态、商机与客户匹配  
**事务**: 开始 → 校验 → 生成编号 → INSERT 合同 → 批量 INSERT 回款计划 → 提交

**返回**: `{ id, contract_no }`

---

### 9.6.3 状态与金额管理

#### `updateContractStatus(pool, contractId, newStatus)`

合同状态流转。

**校验**: 已完成（status=3）的合同不能变更状态。

#### `cancelContract(pool, { id, cancel_reason, cancel_action, userId })`

合同取消工作流。

**逻辑**: 校验非已取消/已完成 → `status→4` → 追加取消原因到 `remark` → 返回 `opportunity_id` 供路由层联动商机

**返回**: `{ id, contract_no, status, cancel_reason, cancel_action, opportunity_id }`

#### `calculateAmount(pool, contractId)`

计算合同金额统计。

**返回**: `{ amount, paid_amount, plan_total, remaining, progress }`

- `progress` = `paid_amount / amount * 100`（百分比取整）

#### `getPaymentProgress(pool, contractId)`

回款进度计算（按计划维度）。

**返回**: `{ plans, total_plan, total_paid, rate, overdue_count }`

- `rate` = `total_paid / total_plan * 100`
- `overdue_count`: 未完成且已过期的计划数

---

### 9.6.4 导出汇总

| 导出函数 | 说明 |
|---------|------|
| `listContracts` | 合同列表 |
| `getContract` | 合同详情（含回款） |
| `createContract` | 创建合同（事务） |
| `calculateAmount` | 金额统计 |
| `updateContractStatus` | 状态流转 |
| `cancelContract` | 合同取消 |
| `getPaymentProgress` | 回款进度 |

---

## 9.7 报价服务 quoteService.js

**文件路径**: `backend/services/quoteService.js`  
**依赖**: `../config/logger`, `./opportunityService`, `../errors/AppError`, `../errors/codes`, `../utils/pagination`

### 9.7.1 核心 API

#### `generateQuoteNo(connection)`

生成报价编号（`QUO-YYMMDD-NNN`），使用 `FOR UPDATE` 锁防并发重复。

#### `createQuote(pool, data, userId)`

创建报价单（事务保护）。

| 参数 | 说明 |
|------|------|
| `data.customer_id` | 客户 ID |
| `data.opportunity_id` | 商机 ID（可空，校验同客户） |
| `data.items` | 报价项数组 `[{ product_id, quantity, unit_price, remark }]` |
| `data.discount` | 折扣率 (0-1，默认 0) |
| `data.valid_days` | 有效天数（默认 30） |
| `data.currency` / `data.exchange_rate` | 货币/汇率（默认 CNY/1.0） |

**事务流程**:
1. 校验客户存在
2. 校验商机匹配（如传入）
3. 逐项校验产品存在且启用，计算金额
4. 生成编号 `QUO-YYMMDD-NNN`
5. INSERT 报价单
6. 逐项 INSERT 报价明细
7. 提交事务
8. 创建审批通知（不阻塞主流程）

**领域边界**: 不自动推进客户状态（已移除跨模块写操作，遵守 `customer-center-freeze-v1.md`）。

**返回**: `{ id, quote_no }`

#### `listQuotes(pool, params, permission)`

查询报价列表（分页、筛选）。

| 参数 | 说明 |
|------|------|
| `quote_no` / `customer_name` | 搜索 |
| `status` / `approval_status` | 筛选 |
| `permission` | 数据权限片段 |

**附加返回**: `expiring_count`（7 天内到期的待审批报价数）

#### `getQuote(pool, id, permission)`

获取报价详情（含报价明细项）。

**返回**: 报价对象 + `items`（明细列表）

#### `updateQuote(pool, data)`

更新报价单（事务保护）。

**可更新字段**: `customer_id`, `items`（全量替换）, `discount`, `valid_days`, `remark`, `status`

**校验**: 已确认（status=3）或已失效（status=4）的报价单不可修改  
**金额重算**: 更新 `items` 时自动重算 `amount` 和 `final_amount`

**返回**: `{ success, existingQuote }`（旧数据用于日志）

#### `deleteQuote(pool, id, user)`

软删除报价单。

**权限**: 管理员/经理或创建者可删除，已确认的报价单不可删除。

#### `approveQuote(pool, id, approvalStatus, approvalRemark, userId)`

报价审批。

| 参数 | 说明 |
|------|------|
| `approvalStatus` | 1=通过, 2=拒绝 |
| `approvalRemark` | 审批备注 |

**副作用**: 关闭对应通知  
**跨模块联动**: 审批通过时推进商机到 stage 3（方案报价），不阻塞主流程  

#### `convertToContract(pool, quoteId, userId)`

报价转合同（事务保护）。

**流程**:
1. 查询报价单 → 校验存在
2. 生成合同编号 `HT-YYYYMMDD-NNN`
3. INSERT 合同（传递 `opportunity_id` 和 `quote_id`）
4. 更新报价单 `status=3`（已确认）
5. 提交事务
6. 推进商机到 stage 5（成交），不阻塞

**返回**: `{ contract_id }`

---

### 9.7.2 报价状态映射

| Status | 名称 |
|--------|------|
| 1 | 草稿 |
| 2 | 已发送 |
| 3 | 已确认 |
| 4 | 已失效 |

---

### 9.7.3 导出汇总

| 导出函数 | 说明 |
|---------|------|
| `createQuote` | 创建报价单（事务） |
| `listQuotes` | 报价列表 |
| `getQuote` | 报价详情 |
| `updateQuote` | 更新报价单（事务） |
| `deleteQuote` | 软删除 |
| `approveQuote` | 审批 |
| `convertToContract` | 转合同（事务 + 商机联动） |

---

## 9.8 服务层跨模块调用关系

```
        ┌──────────────────┐
        │  opportunityService  │
        └──┬───────┬────────┘
           │       │
  createQuoteFrom   createContractFrom
  Opportunity       Opportunity
           │       │
           ▼       ▼
  ┌──────────┐  ┌──────────────┐
  │ quoteService │  │ contractService │
  └──────┬────┘  └───────┬──────┘
         │                │
  convertToContract       │
         │                │
         └───────┬────────┘
                 │
         approveQuote → advanceStage(opp, 3)
         convertToContract → advanceStage(opp, 5)
```

**调用方向**: 
- `opportunityService` → `quoteService` / `contractService`（创建报价/合同）
- `quoteService` → `opportunityService`（审批通过推进阶段、转合同推进成交）
- `quoteService` → `contractService`（转合同）
- `contractService` → 无外部服务依赖

**领域边界约束**: 商机/报价/合同模块只能 SELECT 读取 `crm_customer` 表，禁止写操作。客户状态推进由客户中心模块自治。

---

## 9b. 服务层补充文档（P2 批量）

> 以下为 P2 阶段批量文档化的 50 个服务文件，按功能模块分组。

### 9b.1 认证与客户核心服务

#### authService.js（~408行）

| 函数 | 说明 |
|------|------|
| `getCaptcha` | 生成 SVG 验证码，Redis 优先+内存降级 |
| `verifyCaptcha` | 校验验证码，通过后立即删除防重放 |
| `login` | 用户登录（bcrypt 比对，返回用户+角色字段） |
| `logout` | token sha256 写入黑名单 |
| `getMe` | 当前用户信息（含权限/菜单/数据权限），30秒缓存 |
| `clearMeCache` | 清除 /auth/me 缓存 |
| `getProfile`/`updateProfile` | 个人信息 |
| `changePassword` | 修改密码（旧密码+强度规则） |
| `forceChangePassword` | 强制改密（首登/重置，事务+FOR UPDATE） |
| `register` | 注册用户（仅管理员，强制首登改密） |

**关键设计**: 验证码 Redis 优先+内存降级；token 黑名单主动失效；/auth/me 短 TTL 缓存。

#### leadsService.js（~272行）

| 函数 | 说明 |
|------|------|
| `getLeadsList` | 线索分页列表 |
| `convertLead` | 线索转化（事务保护） |
| `batchConvert` | 批量转化 |
| `importLeads` | 批量导入 |
| `claimLead` | 领取线索 |
| `markLeadLost` | 标记流失 |
| `getLeadsStats` | 线索统计 |

**关键设计**: @deprecated，线索已整合为客户"潜客"阶段；权限按角色分层。

#### assignService.js（~305行）

| 函数 | 说明 |
|------|------|
| `getAssignRules`/`createRule`/`updateRule`/`deleteRule` | 分配规则 CRUD |
| `applyRule` | 轮询自动分配（上限500条，事务保护） |
| `autoAssignOwner` | 新建客户时按规则匹配分配负责人（round_robin/by_source/by_region） |
| `manualAssign`/`batchAssign` | 手动/批量分配 |
| `getAssignLogs` | 分配日志 |
| `getSalesUsers`/`getMySubordinates` | 销售人员/下属列表 |

**关键设计**: 三种匹配模式+轮询位置持久化；分配/回收同步 pool_status。

#### poolService.js（~271行）

| 函数 | 说明 |
|------|------|
| `listPoolCustomers` | 公海客户分页列表 |
| `claimCustomer` | 认领（7天保护期） |
| `batchClaimCustomers` | 批量认领（上限20） |
| `releaseCustomer` | 释放到公海 |
| `batchReleaseCustomers` | 批量释放（上限100） |
| `getPoolLogs` | 公海操作日志 |

**关键设计**: AppError 抛异常模式；保护期校验；部分成功语义。

#### customerDetailService.js（~527行）

| 函数 | 说明 |
|------|------|
| `canManageCustomer` | 权限检查（管理员/经理/销售） |
| `addCustomer` | 新增客户（重复检测+自动分配+创建联系人，事务保护） |
| `updateCustomer` | 修改客户（权限+状态流转+重名校验） |
| `deleteCustomer` | 逻辑删除 |
| `getCustomerDetail` | 详情（含联系人/跟进/附件） |
| `getCustomer360` | 360°视图（9张表并行查询） |
| `exportCustomers` | 导出 XLSX（上限10000） |

**关键设计**: 自动分配负责人；Promise.all 并行 9 表查询；旧数字状态兼容映射。

#### importService.js（~209行）

| 函数 | 说明 |
|------|------|
| `parseRows` | Excel 行数据按字段映射表转换 |
| `importPreview` | 导入预览（解析+映射+清洗+验证） |
| `batchImport` | 批量导入（清洗→状态映射→验证→去重→事务插入） |
| `importCustomers` | 从 Buffer 完整导入 |

**关键设计**: 字段映射支持多种列名变体；DataCleaner 清洗+去重；验证规则动态加载。

#### followUpService.js（~520行）

| 函数 | 说明 |
|------|------|
| `addFollowUp` | 添加跟进（更新客户状态 sea→following，解除逾期提醒） |
| `batchAddFollowUp` | 批量添加（事务保护） |
| `listFollowUps` | 跟进列表（数据权限） |
| `getTodayRemind`/`getTomorrowPlan`/`getOverdueList` | 今日/明日/逾期列表 |
| `getTaskStats` | 任务统计 |
| `updateFollowUp`/`deleteFollowUp` | 编辑/软删除 |
| `getCalendar` | 跟进日历（按月） |
| `addPlan`/`listPlans`/`completePlan`/`cancelPlan` | 跟进计划管理 |

**关键设计**: 跟进记录与计划合并同表（is_plan 区分）；自动推进客户状态。

#### paymentService.js（~334行）

| 函数 | 说明 |
|------|------|
| `recalculatePlanStatus`/`recalculatePlanStatusWithConn` | 重算回款计划状态（事务内外两版） |
| `createPaymentPlans` | 批量创建回款计划 |
| `recordPayment` | 登记回款（校验合同→插入→更新合同→重算计划，事务保护） |
| `updatePayment`/`deletePayment` | 更新/删除回款 |
| `getOverduePayments` | 逾期回款计划 |
| `getMergedPayments` | 合并视图（计划+实际） |
| `getMonthlySummary` | 本月汇总 |
| `getCustomerReconciliation` | 客户对账 |

**关键设计**: 状态自动重算（pending/partial/completed/overdue）；事务内外两个版本。

#### permissionService.js（~264行）

| 函数 | 说明 |
|------|------|
| `getUserPermissions` | 获取用户权限（角色+直接，带缓存） |
| `hasPermission` | 检查权限（管理员直接通过） |
| `clearPermissionCache`/`clearAllPermissionCache` | 清除缓存 |
| `getMenuPermissions`/`buildMenuTree` | 菜单权限树 |
| `getDataPermissions` | 数据权限配置 |
| `addUserPermission`/`removeUserPermission`/`setUserPermissions` | 用户直接权限管理 |

**关键设计**: 两级缓存（L1 本地内存 + L2 Redis）；权限合并 UNION 查询。

#### roleRouteService.js（~75行）

| 函数 | 说明 |
|------|------|
| `listRoles`/`addRole`/`updateRole`/`deleteRole` | 角色 CRUD |

**关键设计**: 删除前检查关联用户；修改/删除后联动清除权限缓存。

---

### 9b.2 合同/审批/通知服务

#### contractCrudService.js（~200行）

| 函数 | 说明 |
|------|------|
| `listContracts` | 合同列表（分页+筛选+数据权限） |
| `getContractDetail` | 详情（含权限校验） |
| `createContractNotification` | 创建审批通知（失败不阻塞） |
| `updateContract` | 事务更新（同步回款计划增删改） |
| `deleteContract` | 软删除（含关联回款） |
| `searchContracts` | 轻量搜索（限20条） |
| `getOpportunityList` | 关联商机列表（数据权限） |

**关键设计**: PAYMENT_STATUS_CLAUSE 子查询映射；事务包裹合同+回款计划。

#### contractPaymentService.js（~230行）

| 函数 | 说明 |
|------|------|
| `checkContractPermission` | 权限校验（管理员/经理/创建人） |
| `addPayment`/`updatePayment`/`deletePayment` | 回款 CRUD |
| `listPayments` | 回款列表（tab: all/overdue/summary） |
| `getMergedPayments` | 合并视图 |
| `exportPayments` | 导出 XLSX |
| `getSummary` | 本月汇总 |
| `getStatementExport` | 对账单导出（双 Sheet） |

**关键设计**: 权限统一封装；对账单双 Sheet（客户汇总+回款明细）。

#### contractExportService.js（~180行）

| 函数 | 说明 |
|------|------|
| `stripExportFields` | 移除敏感字段 |
| `exportContracts` | 导出合同 XLSX |
| `exportPayments` | 导出回款 XLSX |
| `importPayments` | 批量导入回款（≤500条，事务+逐行错误收集） |

**关键设计**: FIELD_HEADER_MAP 英中映射；导入事务+逐行错误收集；Excel 日期序列号转换。

#### contractTemplateService.js（~60行）

| 函数 | 说明 |
|------|------|
| `listTemplates`/`getTemplate`/`manageTemplate` | 模板 CRUD（action 分发） |

**关键设计**: 极简 CRUD，manageTemplate 通过 action 参数分发。

#### approvalService.js（~340行）

| 函数 | 说明 |
|------|------|
| `listWorkflows`/`createWorkflow`/`updateWorkflow`/`deleteWorkflow` | 工作流 CRUD |
| `submitApproval` | 提交审批（自动匹配工作流，折扣>10%走折扣审批） |
| `approveRecord` | 审批通过（FOR UPDATE 防并发，自动流转） |
| `rejectRecord` | 审批拒绝（同步更新业务表） |
| `withdrawApproval` | 撤回（仅创建人） |
| `getMyPending`/`getMySubmitted` | 待审/已提交列表 |
| `batchApprove`/`batchReject` | 批量审批 |
| `simpleApproveContract` | 合同简单审批（非工作流） |

**关键设计**: FOR UPDATE 行锁防 TOCTOU；BUSINESS_TABLE_MAP 白名单防注入；manager 类型自动向上找直属上级。

#### emailService.js（~330行）

| 函数 | 说明 |
|------|------|
| `encrypt`/`decrypt` | AES-256-CBC 加密/解密邮箱密码 |
| `createAccount`/`listAccounts`/`deleteAccount` | 邮箱账号管理 |
| `testConnection` | 测试 SMTP 连接 |
| `listEmails`/`getEmailDetail` | 邮件列表/详情 |
| `sendEmail` | 发送邮件（自动匹配客户联系人） |
| `markAsRead`/`toggleStar`/`linkCustomer` | 邮件操作 |
| `syncEmails` | 邮件同步 |
| `getEmailStats` | 邮件统计 |

**关键设计**: EMAIL_PRESETS 内置常见邮箱配置；AES-256-CBC 加密存储；自动通过联系人邮箱反查客户。

#### notificationService.js（~90行）

| 函数 | 说明 |
|------|------|
| `listNotifications` | 通知列表（分页+未读数） |
| `markAsRead`/`markAllAsRead` | 标记已读 |
| `createNotification` | 创建通知 + SSE 实时推送 |

**关键设计**: buildLink 自动生成跳转链接；SSE 实时推送；支持用户/角色双维度投递。

#### reminderService.js（~320行）

| 函数 | 说明 |
|------|------|
| `getMyReminders` | 聚合 5 类提醒（逾期/今日/明日跟进+预警+通知） |
| `getOverdueList` | 逾期客户列表（Boss 全局视角） |
| `markAsRead`/`markAllAsRead` | 标记已读 |
| `dismissReminder` | 解除提醒 |
| `getPaymentOverdue` | 逾期回款+未来3天到期计划 |
| `getReminderCenter` | 通知中心面板（审批/跟进/库存/回款/系统通知） |

**关键设计**: 一次聚合 5 类数据减少请求；OVER() 窗口函数同时获取分类未读数；超时工单按优先级不同阈值。

#### cronService.js（~160行）

| 函数 | 说明 |
|------|------|
| `cleanExpiredLogs` | 清理过期日志（默认90天） |
| `getNearRecycleCustomers` | 即将回收客户列表 |
| `notifyPreReleaseCustomers` | 释放前1天发送提醒+SSE+Markdown通知 |
| `autoReleaseCustomers` | 自动释放到公海（事务保护+SSE通知） |

**关键设计**: 回收天数动态读取 sys_config；事务后发送 SSE。

#### dashboardService.js（~200行）

| 函数 | 说明 |
|------|------|
| `getOverview` | 月度概览（7指标并行查询） |
| `getTodayTasks` | 今日待办（跟进+工单） |
| `getQuickStats` | 快捷统计（公海/合同/回款） |
| `getOverdueStats` | 逾期统计（权限分层） |

**关键设计**: Promise.all 并行 7 查询；管理员/经理看全局，普通用户看自己。

---

### 9b.3 财务/采购/供应商/库存服务

#### financeService.js（~280行）

| 函数 | 说明 |
|------|------|
| `getReminders`/`generateReminders`/`acknowledgeReminder` | 回款提醒管理 |
| `getCustomerReconciliation`/`getSupplierReconciliation`/`saveReconciliation` | 对账管理 |
| `getAnalysis` | 财务分析（利润/账龄/现金流/收款效率） |
| `getAnalysisExport` | 导出 CSV |

**关键设计**: INSERT IGNORE 防重复；财务分析多维度 SQL 聚合。

#### invoiceService.js（~230行）

| 函数 | 说明 |
|------|------|
| `listInvoices`/`getInvoice`/`createInvoice`/`updateInvoice`/`deleteInvoice` | 发票 CRUD |
| `exportInvoices` | 导出 XLSX |

**关键设计**: 编号 INV-YYMMDD-NNN（FOR UPDATE 防并发）；数据权限+字段变更审计。

#### inventoryService.js（~230行）

| 函数 | 说明 |
|------|------|
| `listInventory`/`getMovements` | 库存列表/变动记录 |
| `stockIn`/`stockOut`/`adjustStock` | 入库/出库/盘点（事务+FOR UPDATE） |
| `getAlerts`/`updateAlertConfig` | 库存预警 |
| `getStats`/`getCategories` | 统计/分类 |

**关键设计**: 所有变动操作在事务中执行；FOR UPDATE 行锁保证并发安全。

#### productService.js（~200行）

| 函数 | 说明 |
|------|------|
| `listProducts`/`getProduct`/`getProductFull`/`createProduct`/`updateProduct`/`deleteProduct` | 产品 CRUD |
| `getCategories` | 分类列表 |
| `getProductPrices`/`createPrice`/`updatePrice`/`deletePrice` | 价格表管理 |
| `getDefaultPrice` | 默认价格（优先客户等级匹配，回退基础价格） |

**关键设计**: 多维度定价（客户等级/价格类型/币种/有效期）；价格回退策略。

#### purchaseService.js（~500行）

| 函数 | 说明 |
|------|------|
| `listPlans`/`getPlan`/`createPlan`/`updatePlan`/`deletePlan`/`submitPlan`/`approvePlan` | 采购计划全流程 |
| `autoGenerate` | 根据库存预警自动生成计划（CTE 窗口函数） |
| `convertToPurchase` | 计划按供应商分组转采购单 |
| `listPurchases`/`getPurchase`/`createPurchase` | 采购单 CRUD |
| `updateStatus`/`addReceipt` | 状态更新/收货登记 |
| `getStatistics`/`addPayment` | 统计/付款 |

**关键设计**: 计划转采购单按供应商自动分组；CTE 窗口函数避免 N+1；收货自动流转状态。

#### purchaseRequestService.js（~220行）

| 函数 | 说明 |
|------|------|
| `createRequest`/`listRequests`/`getRequest`/`submitRequest`/`approveRequest`/`rejectRequest`/`cancelRequest` | 采购申请全流程 |

**关键设计**: 状态机驱动（draft→pending→approved/rejected/cancelled）；管理员 vs 申请人权限分离。

#### purchaseComparisonService.js（~200行）

| 函数 | 说明 |
|------|------|
| `createComparison`/`listComparisons`/`getComparisonDetail` | 比价单 CRUD |
| `addSupplierQuote` | 添加供应商报价 |
| `selectSupplier` | 选择供应商（手动或自动最低价→最短交期） |
| `cancelComparison` | 取消比价 |

**关键设计**: 自动选最低总价→最短交期；报价去重。

#### supplierService.js（~400行）

| 函数 | 说明 |
|------|------|
| `listSuppliers`/`getSupplier`/`createSupplier`/`updateSupplier`/`deleteSupplier` | 供应商 CRUD |
| `addContact`/`updateContact`/`deleteContact` | 联系人管理 |
| `addRating` | 评分（自动计算总分） |
| `addQualification`/`updateQualification`/`deleteQualification` | 资质管理（自动状态计算） |
| `getPerformance`/`getRanking`/`getComparison` | 绩效/排名/对比 |

**关键设计**: 编号 SUP-YYMMDD-NNN（FOR UPDATE）；资质状态自动计算；INNER JOIN 子查询避免 N+1。

#### supplierScoringService.js（~280行）

| 函数 | 说明 |
|------|------|
| `calculateQualityScore` | 质量得分（近90天合格率） |
| `calculateDeliveryScore` | 交付得分（近180天准时率） |
| `calculateServiceScore` | 服务得分（上次评分+微调） |
| `calculatePriceScore` | 价格得分（均价偏差） |
| `calculateSupplierScore` | 四维度汇总写回 |
| `checkAllSuppliersScores` | 批量计算 |

**关键设计**: 四维度加权汇总；MySQL 兼容 upsert（SELECT-then-INSERT/UPDATE）。

#### serviceOrderService.js（~360行）

| 函数 | 说明 |
|------|------|
| `listServiceOrders`/`getServiceOrderDetail`/`createServiceOrder`/`updateServiceOrder`/`deleteServiceOrder` | 工单 CRUD |
| `assignServiceOrder`/`batchAssignServiceOrders` | 分配工程师（通知+SSE） |
| `startServiceOrder`/`finishServiceOrder`/`confirmServiceOrder` | 开始/完成/确认评价 |

**关键设计**: 编号 SRV-YYMMDD-NNN；创建校验客户已签约；超时预警按优先级（紧急2h/高4h/中8h/低24h）。

---

### 9b.4 HR/知识/报表/分析服务

#### hrService.js（~290行）

| 函数 | 说明 |
|------|------|
| `getEmployees`/`getEmployee`/`getEmployeeStats` | 员工管理 |
| `saveEmployeeProfile` | 员工档案 UPSERT |
| `getCommissionRules`/`createCommissionRule`/`updateCommissionRule`/`deleteCommissionRule` | 佣金规则 CRUD |
| `calculateCommission` | 佣金计算（合同金额×比例，INSERT IGNORE） |
| `getCommissionRecords`/`getCommissionStats` | 佣金记录/统计 |
| `batchConfirmCommission`/`batchPayCommission` | 批量确认/发放 |
| `getOrgTree`/`getDeptEmployees` | 组织架构 |

**关键设计**: INSERT IGNORE 防重复；UPSERT 员工档案；组织架构内存递归构建。

#### knowledgeService.js（~260行）

| 函数 | 说明 |
|------|------|
| 产品/话术/FAQ/文档四子模块，各含 CRUD（27 个函数） |

**关键设计**: 四子模块统一 CRUD 模式；话术/FAQ 读取时自动递增使用/浏览计数；图片 JSON 数组存储。

#### surveyService.js（~310行）

| 函数 | 说明 |
|------|------|
| `getTemplates`/`createTemplate`/`updateTemplate`/`deleteTemplate`/`initTemplates` | 模板管理 |
| `getCampaigns`/`createCampaign`/`startCampaign`/`closeCampaign` | 活动管理 |
| `submitResponse` | 提交回复（自动解析 NPS/CSAT） |
| `getAnalyticsOverview`/`getCampaignAnalytics` | 分析 |

**关键设计**: 系统模板 is_system 保护；NPS 三分类（推荐者/被动者/贬损者）+净值。

#### competitorService.js（~250行）

| 函数 | 说明 |
|------|------|
| 竞品/交锋/情报三子模块 CRUD（15 个函数） |
| `getAnalysisOverview`/`getComparison` | 分析概览/多竞品对比 |

**关键设计**: 优势/劣势同时接受数组和 JSON 字符串。

#### socialRouteService.js（~140行）

| 函数 | 说明 |
|------|------|
| `listRecords`/`createRecord`/`updateRecord`/`deleteRecord` | 沟通记录 CRUD |
| `getStats`/`getCustomerTimeline` | 统计/时间线 |

**关键设计**: AppError 结构化错误码；删除权限校验。

#### targetService.js（~110行）

| 函数 | 说明 |
|------|------|
| `listTargets`/`setTarget`/`batchSetTarget`/`deleteTarget` | 销售目标管理 |

**关键设计**: UPSERT；事务批量；达成率实时计算。

#### teamDashboardService.js（~340行）

| 函数 | 说明 |
|------|------|
| `getOverview` | 团队总览卡片（客户/商机/合同/回款/目标达成率） |
| `getSalesBreakdown` | 销售实况（多子查询 JOIN 聚合替代 N+1） |
| `getSalesOverdueCustomers`/`getSalesCustomers` | 销售逾期/客户明细 |
| `urgeFollowup` | 催办跟进（防同日重复） |
| `getPendingApprovals` | 待审批列表 |
| `getStuckOpportunities` | 卡住的商机（阶段停留超 N 天） |

**关键设计**: 多子查询 JOIN 聚合替代 N+1；催办防重复；配置驱动天数。

#### analysisService.js（~370行）

| 函数 | 说明 |
|------|------|
| `getPrediction`/`getEnhancedPrediction` | 销售预测（移动平均/线性回归/季节性+置信区间） |
| `getChurnAlert` | 客户流失预警 |
| `getAnomaly` | 异常检测（2σ 准则） |
| `getCustomerScore` | 客户评分（A/B/C/D） |
| `getRFM` | RFM 价值评分 |
| `getRanking` | 销售排行 |
| `getEnhancedSuggestions` | 智能建议（4类，按优先级） |

**关键设计**: 三种预测模型融合；RFM 5 级分制；智能建议含可执行 action。

#### reportAnalyticsService.js（~500行）

| 函数 | 说明 |
|------|------|
| `getSalesFunnel`/`getPerformance`/`getCustomerStats`/`getPaymentStats` | 销售/客户/回款统计 |
| `getSalesTrend`/`getPurchaseTrend`/`getPurchaseBySupplier` | 趋势分析 |
| `exportReport` | 多 Sheet XLSX 导出 |
| `getFinanceReport`/`exportFinance` | 财务报表/CSV 导出 |
| `getBusinessDashboard` | 经营看板（9+组数据并行） |
| `getPurchaseCost`/`getSupplierPerformance` | 采购成本/供应商绩效 |

**关键设计**: Promise.all 并行 9+ 组查询；多 Sheet 导出；权限层级动态 WHERE；来源分布网络渠道合并。

#### customReportService.js（~200行）

| 函数 | 说明 |
|------|------|
| `listReports`/`createReport`/`updateReport`/`deleteReport` | 报表配置 CRUD |
| `getFields` | 数据源字段列表 |
| `runReport` | 动态查询执行（SQL 构建+聚合+筛选+分页） |

**关键设计**: SOURCE_FIELDS 5 种数据源白名单；动态 SQL 构建；所有权校验。

---

### 9b.5 系统/集成/工具服务

#### aiRouteService.js（~170行）

| 函数 | 说明 |
|------|------|
| `getAiStatus` | LLM Provider 状态 |
| `getAiSuggestions`/`submitFeedback`/`generateSuggestions` | AI 建议（三类规则+24h 去重） |
| `executeReadOnlyQuery` | 只读 SQL（危险关键字拦截） |

**关键设计**: 建议生成三类规则+批量查询避免 N+1；SQL 安全兜底校验。

#### automationService.js（~370行）

| 函数 | 说明 |
|------|------|
| 工作流 CRUD + `executeActions`（5种动作）+ `triggerWorkflow`（事件驱动） |
| 分配规则 CRUD + `applyAssignRule`（轮询机制） |
| 智能提醒 CRUD + `runSmartReminder`（扫描+SSE 推送） |

**关键设计**: 动作执行字段白名单 ALLOWED_FIELDS；轮询 round_robin；INSERT IGNORE 去重+SSE。

#### integrationService.js（~170行）

| 函数 | 说明 |
|------|------|
| `listIntegrations`/`updateIntegration` | 集成配置（自动脱敏） |
| `testIntegration` | 测试邮件连接 |
| `sendTestEmail` | 发送测试邮件（HTML 转义防 XSS） |
| `getEmailLog` | 邮件日志 |

**关键设计**: 敏感字段脱敏；`***` 密码保留原值；HTML 转义防 XSS。

#### searchRouteService.js（~90行）

| 函数 | 说明 |
|------|------|
| `globalSearch` | 跨模块搜索（客户/合同/商机/报价，每模块5条） |

**关键设计**: 数据权限复用；结果附 type 标识。

#### scoringRouteService.js（~220行）

| 函数 | 说明 |
|------|------|
| `getRules`/`createRule`/`updateRule`/`deleteRule` | 评分规则 CRUD |
| `calculateScore`/`batchCalculate` | 单/批量评分计算 |
| `getRanking`/`getCustomerScore` | 排行榜/详情 |

**关键设计**: 四种条件操作符（eq/gt/lt/contains）；评分结果先清旧日志再写新。

#### logService.js（~170行）

| 函数 | 说明 |
|------|------|
| `queryTableUsage`/`scanCodeReferences` | 双表使用分析 |
| `cleanupDualLogs` | 清理 sys_log/sys_operation_log 双表并存 |

**关键设计**: rg 优先+Node.js 降级扫描；四种情况判断安全删除。

#### logRouteService.js（~170行）

| 函数 | 说明 |
|------|------|
| `listLogs`/`getLogDetail`/`getModules` | 日志查询 |
| `deleteLogs`/`clearLogs` | 删除/清理 |
| `exportLogs` | 导出 Excel（上限10000） |

**关键设计**: ACTION_TYPE_MAP 操作类型映射；pageSize 上限 200。

#### configRouteService.js（~55行）

| 函数 | 说明 |
|------|------|
| `listConfigs`/`updateConfigs` | 配置 CRUD（更新后清缓存） |
| `testNotification` | 企微通知测试 |

#### deptRouteService.js（~50行）

| 函数 | 说明 |
|------|------|
| `listDepts`/`addDept`/`updateDept`/`deleteDept` | 部门 CRUD（删除前检查子部门+用户） |

#### userRouteService.js（~200行）

| 函数 | 说明 |
|------|------|
| `listUsers`/`addUser`/`updateUser`/`deleteUser`/`getUserDetail` | 用户 CRUD |
| `resetPassword` | 重置密码（强制改密+清缓存） |

**关键设计**: 新建用户强制首登改密；删除用户事务级联（客户释放公海、商机转移上级）。

#### permissionRouteService.js（~190行）

| 函数 | 说明 |
|------|------|
| `getMyPermissions`/`listPermissions` | 权限树 |
| `getRolePermissions`/`updateRolePermissions` | 角色权限（事务更新+清缓存） |
| `getDataScope`/`updateDataScope` | 数据权限 |
| `addPermission`/`updatePermission`/`deletePermission` | 权限节点 CRUD |

**关键设计**: 事务先删再插；更新后清权限缓存+clearMeCache；删除前检查子权限。

#### calendarRouteService.js（~150行）

| 函数 | 说明 |
|------|------|
| `getEvents`/`getEvent`/`createEvent`/`updateEvent`/`deleteEvent`/`completeEvent` | 日程 CRUD |
| `getToday`/`getUpcoming` | 今日/未来7天 |

**关键设计**: 更新/删除所有权校验。

#### contactRouteService.js（~200行）

| 函数 | 说明 |
|------|------|
| `listContacts`/`addContact`/`updateContact`/`deleteContact` | 联系人 CRUD |

**关键设计**: 主联系人自动管理（无主时自动设、设主时取消其他、删主时自动提升）。

#### tagRouteService.js（~70行）

| 函数 | 说明 |
|------|------|
| `listTags`/`getCustomerTags`/`setCustomerTags`/`manageTag` | 标签 CRUD+客户关联 |

**关键设计**: 事务设置客户标签；删除时级联清理。

#### followupTemplateRouteService.js（~110行）

| 函数 | 说明 |
|------|------|
| `listTemplates`/`createTemplate`/`updateTemplate`/`deleteTemplate` | 跟进模板 CRUD |

**关键设计**: VALID_TYPES 白名单（first/quote/deal/general）；创建人权限校验。

#### backupRouteService.js（~160行）

| 函数 | 说明 |
|------|------|
| `createBackup`/`listBackups`/`restoreBackup`/`deleteBackup` | 备份管理 |
| `getConfirmCode` | HMAC-SHA256 确认码 |

**关键设计**: mysqldump/mysql 命令行；HMAC 确认码防误操作。

#### apiPlatformService.js（~100行）

| 函数 | 说明 |
|------|------|
| API Key CRUD + Webhook CRUD + 日志管理 |

**关键设计**: fail_count 累加跟踪失败；日志限制 50 条。

#### uploadRouteService.js（~120行）

| 函数 | 说明 |
|------|------|
| `uploadFile` | 上传（Supabase 优先+本地降级） |
| `listAttachments`/`deleteAttachment` | 附件管理 |

**关键设计**: crypto.randomUUID 防冲突；sanitizeOriginalName 防注入；路径校验防目录穿越。

#### currencyService.js（~70行）

| 函数 | 说明 |
|------|------|
| `listCurrencies`/`getRates`/`updateCurrency`/`deleteCurrency` | 货币管理 |

**关键设计**: 唯一默认货币保证。

#### recycleService.js（~25行）

| 函数 | 说明 |
|------|------|
| `getDeletedStats` | 各模块已删除记录统计 |

**关键设计**: 配置驱动统计，扩展性好。

---

### 10.1 认证路由 auth.js

**文件路径**: `backend/routes/auth.js`  
**依赖**: `express`, `../middleware/auth`, `../middleware/validate`, `../middleware/permission`, `../middleware/csrf`, `../services/authService`, `../middleware/rateLimiter`

#### API 端点

| 方法 | 路径 | 中间件 | 说明 |
|------|------|--------|------|
| GET | `/api/auth/captcha` | — | 获取 SVG 验证码 |
| POST | `/api/auth/login` | `authLimiter`, `validate(loginSchema)` | 用户登录 |
| POST | `/api/auth/logout` | `validate(logoutSchema)` | 用户登出 |
| GET | `/api/auth/me` | `authenticateToken` | 获取当前用户信息 |
| POST | `/api/auth/register` | `authenticateToken`, `checkPermission('system:user:add')`, `validate(registerSchema)` | 注册新用户（仅管理员） |
| GET | `/api/auth/profile` | `authenticateToken` | 获取个人信息 |
| POST | `/api/auth/update-profile` | `authenticateToken`, `validate(updateProfileSchema)` | 修改个人信息 |
| POST | `/api/auth/change-password` | `authenticateToken`, `validate(changePasswordSchema)` | 修改密码 |
| POST | `/api/auth/force-change-password` | `authenticateToken`, `validate(forceChangePasswordSchema)` | 强制修改密码 |
| POST | `/api/auth/refresh` | `validate(refreshSchema)` | 刷新 JWT Token |

#### 登录流程

1. 获取验证码 → 前端展示 SVG
2. POST `/login` → 校验验证码 → 校验用户名密码 → 生成 JWT → 设置 httpOnly Cookie + CSRF Cookie → 返回 `userInfo`
3. 前端后续请求自动携带 Cookie
4. Token 过期 → POST `/refresh` → 旧 Token 加入黑名单 → 签发新 Token

#### Token 刷新机制

- 接受过期但签名有效的 Token
- 检查黑名单
- 查询最新用户状态和角色权限
- 旧 Token 加入黑名单（7 天后过期）
- 签发新 Token + 刷新 CSRF Cookie

---

### 10.2 客户中心三页面路由

#### 10.2.1 正式客户路由 customers.js

**文件路径**: `backend/routes/customers.js`
**挂载路径**: `/api/v1/customers`
**依赖**: `authenticateToken`, `checkPermission`, `checkDataPermission`, `customerController`

| 方法 | 路径 | 权限码 | 中间件 | 说明 |
|------|------|--------|--------|------|
| POST | `/` | `customer:view` | `authenticateToken`, `checkPermission`, `checkDataPermission` | 正式客户列表（分页+筛选） |
| POST | `/list` | `customer:view` | 同上 | 全量客户列表（兼容旧端点） |
| POST | `/add` | `customer:add` | `authenticateToken`, `checkPermission` | 新增客户（contacts 至少1个） |
| POST | `/update` | `customer:edit` | 同上 | 修改客户 |
| POST | `/delete` | `customer:delete` | 同上 | 删除客户（软删） |
| GET | `/detail/:id` | `customer:view` | `authenticateToken`, `checkDataPermission` | 客户详情 |
| POST | `/forward` | `customer:edit` | 同上 | 推进客户状态 |
| POST | `/backward` | `customer:edit` | 同上 | 回退客户状态（含 reason） |
| POST | `/export` | `customer:view` | 同上 | 导出客户列表 |

**业务规则**:
- 正式客户 = `business_status IN ('following','quoted','negotiating','signed') AND pool_status='private'`
- 线索客户（`business_status='lead'`）不在此页面展示
- 旧端点 `/api/v1/customer/*` 保留，内部调用相同 controller

#### 10.2.2 线索路由 leads.js

**文件路径**: `backend/routes/leads.js`
**挂载路径**: `/api/v1/leads`

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| POST | `/` | `leads:view` | 线索列表（`business_status='lead'`，含 lead_level 高/中/低筛选） |
| POST | `/convert` | `leads:convert` | 潜客转正式客户（`business_status` lead→following，写 `crm_assign_log`） |

**旧端点兼容**: `/customer/leads-pool`、`/customer/convert-lead` 保留。

#### 10.2.3 公海路由 pool.js

**文件路径**: `backend/routes/pool.js`
**挂载路径**: `/api/v1/pool`

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| POST | `/` | `pool:view` | 公海列表（`pool_status='sea' AND business_status!='lead'`，含 released_at/released_by） |
| POST | `/claim` | `pool:claim` | 公海认领（设 `pool_status='private'`，7天保护期 `protect_until`） |
| POST | `/release` | `customer:release` | 释放客户到公海（含 reason，线索客户禁止释放） |

**旧端点兼容**: `/customer/pool-list`、`/customer/claim-pool`、`/customer/release-to-pool` 保留。

---

### 10.3 商机路由 opportunity.js

**文件路径**: `backend/routes/opportunity.js`
**挂载路径**: `/api/v1/opportunity`
**依赖**: `authenticateToken`, `checkPermission`, `checkDataPermission`, `opportunityController`

| 方法 | 路径 | 权限码 | 数据权限 | 说明 |
|------|------|--------|----------|------|
| POST | `/list` | — | `opportunity`, `owner_id` | 商机列表（分页+筛选：keyword/stage/customer_id/source_id/owner_id） |
| POST | `/add` | `opportunity:add` | — | 新增商机（需 name + customer_id，stage 默认1） |
| POST | `/update` | `opportunity:edit` | `opportunity`, `owner_id` | 修改商机 |
| POST | `/update-stage` | `opportunity:edit` | 同上 | 推进阶段（1→6，含 change_reason） |
| POST | `/backward-stage` | `opportunity:edit` | 同上 | v1.1 阶段回退（含 change_reason） |
| GET | `/stage-stats/:id` | — | 同上 | 商机阶段停留时间统计 |
| POST | `/delete` | `opportunity:delete` | — | 删除商机 |
| GET | `/detail/:id` | — | `opportunity`, `owner_id` | 商机详情 |
| GET | `/funnel` | — | 同上 | 销售漏斗统计 |
| GET | `/stage-log/:id` | — | 同上 | 商机阶段变更日志 |
| GET | `/timeline/:id` | — | 同上 | 商机销售时间轴（聚合阶段日志+报价+合同） |
| GET | `/sources` | — | — | v1.1 商机来源字典 |
| GET | `/export` | — | `opportunity`, `owner_id` | 导出商机列表（CSV） |

**阶段枚举**: 1=初步接洽, 2=需求分析, 3=方案报价, 4=谈判, 5=成交, 6=丢单

---

### 10.4 报价路由 quote.js

**文件路径**: `backend/routes/quote.js`
**挂载路径**: `/api/v1/quote`
**依赖**: `authenticateToken`, `checkPermission`, `checkDataPermission`, `checkFieldPermission`, `quoteController`, `validate`

**字段级权限**: `router.use(checkFieldPermission('quote'))` — 报价成本价仅管理员可见。

| 方法 | 路径 | 权限码 | 数据权限 | 说明 |
|------|------|--------|----------|------|
| POST | `/add` | `quotation:add` | — | 创建报价单（支持 items/折扣/有效期/币种/汇率） |
| POST | `/list` | `quotation` | `quote`, `create_by` | 报价单列表（含 expiring_count 7天内失效数） |
| GET | `/detail/:id` | — | `quote`, `create_by` | 报价单详情（含 items） |
| POST | `/update` | `quotation:edit` | — | 修改报价单（草稿/失效不可改） |
| POST | `/delete` | `quotation:delete` | — | 删除报价单（已确认不可删；非 ADMIN/MANAGER 且非创建者无权删） |
| POST | `/to-contract` | `quotation:edit` | — | 报价转合同（HT-YYMMDD-NNN 编号，推进商机 stage5） |
| POST | `/approve` | — | — | 审批报价单（仅管理员，approval_status 2=通过/3=驳回） |

**Joi Schemas**:
- `addQuoteSchema`: customer_id/opportunity_id 可选, items 数组可选, discount 0-1, valid_days ≥1, currency/exchange_rate
- `listQuoteSchema`: page/pageSize/quote_no/customer_name/status(1-4)/approval_status(1-3)
- `updateQuoteSchema`: id 必填, items 最少1个, status 1-4
- `approveQuoteSchema`: id + approval_status(2|3) + approval_remark

---

### 10.5 合同路由 contract/

**文件路径**: `backend/routes/contract/` （目录式路由）
**挂载路径**: `/api/v1/contract`
**子模块**: `crud.js` + `payment.js` + `export.js` + `approval.js`，由 `index.js` 聚合挂载

#### 10.5.1 合同 CRUD (crud.js)

**字段级权限**: `router.use(checkFieldPermission('contract'))` — 合同金额仅管理员可见。

| 方法 | 路径 | 权限码 | 数据权限 | 说明 |
|------|------|--------|----------|------|
| POST | `/list` | `contract` | `contract`, `create_by` | 合同列表（分页+筛选：keyword/status/customer_id/approval_status/payment_status），60s 缓存 |
| GET | `/detail/:id` | — | `contract`, `create_by` | 合同详情（含回款计划 plans + 回款记录 payments + paid_total/plan_total） |
| POST | `/add` | `contract:add` | — | 新建合同（需 customer_id+amount，支持 plans 回款计划数组） |
| POST | `/update` | `contract:edit` | — | 修改合同（含 delete_plan_ids 删除回款计划） |
| POST | `/delete` | `contract:delete` | — | 删除合同 |
| POST | `/cancel` | `contract:edit` | — | 取消合同（需 cancel_reason + cancel_action: customer_cancelled/reopen_negotiation/keep_won） |
| GET | `/opportunity-list` | — | `opportunity`, `owner_id` | 获取商机列表（供合同关联选择） |
| GET | `/search` | — | — | 合同搜索（轻量级，供快速回款录入选择） |

**合同状态**: 1=待执行, 2=执行中, 3=已完成（终态）, 4=已取消（终态）

#### 10.5.2 合同审批 (approval.js)

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/approve` | `requireManager` + 控制器层 `roleId IN (1,2)` | 审批合同（approval_status 2=通过/3=驳回，含 approval_remark） |

**纵深防御**: 路由层 `requireManager` 允许 `manageAll=true` 或 `roleId=ADMIN(1)`，控制器层进一步校验 `manageAll || roleId IN (1, 2)`。

#### 10.5.3 合同回款 (payment.js)

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| POST | `/payment/add` | `contract` | 新增回款记录（contract_id + plan_id + pay_date + pay_amount） |
| POST | `/payment/update` | `contract` | 修改回款记录 |
| POST | `/payment/delete` | `contract` | 删除回款记录 |
| POST | `/payment/list` | `contract` | 回款列表（tab: all/overdue/summary + 日期范围筛选） |
| POST | `/payment/merged` | `contract` | 回款合并视图（计划+记录） |
| POST | `/payment/summary` | `contract` | 客户对账汇总 |
| POST | `/payment/statement-export` | `contract` | 对账单导出 |

#### 10.5.4 合同导出 (export.js)

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| POST | `/export` | `contract` | 合同导出（含字段级权限过滤） |
| POST | `/payment/export` | `contract` | 回款导出 |
| POST | `/payment/import` | `contract` | 批量导入回款（Excel，multer 5MB 限制，仅 xlsx/xls/csv） |
| GET | `/payment/import-template` | — | 回款导入模板下载 |

---

### 10.6 跟进路由 followUp.js

**文件路径**: `backend/routes/followUp.js`
**挂载路径**: `/api/v1/follow-up`
**依赖**: `authenticateToken`, `checkPermission`, `checkDataPermission`, `buildDataPermissionWhere`, `followUpService`, `validate`

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| POST | `/add` | `customer:edit` | 添加跟进记录（customer_id + content，支持 contact_id/next_time/attachment_ids） |
| POST | `/batch-add` | `customer:edit` | 批量添加（1-20条，含 customer_id + content + follow_type） |
| POST | `/list` | `followup:calendar` | 获取客户跟进记录列表（分页） |
| GET | `/remind` | `followup:calendar` | 今日待跟进提醒 |
| GET | `/tomorrow` | `followup:calendar` | 明日计划跟进列表 |
| GET | `/overdue` | `followup:calendar` | 逾期未跟进列表 |
| GET | `/task-stats` | `followup:calendar` | 任务统计（今日/明日/逾期数量） |
| POST | `/update` | `customer:edit` | 编辑跟进记录 |
| POST | `/delete` | `customer:delete` | 删除跟进记录 |
| POST | `/calendar` | `followup:calendar` | 跟进日历（按年月查询） |
| POST | `/plan/add` | `customer:edit` | 创建跟进计划（plan_time + plan_content） |
| POST | `/plan/list` | `customer:edit` | 跟进计划列表（status: pending/completed/overdue/cancelled） |
| POST | `/plan/complete` | `customer:edit` | 完成跟进计划（is_plan→0 + 填充完成时间） |
| POST | `/plan/cancel` | — | 取消跟进计划（软删除） |

---

### 10.7 回收站路由 recycle.js

**文件路径**: `backend/routes/recycle.js`
**挂载路径**: `/api/v1/recycle`
**依赖**: `authenticateToken`, `checkPermission`, `requireAdmin`, `softDelete`(utils), `recycleService`, `validate`

**TABLE_CONFIG**: 8 个模块映射（customer→crm_customer/company_name, opportunity→crm_opportunity/name, contract→crm_contract/contract_no, quote→crm_quote/quote_no, supplier→crm_supplier/name, purchase→crm_purchase_order/title, service→crm_service_order/title, product→crm_product/name）

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| POST | `/list` | `recycle_bin:view` | 回收站列表（指定 module 返回该模块已删记录，不指定返回全部模块统计） |
| POST | `/restore` | `data:restore` | 恢复记录（需管理员） |
| POST | `/permanent-delete` | `data:restore` | 彻底删除（需管理员） |

---

### 10.8 标签路由 tag.js

**文件路径**: `backend/routes/tag.js`
**挂载路径**: `/api/v1/tag`
**依赖**: `authenticateToken`, `checkPermission`, `requireManager`, `tagRouteService`, `validate`

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| GET | `/list` | `tag` | 获取所有标签 |
| GET | `/customer/:customerId` | `tag` | 获取客户的标签 |
| POST | `/customer/:customerId` | `tag` + `requireManager` | 设置客户标签（tag_ids 数组） |
| POST | `/manage` | `tag` + `requireManager` | 管理标签（action: add/update/delete，name + color #RRGGBB） |

---

### 10.9 合同模板路由 contractTemplate.js

**文件路径**: `backend/routes/contractTemplate.js`
**挂载路径**: `/api/v1/contract-template`
**依赖**: `authenticateToken`, `checkPermission`, `requireManager`, `contractTemplateService`, `validate`

| 方法 | 路径 | 权限码 | 说明 |
|------|------|--------|------|
| GET | `/list` | `contract_template` | 获取模板列表 |
| GET | `/:id` | `contract_template` | 获取模板详情 |
| POST | `/manage` | `contract_template` + `requireManager` | 管理模板（action: add/update/delete，name + amount + payment_terms + delivery_days） |

---

### 10.10 全部路由挂载清单

以下为 `app.js` 中 `apiRouter.use(...)` 注册的全部路由（不含模块域挂载）：

| 挂载路径 | 路由文件 | 功能域 |
|---------|----------|--------|
| `/auth` | `routes/auth.js` | 认证管理 |
| `/user` | `routes/user.js` | 用户管理 |
| `/leads` | `routes/leads.js` | 线索管理 |
| `/pool` | `routes/pool.js` | 公海管理 |
| `/customers` | `routes/customers.js` | 正式客户管理 |
| `/follow-up` | `routes/followUp.js` | 跟进管理 |
| `/opportunity` | `routes/opportunity.js` | 商机管理 |
| `/quote` | `routes/quote.js` | 报价管理 |
| `/contract` | `routes/contract/index.js` | 合同管理（含 CRUD/审批/回款/导出） |
| `/service` | `routes/service.js` | 工单管理 |
| `/supplier` | `routes/supplier.js` | 供应商管理 |
| `/purchase` | `routes/purchase.js` + `purchase/request` + `purchase/comparison` | 采购管理 |
| `/role` | `routes/role.js` | 角色管理 |
| `/dept` | `routes/dept.js` | 部门管理 |
| `/log` | `routes/log.js` | 日志管理 |
| `/team-dashboard` | `routes/teamDashboard.js` | 团队仪表盘 |
| `/reminder` | `routes/reminder.js` | 提醒管理 |
| `/notification` | `routes/notification.js` | 通知管理 |
| `/config` | `routes/config.js` | 系统配置 |
| `/target` | `routes/target.js` | 目标管理 |
| `/permission` | `routes/permission.js` | 权限管理 |
| `/recycle` | `routes/recycle.js` | 回收站 |
| `/backup` | `routes/backup.js` | 备份管理 |
| `/ai` | `routes/ai.js` | AI 助手 |
| `/analysis` | `routes/analysis.js` | 数据分析 |
| `/integration` | `routes/integration.js` | 集成管理 |
| `/upload` | `routes/upload.js` | 文件上传 |
| `/search` | `routes/search.js` | 全局搜索 |
| `/tag` | `routes/tag.js` | 标签管理 |
| `/contract-template` | `routes/contractTemplate.js` | 合同模板 |
| `/followup-templates` | `routes/followupTemplate.js` | 跟进模板 |
| `/scoring` | `routes/scoring.js` | 客户评分 |
| `/approval` | `routes/approval.js` | 审批管理 |
| `/knowledge` | `routes/knowledge.js` | 知识库 |
| `/inventory` | `routes/inventory.js` | 库存管理 |
| `/sse` | `routes/sse.js` | SSE 实时推送 |
| `/procurement-plan` | `routes/procurement-plan.js` | 采购计划 |
| `/finance` | `routes/finance-enhanced.js` | 财务管理 |
| `/hr` | `routes/hr.js` | 人事管理 |
| `/automation` | `routes/automation.js` | 自动化流程 |
| `/calendar` | `routes/calendar.js` | 日历管理 |
| `/social` | `routes/social.js` | 社交管理 |
| `/platform` | `routes/api-platform.js` | API 平台 |
| `/competitor` | `routes/competitor.js` | 竞争对手 |
| `/currency` | `routes/currency.js` | 币种管理 |
| `/email` | `routes/email.js` | 邮件管理 |
| `/invoice` | `routes/invoice.js` | 发票管理 |
| `/cron` | `routes/cronJobs.js` | 定时任务管理 |
| `/metrics` | `routes/metrics.js` | 指标监控 |
| `/survey` | `routes/survey.js` | 问卷调研 |

---

## 10c. 路由层补充文档（P2 批量）

> 以下为 P2 阶段批量文档化的 60 个路由文件，按批次分组。此前已文档化的 10 个路由（customers/leads/pool/opportunity/quote/followUp/recycle/tag/contractTemplate/auth）见 §10.1-§10.10。

### 10c.1 AI/分析/平台/审批/自动化/备份/日历/竞品/配置/定时/货币/数据质量

#### ai.js（~230行，/api/v1/ai）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | /chat | permission:ai | AI对话，60s超时 |
| GET | /status | permission:ai | AI服务状态+模型列表 |
| POST | /query | permission:ai | Text-to-SQL（只读库执行） |
| GET | /suggestions | permission:ai | AI建议列表 |
| POST | /suggestion/feedback | permission:ai | 标记采纳/拒绝 |
| POST | /generate-suggestions | permission:ai | 触发建议生成 |

**关键设计**: SQL安全多层防护（白名单SELECT/禁UNION/只读连接池/LIMIT 50）；AbortController超时控制。

#### analysis.js（~134行，/api/v1/analysis）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /prediction | permission:analysis+requireManager | 销售预测（基础版） |
| GET | /prediction/enhanced | permission:analysis+requireManager | 增强版预测（months_ahead 1-12） |
| GET | /churn-alert | permission:analysis+requireManager | 客户流失预警 |
| GET | /anomaly | permission:analysis+requireManager | 异常检测 |
| GET | /customer-score/:id | permission:analysis+requireManager | 单客户评分 |
| GET | /win-rate | permission:analysis+requireManager | 赢单率分析 |
| GET | /funnel | permission:analysis+requireManager | 销售漏斗 |
| GET | /rfm | permission:analysis+requireManager | RFM价值评分 |
| GET | /ranking | permission:analysis+requireManager | 销售排行 |
| GET | /suggestions/enhanced | permission:analysis+requireManager | 智能建议 |

**关键设计**: 统一双重拦截（analysis权限+requireManager）；业务全委托analysisService。

#### api-platform.js（~266行，/api/v1/platform）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET/POST/PUT/DELETE | /keys | requireAdmin | API密钥CRUD（密钥脱敏） |
| POST | /keys/:id/regenerate | requireAdmin | 重新生成密钥对 |
| GET/POST/PUT/DELETE | /webhooks | requireAdmin | Webhook CRUD（secret脱敏） |
| POST | /webhooks/:id/test | requireAdmin | 测试Webhook（含SSRF防护） |
| GET | /webhooks/:id/logs | requireAdmin | 调用日志 |
| GET | /docs | authenticateToken | API文档概览 |

**关键设计**: crypto.randomBytes生成密钥；SSRF防护（拒绝内网IP/云元数据地址）；动态UPDATE拼接。

#### approval.js（~436行，/api/v1/approval）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET/POST/PUT/DELETE | /workflows | permission:approval | 工作流CRUD |
| POST | /submit | permission:approval | 提交审批 |
| POST | /approve/:id | permission:approval | 审批通过 |
| POST | /reject/:id | permission:approval | 审批驳回 |
| DELETE | /withdraw/:business_type/:business_id | permission:approval | 撤回审批 |
| GET | /detail/:business_type/:business_id | permission:approval | 审批详情 |
| GET | /detail-with-history/... | permission:approval | 详情+客户历史 |
| GET | /my-pending | permission:approval | 待审批列表 |
| GET | /my-submitted | permission:approval | 已提交列表 |
| POST | /batch-approve | permission:approval | 批量通过 |
| POST | /batch-reject | permission:approval | 批量驳回 |

**关键设计**: 四种业务类型(quote/contract/purchase/discount)；多步骤流程；manageAll跨部门审批。

#### automation.js（~328行，/api/v1/automation）

20个端点，三大子模块：工作流规则CRUD+执行+日志、自动分配规则CRUD+执行、智能提醒CRUD+执行+待处理。全部requireAdmin。

**关键设计**: 分配策略round_robin/by_source/by_region；智能提醒4类型；事件驱动触发。

#### backup.js（~91行，/api/v1/backup）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | /create | requireAdmin+backup:add | 创建备份（异步） |
| POST | /list | backup:add | 备份列表 |
| POST | /restore | requireAdmin+backup:restore | 恢复（需confirm_code） |
| GET | /confirm-code/:id | requireAdmin+backup:restore | 获取确认码 |
| POST | /delete | requireAdmin+backup:add | 删除备份 |

**关键设计**: 两步确认恢复机制；异步创建。

#### calendar.js（~141行，/api/v1/calendar）

8个端点：事件CRUD+完成标记+今日/未来7天。事件类型meeting/task/reminder/other。支持关联客户/联系人。

#### competitor.js（~260行，/api/v1/competitor）

16个端点：竞品档案CRUD+交锋记录CRUD+竞争情报CRUD+分析总览/多竞品对比。权限分层view/add/edit/delete。

#### config.js（~66行，/api/v1/config）

4个端点：逾期天数查询/配置列表/批量更新/通知测试。逾期天数为公共配置无需权限码。

#### cronJobs.js（~79行，/api/v1/cron）

4个端点：每日评分/日志清理(90天)/公海回收/提醒生成。替代node-cron，兼容Vercel Cron。

#### currency.js（~59行，/api/v1/currency）

4个端点：列表/汇率/更新(requireAdmin)/删除(requireManager)。查询接口全员可用。

#### dataQuality.js（~58行，/api/v1/data-quality）

2个端点：质量检查/质量报告。支持crm_customer/crm_supplier两表。权限点data_quality:check。

---

### 10c.2 部门/邮件/财务/跟进模板/HR/集成/库存/发票/知识库/日志/指标/通知

#### dept.js（~75行，/api/v1/dept）

4个端点：列表(system:dept)/增删改(requireAdmin)。删除时检查子部门依赖。

#### email.js（~180行，/api/v1/email）

13个端点：邮箱账号CRUD+连接测试+邮件列表/详情/发送/回复/已读/星标/关联客户/同步/统计。email与email:send分级权限。回复自动推导收件人和Re:主题。

#### finance-enhanced.js（~135行，/api/v1/finance-enhanced）

10个端点：回款提醒CRUD+客户/供应商对账+财务分析+CSV导出（BOM头）。统一finance权限。

#### followupTemplate.js（~85行，/api/v1/followup-templates）

4个端点：模板CRUD。创建需requireManager，更新/删除需requireAdmin。类型first/quote/deal/general。

#### hr.js（~265行，/api/v1/hr）

17个端点：员工管理+佣金规则CRUD+计算/记录/统计/批量确认/发放+组织架构。统一hr+requireManager。内嵌完整Swagger。

#### integration.js（~95行，/api/v1/integration）

5个端点：集成配置列表/更新/邮件测试/发送测试邮件/邮件日志。test容错设计返回状态不抛错。

#### inventory.js（~130行，/api/v1/inventory）

9个端点：库存列表/变动记录/入库/出库/盘点/预警/阈值配置/统计/分类。出入库复用purchase:add权限。双校验机制(queryValidate+validate)。

#### invoice.js（~120行，/api/v1/invoice）

6个端点：发票CRUD+导出。checkDataPermission(create_by)数据级权限。金额precision(2)。

#### knowledge.js（~460行，/api/v1/knowledge）

25个端点：四子模块（产品/话术/FAQ/文档）各CRUD+统计+文档下载。产品管理需requireAdmin，话术/FAQ/文档仅需登录。cache(300)+invalidateCache。文件上传限20MB，删除同步删物理文件防路径穿越。

#### log.js（~90行，/api/v1/log）

6个端点：日志列表/详情/模块列表/批量删除/清理/导出。删除清理导出需requireAdmin。多维筛选。清理1-365天。

#### metrics.js（~35行，/api/v1/metrics）

1个端点：POST /client上报性能指标。自动建表(sys_client_perf)，Joi校验metric_type/value。返回204。

#### notification.js（~65行，/api/v1/notification）

4个端点：通知列表/标记已读/全部已读/未读数。router.use统一权限notification。unread-count轻量设计便于轮询。

---

### 10c.3 权限/采购计划/产品/采购/比价/采购申请/提醒/报表分析/自定义报表/仪表盘/角色/评分

#### permission.js（~170行，/api/v1/permission）

9个端点：个人权限/权限树/角色权限/数据权限/权限节点CRUD。个人查询仅需认证，列表查看需requireManager，写操作需requireAdmin。权限节点支持menu/button/api三种类型。

#### procurement-plan.js（~175行，/api/v1/procurement-plan）

10个端点：计划CRUD+提交审批+批准(requireAdmin)+自动生成(requireAdmin)+统计+转采购单。创建需purchase:add权限。

#### product.js（~260行，/api/v1/product）

11个端点：产品CRUD+分类+价格表CRUD+客户对应价格。字段级权限(checkFieldPermission('product'))成本价仅管理员可见。列表cache(120)+invalidateCache。四种价格类型(retail/wholesale/vip/custom)。

#### purchase.js（~340行，/api/v1/purchase）

7个端点：采购单列表/详情/创建/状态更新/收货/统计/付款。checkDataPermission('purchase','owner_id')数据权限。字段级权限采购明细仅管理员可见。状态流转：草稿→待审核→已确认→部分收货→已完成/已取消。

#### purchase/comparison.js（~110行，/api/v1/purchase/comparison）

6个端点：比价单列表/创建/详情/添加报价/选择供应商/取消。统一authenticateToken+checkPermission('purchase:comparison')。支持手动或自动选最低价→最短交期。

#### purchase/request.js（~110行，/api/v1/purchase/request）

6个端点：申请列表/创建/提交/批准/驳回(需reason)/撤销。统一authenticateToken+checkPermission('purchase:request')。状态draft→pending→approved/rejected→ordered/cancelled。

#### reminder.js（~260行，/api/v1/reminder）

12个端点：我的提醒/逾期客户/标记已读/全部已读/解除/逾期回款/通知操作/通知列表/通知中心面板。角色分级(isBoss全局 vs 个人)。通知中心聚合5类数据。

#### report/analytics.js（~310行，/api/v1/report）

14个端点：销售漏斗(cache600)/业绩/客户/回款/销售趋势/逾期客户/采购趋势/按供应商/成本/供应商绩效/导出Excel/财务报表/CSV导出/经营看板。部分接口仅需authenticateToken。

#### report/custom.js（~120行，/api/v1/report）

6个端点：自定义报表CRUD+字段列表+执行。JSON配置(columns_config/filter_config/chart_config)。所有权校验(manageAll可操作全部)。

#### report/dashboard.js（~60行，/api/v1/report）

4个端点：概览(cache600)/今日待办(cache30)/快捷统计(cache120)/逾期统计。差异化缓存策略。按userId/roleId个性化。

#### role.js（~80行，/api/v1/role）

4个端点：角色CRUD。列表需system:role，写操作需requireAdmin。更新删除后清权限缓存。

#### scoring.js（~200行，/api/v1/scoring）

12个端点：客户评分规则CRUD+单/批量计算+排行榜+详情；供应商评分计算+批量+评分查询。统一scoring权限，规则管理需requireAdmin，计算需requireManager。条件操作符eq/gt/lt/contains。

---

### 10c.4 搜索/工单/社媒/SSE/供应商/调查/目标/团队看板/上传/用户/客户分配/客户中心

#### search.js（/api/v1/search）

1个端点：GET /global全局跨模块搜索。Joi校验keyword 2-100字符。数据权限过滤。

#### service.js（~260行，/api/v1/service）

14个端点：工单CRUD+分配/批量分配(上限50)+开始/完成/确认+类型/状态/优先级列表。状态流转：待分配→已分配→处理中→待确认→已完成。满意度1-5评分。

#### social.js（/api/v1/social）

6个端点：沟通记录CRUD+统计+客户时间线。删除校验manageAll。支持platform/direction/content/attachment。RESTful PUT/DELETE风格。

#### sse.js（/api/v1/sse）

1个端点：GET /notifications SSE长连接。Cookie认证(EventSource不支持自定义Header)。30秒心跳防断连。X-Accel-Buffering:no禁Nginx缓冲。连接生命周期自动管理。

#### supplier.js（~560行，/api/v1/supplier）

17个端点：供应商CRUD+联系人CRUD+资质CRUD+评分+选项/绩效/排行/对比。字段级权限(checkFieldPermission('supplier'))。列表cache(300)。四维评分(质量/交期/服务/价格 0-5)。GET+POST双模式列表。

#### survey.js（~280行，/api/v1/survey）

15个端点：模板CRUD+初始化预设+活动CRUD+启动/关闭+公开回复+回复列表+分析。三层架构(模板→活动→回复)。回复公开接口双层限流(IP全局+IP+campaign_id)。系统模板不可改删。

#### target.js（/api/v1/target）

4个端点：目标列表(含达成率)/设置/批量设置/删除。年月维度，年份2020-2030。列表全员可查，设置删除需target权限。

#### teamDashboard.js（~160行，/api/v1/team-dashboard）

7个端点：总览/销售实况/逾期客户下钻/客户下钻/催办(防同日重复)/待审批/卡住商机。isBoss判断(viewAll+ADMIN_ROLE_CODES)。催办duplicate错误码。

#### upload.js（~130行，/api/v1/upload）

4个端点：上传文件/兼容旧路径/附件列表/删除。magic bytes双层校验(multer fileFilter+file-type库)。10MB限制。memoryStorage兼容Serverless。关联business_type/business_id。

#### user.js（~140行，/api/v1/user）

6个端点：用户CRUD+详情+重置密码。删除逻辑删除+级联(客户释放公海、商机转移)。重置后强制改密。密码不返回。

#### customer/assign.js（~140行，/api/v1/customer）

15个端点：分配/批量分配(上限100)+日志+销售用户/下属+规则CRUD+自动分配+认领/批量认领(上限20)+释放/批量释放(上限100)+公海日志。分配策略round_robin/by_source/by_region。

#### customer/center.js（~100行，/api/v1/customer）

6个端点：潜客池/正式客户/公海池列表+潜客转正式+释放到公海+领取公海。三页面按business_status区分。潜客和正式客户有数据权限，公海全员可见。

---

### 10c.5 客户子路由/模块注册/聚合路由

#### customer/contact.js（~85行，/api/v1/customer/contact）

4个端点：联系人CRUD。通过canManageCustomer校验客户管理权。支持决策人/首要联系人双标记。

#### customer/detail.js（~279行，/api/v1/customer）

11个端点：客户CRUD+详情+360视图+导出+状态推进/回退+逾期/即将回收列表。checkDataPermission('customer','owner_id')。createCache(300)列表缓存。导出VALID_SOURCES/SOURCE_PARENT_MAP/canManageCustomer供复用。

#### customer/import.js（~97行，/api/v1/customer）

4个端点：模板下载/异步导入(202)/预览/确认。multer memoryStorage+10MB+.xlsx/.xls/.csv。异步导入通过enqueue消息队列。

#### customer/index.js（~29行，聚合路由）

聚合挂载5个子路由：detail(/) + contact(/contact) + assign(/) + import(/) + center(/)。额外端点POST /convert-to-customer。废弃pool.js/leads.js/quality.js不再挂载。

#### customer/module.js（~21行，模块注册）

ModuleRegistry.register('customer', {routes, permissions})。10个权限点：customer:list/add/edit/delete/view/assign/import/release + pool:view/claim。

#### dataManagement/module.js（~17行，模块注册）

ModuleRegistry.register('data-quality', {routes, permissions})。1个权限点：data_quality:check。从客户/评分模块剥离为独立数据管理域。

#### product/module.js（~15行，模块注册）

ModuleRegistry.register('product', {routes, permissions})。4个权限点：product/product:add/product:edit/product:delete。

#### report/index.js（~10行，聚合路由）

聚合挂载3个子路由：custom(/) + dashboard(/) + analytics(/)。扁平/api/v1/report/*路径。聚合层不认证。

#### report/module.js（~12行，模块注册）

ModuleRegistry.register('report', {routes, permissions})。1个权限点：report。粗粒度权限。

#### contract/index.js（~11行，聚合路由）

聚合挂载4个子路由：crud(/) + payment(/) + export(/) + approval(/)。扁平/api/v1/contract/*路径。

---

## 10b. 控制器层 (Controllers)

> 控制器为薄控制器模式：仅负责取参 → 调 service → 审计日志 → res.json，错误一律 next(error) 交由全局错误中间件处理。唯一允许的"翻译点"：`ER_DUP_ENTRY` → `AppError(BUSINESS_VALIDATION)`。

### 10b.1 客户控制器 customerController.js

**文件路径**: `backend/controllers/customerController.js`  
**导出方法数**: 34  
**依赖 Service**: `customerService`, `customerDetailService`, `leadsService`, `assignService`, `poolService`, `importService`  
**依赖中间件**: `buildDataPermissionWhere`, `invalidateCache`, `logAction`, `logFieldChanges`

#### 方法清单

**客户 CRUD**:

| 方法 | 说明 | 数据权限 | 审计日志 | 缓存失效 |
|------|------|----------|----------|----------|
| `list` | 正式客户列表 | ✅ buildDataPermissionWhere('c') | — | — |
| `create` | 新增客户（检测重复） | — | ✅ 'add' | ✅ customer:list:userId:* |
| `update` | 修改客户 | — | ✅ 'update' + logFieldChanges | ✅ |
| `remove` | 删除客户（软删） | — | ✅ 'delete' | ✅ |
| `detail` | 客户详情 | ✅ | — | — |
| `view360` | 客户 360° 视图 | — | — | — |
| `exportCustomers` | 导出 Excel | ✅ | ✅ 'export' | — |
| `forward` | 状态推进 | — | ✅ rawLogAction | ✅ |
| `backward` | 状态回退（含 reason） | — | ✅ rawLogAction | ✅ |

**线索管理**:

| 方法 | 说明 | 审计 |
|------|------|------|
| `listLeads` | 线索列表 | — |
| `convertLead` | 潜客转正式 | ✅ 'convert' |
| `batchConvertLeads` | 批量转化 | ✅ 'batch-convert' |
| `importLeads` | 导入线索 | ✅ 'import' |
| `claimLead` | 领取线索 | ✅ 'claim-lead' |
| `markLeadLost` | 标记流失 | — |
| `getLeadsStats` | 线索统计 | — |

**分配管理**:

| 方法 | 说明 | 审计 |
|------|------|------|
| `assign` | 手动分配客户 | ✅ 'assign' |
| `batchAssign` | 批量分配 | ✅ 'batch-assign' |
| `listAssignLogs` | 分配日志 | — |
| `createAssignRule` | 创建分配规则 | ✅ 'add-assign-rule' |
| `updateAssignRule` | 更新规则 | ✅ 'update-assign-rule' |
| `deleteAssignRule` | 删除规则 | ✅ 'delete-assign-rule' |
| `autoAssign` | 轮询自动分配 | ✅ 'auto-assign' |
| `getAssignRules` | 规则列表 | — |
| `getSalesUsers` | 销售人员列表 | — |
| `getMySubordinates` | 我的下属 | — |

**公海管理**:

| 方法 | 说明 | 审计 |
|------|------|------|
| `claim` | 认领客户 | ✅ 'claim' |
| `batchClaim` | 批量认领 | ✅ 'batch-claim' |
| `release` | 释放到公海 | ✅ 'release' |
| `batchRelease` | 批量释放 | ✅ 'batch-release' |
| `listPoolLogs` | 公海日志 | — |

**导入**:

| 方法 | 说明 |
|------|------|
| `importPreview` | Excel 预览（multer buffer） |
| `importConfirm` | 确认导入（返回 success/duplicates/invalid） |

**Phase 2 三页面**:

| 方法 | 说明 | 数据权限 |
|------|------|----------|
| `listLeadPool` | 线索池列表 | ✅ |
| `listFormal` | 正式客户列表 | ✅ |
| `listPoolNew` | 公海池列表 | ✅ |
| `convertLeadToFormal` | 潜客转正式 | — |
| `releaseToPool` | 释放到公海 | — |
| `claimPool` | 领取公海客户 | — |

#### 错误处理
- `ER_DUP_ENTRY` → `translateDupEntry()` 返回 `AppError(BUSINESS_VALIDATION)`
- 其余错误一律 `next(error)` 透传

---

### 10b.2 商机控制器 opportunityController.js

**文件路径**: `backend/controllers/opportunityController.js`  
**导出方法数**: 14  
**依赖 Service**: `opportunityService`  
**依赖中间件**: `buildDataPermissionWhere`, `logFieldChanges`

#### 方法清单

| 方法 | 说明 | 数据权限 | 特殊逻辑 |
|------|------|----------|----------|
| `list` | 商机列表 | ✅ buildDataPermissionWhere('o') | 返回 page/pageSize ||
| `add` | 新增商机 | — | — |
| `update` | 修改商机 | ✅ | 先查 getOpportunityWithPermission 校验存在+权限，403/400 自定义响应 |
| `updateStage` | 推进阶段 | ✅ | 返回旧阶段名→新阶段名 |
| `backwardStage` | v1.1 回退阶段 | ✅ | 同上 |
| `getSources` | 来源字典 | — | — |
| `exportOpportunities` | CSV 导出 | ✅ | UTF-8 BOM + 最多 10000 条 |
| `stageLog` | 阶段日志 | — | 无权限校验（路由层挂载 checkDataPermission 版本为 stageLogWithPermission） |
| `stageStats` | 阶段停留统计 | ✅ | 先校验存在 |
| `delete` | 删除商机 | — | 权限校验：manageAll 或 ADMIN_ROLE_CODES 或 owner_id === userId |
| `detail` | 商机详情 | ✅ | 不存在返回 404 |
| `funnel` | 销售漏斗 | ✅ | — |
| `stageLogWithPermission` | 阶段日志（带权限） | ✅ | 先校验存在，返回 from/to 阶段名 |
| `timeline` | 销售时间轴 | ✅ | 先校验存在 |

#### 设计模式
- 阶段推进/回退返回友好消息：`阶段已从"初步接洽"推进至"需求分析"`
- 导出使用 CSV（避免 exceljs 依赖），UTF-8 BOM 头确保 Excel 中文识别

---

### 10b.3 报价控制器 quoteController.js

**文件路径**: `backend/controllers/quoteController.js`  
**导出方法数**: 7  
**依赖 Service**: `quoteService`  
**依赖中间件**: `buildDataPermissionWhere`, `stripRestrictedFields`, `logFieldChanges`

#### 方法清单

| 方法 | 说明 | 数据权限 | 字段过滤 | 特殊逻辑 |
|------|------|----------|----------|----------|
| `add` | 创建报价单 | — | — | 校验 customer_id + items 非空 |
| `list` | 报价单列表 | ✅ buildDataPermissionWhere('q') | ✅ stripRestrictedFields | — |
| `detail` | 报价单详情 | ✅ | ✅ | 不存在返回 404 |
| `update` | 修改报价单 | — | — | logFieldChanges + allowedFields 白名单 |
| `remove` | 删除报价单 | — | — | 权限下沉到 service 层（ADMIN/MANAGER/创建者） |
| `toContract` | 报价转合同 | — | — | 调用 quoteService.convertToContract |
| `approve` | 审批报价单 | — | — | 仅 manageAll 或 ADMIN_ROLE_CODES，approval_status 2/3 |

#### 权限设计
- `approve` 使用 `manageAll` + `roleCode` 双重校验（与 contractController 保持一致）
- `list`/`detail` 使用 `stripRestrictedFields` 过滤成本价等敏感字段

---

### 10b.4 合同控制器 contractController.js

**文件路径**: `backend/controllers/contractController.js`  
**导出方法数**: 19  
**依赖 Service**: `contractService`, `contractCrudService`, `contractPaymentService`, `opportunityService`, `approvalService`, `contractExportService`  
**依赖中间件**: `buildDataPermissionWhere`, `stripRestrictedFields`, `invalidateCache`, `logAction`, `logFieldChanges`

#### 方法清单

**合同 CRUD**:

| 方法 | 说明 | 数据权限 | 字段过滤 | 审计 | 缓存 |
|------|------|----------|----------|------|------|
| `listContracts` | 合同列表 | ✅ buildDataPermissionWhere('c') | ✅ stripRestrictedFields | — | 60s 缓存（路由层） |
| `getContractDetail` | 合同详情 | ✅ | ✅ | — | — |
| `createContract` | 新建合同 | — | — | ✅ 'add' | — |
| `updateContract` | 修改合同 | — | — | ✅ 'update' + logFieldChanges | ✅ cache:*:/api/contract/* |
| `deleteContract` | 删除合同 | — | — | ✅ 'delete' | ✅ |
| `getOpportunityList` | 关联商机列表 | ✅ buildDataPermissionWhere('o') | — | — | — |
| `searchContracts` | 合同搜索（轻量级） | — | ✅ | — | — |

**合同取消**:

| 方法 | 说明 | 联动商机 |
|------|------|----------|
| `cancelContract` | 取消合同 | ✅ customer_cancelled→stage6(丢单), reopen_negotiation→stage4(谈判), keep_won→不变更 |

**合同审批**:

| 方法 | 说明 | 权限 |
|------|------|------|
| `approveContract` | 审批合同 | manageAll 或 ADMIN_ROLE_CODES，approval_status 2/3 |

**回款管理**:

| 方法 | 说明 | 审计 |
|------|------|------|
| `addPayment` | 登记回款 | ✅ 'add' |
| `updatePayment` | 修改回款 | ✅ 'update' |
| `deletePayment` | 删除回款 | ✅ 'delete' |
| `listPayments` | 回款列表（tab: all/overdue/summary） | — |
| `getMergedPayments` | 合并回款视图（计划+记录） | — |
| `getPaymentSummary` | 对账汇总 | — |
| `exportStatement` | 对账单导出（Excel） | ✅ 'export' |

**导出/导入**:

| 方法 | 说明 | 审计 |
|------|------|------|
| `exportContracts` | 合同导出（Excel） | ✅ 'export' |
| `exportPayments` | 回款导出（Excel） | ✅ 'export' |
| `importPayments` | 批量导入回款（Excel, multer 5MB） | — |
| `downloadPaymentImportTemplate` | 回款导入模板下载 | — |

#### 设计模式
- `cancelContract` 联动商机阶段：根据 cancel_action 决定推进商机到 stage6/4/不变更
- `approveContract` 使用 `manageAll` + `roleCode` 双重校验（禁止依赖固定数字 roleId）
- `createContract` 后异步创建审批通知（不阻塞主流程）
- 导入模板使用 XLSX 库动态生成

---

## 11b. 前端详细文档（P3 批量）

> 以下为 P3 阶段批量文档化的前端文件，分三组：API 请求层（28 文件）、基础设施（composables/directives/utils/router/constants/main，12 文件）、Composables 剩余（7 文件）。

### 11b.1 API 请求层 — 大型模块

#### customer.js（~120行，52函数）

**职责**: 客户全生命周期管理，涵盖客户 CRUD、联系人、跟进记录、商机、分配规则、导入预览与客户评分

**关键设计**: 双轨制端点——新 `/customers/*` 用于核心 CRUD，旧 `/customer/*` 保留兼容层；跟进记录与商机管理内聚于同一模块形成"客户→跟进→商机"业务闭环；导入流程拆分为 preview + confirm 两步。

**核心函数**: getCustomerList/getFormalCustomers/getCustomerDetail/addCustomer/updateCustomer/deleteCustomer/assignCustomer/batchAssignCustomer/forwardCustomer/backwardCustomer/exportCustomers/addContact/updateContact/deleteContact/getSalesUsers/getMySubordinates/getCustomer360/releaseCustomer/getAssignRules/createAssignRule/updateAssignRule/deleteAssignRule/getCustomerTemplate/importPreview/importConfirm/calculateCustomerScore/getFollowUpList/addFollowUp/updateFollowUp/deleteFollowUp/getFollowupTemplates/saveFollowupTemplate/deleteFollowupTemplate/getFollowUpCalendar/getTodayReminders/getTomorrowTasks/getFollowUpPlans/addFollowUpPlan/completeFollowUpPlan/cancelFollowUpPlan/batchAddFollowUp/getFollowUpTaskStats/getOverdueCustomers/getNearRecycleCustomers/getOpportunityList/addOpportunity/updateOpportunity/deleteOpportunity/updateOpportunityStage/getSalesFunnel/getOpportunityDetail/getOpportunityStageLog

#### product.js（~120行，49函数）

**职责**: 产品、库存、供应商、采购及采购计划的一体化供应链管理

**关键设计**: 五大子域（产品/库存/供应商/采购/采购计划）内聚于单文件；供应商含联系人、资质、评分三级子实体；采购计划支持自动生成、审批流转、一键转采购单。

#### system.js（~170行，72函数）

**职责**: 系统级基础设施——用户/角色/部门/权限 RBAC、操作日志、备份恢复、服务工单、币种、系统配置、第三方集成、API 平台、标签、评分规则、销售目标及团队仪表盘

**关键设计**: RBAC 四层模型（用户-角色-部门-权限）；服务工单完整流转（分配→开始→完成→确认）；API 平台 Key/Webhook 双通道；saveUser/saveRole 采用"单函数双模式"设计自动路由新增或更新。

#### report.js（~75行，33函数）

**职责**: 报表统计与数据分析——销售漏斗、回款、业绩、客户分析、采购报表、自定义报表及预测分析

**关键设计**: 标准报表覆盖五大维度；数据分析提供 RFM/预测/异常检测/流失预警；自定义报表支持完整生命周期；导出统一通过 `responseType: 'blob'`。

#### contract.js（~55行，23函数）

**职责**: 合同全生命周期管理、回款管理及报价管理（报价→合同→回款业务链）

**关键设计**: `quoteToContract` 实现报价到合同一键转化；回款支持汇总、合并视图及对账单导出。

#### knowledge.js（~55行，25函数）

**职责**: 知识库多类型内容管理——话术、FAQ、产品知识、文档资料及统计

**关键设计**: 四大内容类型各自独立 CRUD；文档上传支持 `config` 参数透传 `onUploadProgress`。

#### hr.js（~55行，22函数）

**职责**: 人力资源管理（员工、组织架构、提成）与财务管理（催款提醒、对账）

**关键设计**: 提成模块支持规则配置→计算→批量确认→批量支付完整流程；财务对账区分供应商和客户两个维度。

#### index.js（~5行）

**职责**: API 模块统一入口，导出共享的 request 实例

---

### 11b.2 API 请求层 — 中型模块

| 模块 | 行数 | 函数数 | 职责 | 关键设计 |
|------|------|--------|------|----------|
| approval.js | ~15 | 13 | 审批流程发起/查询/审批/驳回/批量操作/工作流配置 | 类型+ID 双参数定位；单条与批量两种模式 |
| automation.js | ~19 | 16 | 工作流/智能提醒/分配规则三大自动化能力 | 三子域各提供 CRUD + 执行/触发双维度 |
| competitor.js | ~15 | 12 | 竞品信息/接触事件/情报 CRUD + 分析概览 | 主资源+子资源 RESTful 嵌套设计 |
| email.js | ~15 | 13 | 邮件收发/邮箱账户管理/同步/标记/星标/客户关联 | 邮件与 CRM 客户关联绑定 |
| survey.js | ~16 | 13 | 调查模板/活动/答卷回收/分析 | 模板→活动→答卷三级层次 |
| pool.js | ~20 | 3 | 公海池列表/认领/释放（Phase 5 独立端点） | 认领自动设 7 天保护期 |
| leads.js | ~16 | 2 | 潜客池列表/转正式（Phase 5 独立端点） | 单向状态流转 lead→following |
| opportunity.js | ~13 | 4 | 商机时间轴/详情/阶段日志/阶段统计 | 纯只读分析模块 |
| reminder.js | ~9 | 6 | 通知列表/已读标记/提醒中心/逾期付款 | 全局视角与个人视角互补 |
| auth.js | ~11 | 8 | 登录/登出/个人信息/密码修改/验证码 | getMe 与 getProfile 分离 |

---

### 11b.3 API 请求层 — 小型模块

| 模块 | 行数 | 函数数 | 职责 | 关键设计 |
|------|------|--------|------|----------|
| ai.js | ~10 | 6 | AI 建议/对话/查询/状态 | aiQuery/aiChat 额外接收 config 支持流式 |
| analytics.js | ~15 | 4 | 销售总览/漏斗/合同收入/回款统计 | 数据权限由后端 RBAC 控制，前端无权限参数 |
| purchaseComparison.js | ~15 | 6 | 比价单 CRUD + 供应商选择/取消 | 列表查询使用 POST |
| purchaseRequest.js | ~15 | 6 | 采购申请创建/提交/审批/撤销 | 驳回和撤销均通过 body 传 reason |
| search.js | ~4 | 1 | 全局跨模块关键字搜索 | 极简单文件，仅一个 GET |
| social.js | ~8 | 4 | 社媒沟通记录 CRUD + 统计 | 标准 CRUD 结构 |
| notification.js | ~8 | 4 | 通知列表/已读/全部已读/未读计数 | 未读计数独立接口适合轮询 |
| recycle.js | ~6 | 3 | 回收站列表/恢复/永久删除 | 恢复和删除通过 body 便于批量扩展 |
| calendar.js | ~8 | 4 | 日程事件 CRUD | 删除通过 body 传 id |
| dataQuality.js | ~5 | 2 | 数据质量检查/报告 | 从客户模块剥离独立为数据管理域 |

---

### 11b.4 前端基础设施

#### request.js（~155行）

**职责**: 封装 Axios 实例，统一处理请求拦截、响应拦截、CSRF 防护与 401 Token 续期队列

**关键设计**: 认证完全依赖 httpOnly Cookie（`withCredentials: true`），前端不存储 Token；401 时通过原生 Axios 调用 `/auth/refresh` 续期，`isRefreshing` 锁 + `refreshSubscribers` 队列避免并发重复刷新；非 GET 请求自动注入 `X-CSRF-Token` 头（double-submit cookie 模式）；导出 get/post/put/del 四个语义化方法。

#### sse.js（~95行）

**职责**: 管理 SSE 连接，支持多组件监听、指数退避重连与主动断开

**关键设计**: `EventSource` + `withCredentials` 携带 Cookie；`stopped` 标志区分主动断开（登出）与异常断开，仅异常触发重连；指数退避 `1000 * 2^attempts` 上限 30 秒，最大 10 次；`messageCallbacks` Set 实现一对多分发。

#### permission.js（~55行，utils）

**职责**: 功能权限与数据权限运行时检查

**关键设计**: 权限数据来源于 `useUser()` 的 `userInfo`（内存态），不依赖 localStorage；`manageAll` 标识超级管理员直接放行；提供 hasPermission/hasAnyPermission/hasAllPermissions/hasDataPermission 四个检查函数。

#### sanitize.js（~30行，utils）

**职责**: 懒加载 DOMPurify 并对 HTML 字符串进行 XSS 净化

**关键设计**: DOMPurify（~134KB）按需懒加载；白名单仅允许常见排版标签和 `href/target/rel/class` 属性；`ADD_ATTR: ['target']` 配合 `rel="noopener"` 防御 reverse tabnabbing。

#### time.js（~55行）

**职责**: 统一全局时间格式化

**关键设计**: 三档时间展示——`formatRelativeTime`（列表页相对时间）、`formatFullTime`（详情页完整时间）、`formatRelativeNextTime`（跟进页逾期/未来时间）；按时间差梯度智能选择展示格式。

#### perfume.js（~25行）

**职责**: 采集 Web Vitals 核心性能指标并上报后端

**关键设计**: 采集 FCP/LCP/CLS/INP/TTFB 五项指标；`sendBeacon` 异步上报不阻塞页面卸载；仅生产环境上报。

#### permission.js（~55行，directives）

**职责**: 注册 Vue 自定义指令实现模板级权限控制

**关键设计**: 三种指令——`v-permission`（任一权限即显示）、`v-permission:all`（全部权限才显示）、`v-permission:disabled`（无权限时禁用而非移除）。

#### sanitize.js（~12行，directives）

**职责**: 注册 `v-safe-html` 指令，自动净化 HTML 后再写入 innerHTML

**关键设计**: `mounted` 和 `updated` 均为 async，等待 DOMPurify 懒加载；`updated` 对比 binding.value 避免重复净化。

#### router/index.js（~280行）

**职责**: 定义全部前端路由表与全局路由守卫

**关键设计**: 路由懒加载全覆盖；`meta` 三层控制（public/permission/admin）；`beforeEach` 守卫链：公开页面放行→验证登录→强制改密检查→管理员权限检查→菜单权限检查；无权限跳转登录页避免重定向循环。

#### main.js（~45行）

**职责**: 创建 Vue 应用实例，注册插件、指令，配置全局错误处理并挂载

**关键设计**: Element Plus 样式按需导入（仅 message/message-box）；全局 `errorHandler` 生产环境动态加载 ElMessage 避免白屏；`initPerfume()` 启动性能采集。

#### constants/source.js（~80行）

**职责**: 统一定义客户来源分组映射、表单选项、搜索选项与报表颜色

**关键设计**: 数据库存储叶子值不存父级；`SOURCE_PARENT_MAP` 用于后端筛选展开；颜色映射覆盖每个叶子值和父分组。

#### composables/useUser.js（~50行）

**职责**: 全局用户状态管理——认证校验、用户信息存取、派生权限计算

**关键设计**: 模块级 `userInfo` 全局单例，多组件共享；权限信息仅内存不持久化；`verifyAuth` "检查一次"策略 + 空 userInfo 时允许重新请求；派生属性 isBoss/isAdmin/canViewAll/canClaim 通过 computed 自动响应。

---

### 11b.5 Composables 剩余

| 模块 | 行数 | 职责 | 关键设计 |
|------|------|------|----------|
| useAssign.js | ~40 | 客户分配/批量分配 | ElMessage 统一提示；try/finally 保证 loading 重置 |
| useChart.js | ~50 | ECharts 多图表生命周期 | onMounted 注册 resize 监听，onUnmounted dispose 防泄漏 |
| useCountUp.js | ~30 | 数字缓动滚动动画 | 三次方缓出曲线 easeOutCubic；16ms 间隔≈60fps |
| useECharts.js | ~15 | ECharts 按需模块化加载 | tree-shaking 仅注册 5 图表+7 组件+Canvas 渲染器 |
| useFormat.js | ~20 | 时间/金额格式化+逾期判断 | 纯函数无 Vue 依赖；原生 toLocaleString 中文格式化 |
| useLevel.js | ~15 | 客户等级 A/B/C/D 映射 | Object.entries 派生 OPTIONS 保证一致性 |
| useRecentVisit.js | ~70 | 基于 localStorage 的最近访问记录 | 去重+最多 10 条+30 天过期惰性清理 |

---

## 12b. 脚本工具文档（P3）

### 12b.1 Python 脚本

| 脚本 | 行数 | 职责 | 关键设计 |
|------|------|------|----------|
| analyze_backup.py | ~70 | 解析 SQL 备份按模块统计各表行数 | 正则匹配 INSERT INTO；按 11 个业务模块分类 |
| import_backup.py | ~90 | SSH 连接 NAS 检查 Docker/备份/数据库状态 | paramiko SSH；NAS_PWD 强制环境变量；分步检查不执行导入 |
| import_to_nas.py | ~150 | 上传 SQL 到 NAS 并导入 Docker MySQL 容器 | 3 种冲突策略（INSERT IGNORE/DELETE+INSERT/SKIP）；SSH 管道上传+大小校验；导入后验证 |
| prepare_import_sql.py | ~90 | 为 INSERT 添加显式列名兼容生产 schema | 正则解析 CREATE TABLE 提取列名；INSERT→INSERT IGNORE + 显式列名 |
| verify_import.py | ~50 | 验证 35 张备份表是否已导入 | information_schema 查 TABLE_ROWS>0；引号转义与 import_to_nas 一致 |
| fix_and_import_hr.py | ~90 | 修复 HR 数据双重 UTF-8 编码并转 REPLACE | encode('latin-1').decode('utf-8') 反转；排除规则跳过非中文；INSERT→REPLACE INTO |
| count_check.py | ~30 | 对 9 张缺失表执行精确 COUNT(*) | 与 verify_import 互补——后者粗略本脚本精确 |

### 12b.2 Shell 脚本

| 脚本 | 行数 | 职责 | 关键设计 |
|------|------|------|----------|
| check-bundle.sh | ~30 | 检查前端 dist 体积/完整性/sourcemap | set -e 关键错误退出；体积/sourcemap 为 warning 不阻断 |
| smoke-test.sh | ~40 | 部署后 4 项 HTTP 端点冒烟测试 | curl 5 秒超时；覆盖无认证端点；支持 BASE_URL 参数 |

---

## 11. 前端架构概览

### 目录结构

```
frontend/
├── src/
│   ├── api/           # API 请求层（30+ 模块）
│   ├── assets/        # 静态资源
│   ├── components/    # 公共组件
│   │   ├── common/    # 通用组件（ErrorBoundary, StateWrapper）
│   │   ├── customer/  # 客户组件
│   │   ├── dashboard/ # 仪表盘组件
│   │   └── layout/    # 布局组件（HeaderBar, Sidebar, ...）
│   ├── composables/   # 组合式函数（10 个）
│   ├── constants/     # 前端常量
│   ├── directives/    # 自定义指令（permission, sanitize）
│   ├── router/        # Vue Router 路由配置
│   ├── tests/         # 前端测试
│   ├── utils/         # 工具函数
│   └── views/         # 页面视图（80+ 页面）
├── e2e/               # E2E 测试（Playwright）
├── vite.config.js     # Vite 构建配置
└── vitest.config.js   # Vitest 测试配置
```

### 前端核心模块

| 模块 | 文件 | 说明 |
|------|------|------|
| API 请求封装 | `utils/request.js` | Axios 封装，含拦截器、错误处理 |
| 路由 | `router/index.js` | Vue Router 路由表 + 权限守卫 |
| 权限指令 | `directives/permission.js` | `v-permission` 指令 |
| XSS 防护 | `directives/sanitize.js` / `utils/sanitize.js` | 输入消毒 |
| SSE 客户端 | `utils/sse.js` | Server-Sent Events 客户端 |
| 时间工具 | `utils/time.js` | 时间格式化 |
| 权限工具 | `utils/permission.js` | 前端权限判断 |
| 性能监控 | `utils/perfume.js` | Performance API 封装 |

### Composables

| 函数 | 说明 |
|------|------|
| `useAssign` | 分配相关逻辑 |
| `useChart` / `useECharts` | ECharts 图表 |
| `useCountUp` | 数字动画 |
| `useFormat` | 格式化 |
| `useLevel` | 等级 |
| `useRecentVisit` | 最近访问 |
| `useRelativeTime` | 相对时间 |
| `useTable` | 表格通用逻辑 |
| `useUser` | 用户信息 |

---

## 12. API 响应格式规范

### 统一三元组

所有 API 响应均遵循以下格式：

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

### 分页响应

```json
{
  "code": 200,
  "message": "查询成功",
  "data": {
    "list": [],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

### 错误响应

```json
{
  "code": 401004,
  "message": "用户名或密码错误",
  "data": null
}
```

### 校验错误响应

```json
{
  "code": 400001,
  "message": "请求参数校验失败",
  "data": [
    { "field": "username", "message": "\"username\" is required" }
  ]
}
```

---

## 13. 文档覆盖率报告

### 已文档化模块

| 层级 | 模块数 | 已文档化 | 覆盖率 |
|------|--------|---------|--------|
| 中间件 | 12 | 10 | 83% |
| 配置 | 4 | 3 | 75% |
| 错误处理 | 2 | 2 | 100% |
| 工具 | 18 | 18 | 100% |
| 常量 | 3 | 2 | 67% |
| 核心 | 1 | 1 | 100% |
| 服务 | 65 | 55 | 85% |
| 路由 | 50 | 50 | 100% |
| 控制器 | 4 | 4 | 100% |
| 前端 API 层 | 28 | 28 | 100% |
| 前端基础设施 | 12 | 12 | 100% |
| Composables | 8 | 8 | 100% |
| 脚本 | 9 | 9 | 100% |

### 待补充文档（优先级排序）

1. **P0**: ~~`services/customerService.js` 完整 API（部分已覆盖）~~ ✅ 已完成
2. **P0**: ~~`services/opportunityService.js` / `services/contractService.js` / `services/quoteService.js`~~ ✅ 已完成
3. **P0**: ~~`routes/customers.js` / `routes/opportunity.js` / `routes/contract.js` / `routes/quote.js` / `routes/followUp.js` / `routes/recycle.js` / `routes/tag.js` / `routes/contractTemplate.js`~~ ✅ 已完成
4. **P1**: ~~`utils/mask.js` / `utils/llmClient.js` / `utils/notification.js`~~ ✅ 已完成
5. **P1**: ~~`controllers/` 全部控制器（4 个文件）~~ ✅ 已完成
6. **P1**: ~~`utils/` 剩余 9 个工具文件（config/csvExport/dataCleaner/fieldLog/qualification-reminder/queryHelper/queue/scoring/supabaseStorage）~~ ✅ 已完成
7. ~~**P2**: `services/` 其余服务文件（50 个，5 批子代理并行完成）~~ ✅ 已完成
8. ~~**P2**: `routes/` 其余路由文件（40+ 个，5 批子代理并行完成）~~ ✅ 已完成
9. ~~**P2**: `frontend/src/api/` API 请求层（28 文件，5 批子代理并行完成）~~ ✅ 已完成
10. ~~**P3**: `frontend/src/utils/` + `directives/` + `router/` + `main.js` + `constants/` + `composables/`（19 文件）~~ ✅ 已完成
11. ~~**P3**: `scripts/` Python + Shell 脚本（9 文件）~~ ✅ 已完成

---

## 14. 维护与更新指南

### 更新触发条件

| 触发事件 | 需更新章节 |
|---------|-----------|
| 新增/修改中间件 | §3 中间件层 |
| 新增/修改配置 | §4 配置层 |
| 新增/修改错误码 | §5.2 ErrorCodes |
| 新增/修改工具函数 | §6 工具层 |
| 新增/修改业务常量 | §7 常量层 |
| 新增/修改服务 | §9 服务层 |
| 新增/修改路由 | §10 路由层 |
| API 响应格式变更 | §12 API 响应格式规范 |
| 新增模块/页面 | §11 前端架构概览 |

### 文档编写规范

1. **每个模块必须包含**：文件路径、模块概述、API 列表（函数签名 + 参数表 + 返回值）、依赖说明
2. **代码示例**：关键函数提供使用示例
3. **安全设计**：涉及认证、权限、SQL 注入防护的模块需单独说明安全设计
4. **错误处理**：列出所有可能的错误码和 HTTP 状态码
5. **缓存策略**：涉及缓存的模块需说明缓存 Key、TTL、降级策略

### 同步更新检查清单

- [ ] 代码变更是否影响了 API 签名（参数/返回值）？
- [ ] 是否新增/删除了错误码？
- [ ] 是否新增/修改了中间件？
- [ ] 数据库表结构是否变更？
- [ ] 环境变量是否新增/废弃？
- [ ] 安全策略是否变更？
- [ ] 缓存策略是否变更？
- [ ] 本文档的覆盖率报告是否需要更新？

---

> 📌 **本文档由代码文学家自动生成，基于 `C:\huakey-crm` 项目源码分析。如需补充特定模块的详细文档，请指定模块路径。**

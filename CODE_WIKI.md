# 铧旗 CRM 系统 (huakey-crm) - Code Wiki

> 项目路径：`C:\huakey-crm`  
> 技术栈：Vue 3 + Element Plus + Express + MySQL  
> 文档生成日期：2026-05-20

---

## 目录

1. [项目概述](#1-项目概述)
2. [项目架构](#2-项目架构)
3. [目录结构](#3-目录结构)
4. [后端模块详解](#4-后端模块详解)
5. [前端模块详解](#5-前端模块详解)
6. [数据库设计](#6-数据库设计)
7. [API 接口文档](#7-api-接口文档)
8. [认证与授权](#8-认证与授权)
9. [依赖关系](#9-依赖关系)
10. [项目运行方式](#10-项目运行方式)
11. [部署说明](#11-部署说明)

---

## 1. 项目概述

铧旗 CRM 系统是一款面向 B2B 销售场景的**前后端分离**客户关系管理 Web 应用。系统围绕"线索 → 客户 → 商机 → 报价 → 合同 → 回款 → 售后"的完整销售流程设计，支持多角色权限管理和数据看板分析。

### 核心功能模块

| 模块 | 说明 |
|------|------|
| 线索管理 | 潜在客户线索的录入、分配、转化 |
| 客户管理 | 客户信息、联系人、跟进记录、客户池（公海） |
| 商机管理 | 销售机会跟踪，含阶段、金额、赢单率 |
| 产品管理 | 产品目录、价格、库存管理 |
| 报价管理 | 报价单生成、编辑、发送 |
| 合同管理 | 合同签订、执行跟踪 |
| 售后服务 | 服务工单、满意度评价 |
| 数据报表 | 销售统计、漏斗分析、趋势图表 |
| 团队看板 | 团队业绩概览 |
| 系统管理 | 用户、角色、部门、操作日志 |

### 默认账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 超级管理员 | admin | admin123 |

---

## 2. 项目架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                           客户端 (Browser)                            │
│              Vue 3 + Element Plus + ECharts + Pinia                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP
┌──────────────────────────────▼──────────────────────────────────────┐
│                      Nginx (前端静态资源 + 反向代理)                    │
│                    80 端口 → /api 转发到后端                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                    Express API Server (Node.js)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │   路由层     │  │  JWT 认证    │  │      MySQL 连接池            │  │
│  │  (routes/)  │  │ (middleware)│  │   (mysql2/promise)          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │  操作日志    │  │   文件上传   │  │      Excel 导入导出          │  │
│  │ (logger.js) │  │  (multer)   │  │       (xlsx.js)             │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                         MySQL 8.0 / MariaDB                          │
│     sys_dept / sys_role / sys_user / crm_customer / crm_contact      │
│     crm_opportunity / crm_quote / crm_contract / crm_service_order   │
│     crm_follow_up / sys_log / crm_pool_log ...                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 架构特点

- **前后端分离**：Vue 3 SPA + Express RESTful API
- **JWT 认证**：基于 Token 的无状态身份验证，默认 7 天有效期
- **RBAC 权限**：基于角色的访问控制，支持 view_all / manage_all 权限标记
- **MySQL 数据库**：完整的关系型数据库设计，含外键约束和索引优化
- **操作日志**：自动记录所有 API 请求，支持按模块/动作/状态筛选
- **数据权限**：客户数据共享查看，编辑权限按负责人/管理员控制
- **客户池机制**：公海客户认领/释放，含保护期机制

---

## 3. 目录结构

```
huakey-crm/
│
├── backend/                    # 后端服务 (Express)
│   ├── config/
│   │   ├── config.default.js   # 默认配置（端口、JWT、数据库、Redis）
│   │   └── database.js         # MySQL 连接池配置
│   ├── middleware/
│   │   ├── auth.js             # JWT 认证中间件 + Token 生成
│   │   └── logger.js           # 操作日志中间件 + 全局自动日志
│   ├── routes/                 # API 路由模块
│   │   ├── auth.js             # 认证（登录/登出/注册/个人信息）
│   │   ├── user.js             # 用户管理
│   │   ├── customer.js         # 客户管理（含导入导出）
│   │   ├── followUp.js         # 跟进记录
│   │   ├── opportunity.js      # 商机管理
│   │   ├── product.js          # 产品管理
│   │   ├── quote.js            # 报价管理
│   │   ├── contract.js         # 合同管理
│   │   ├── service.js          # 售后服务
│   │   ├── report.js           # 数据报表
│   │   ├── role.js             # 角色管理
│   │   ├── dept.js             # 部门管理
│   │   ├── log.js              # 操作日志查询
│   │   ├── teamDashboard.js    # 团队看板
│   │   └── reminder.js         # 提醒/待办
│   ├── src/
│   │   └── routes/auth.js      # 认证路由（旧目录，与 routes/ 重复）
│   ├── uploads/                # 上传文件临时目录
│   ├── scripts/                # 运维脚本
│   ├── app.js                  # Express 应用主入口
│   ├── (server.js 已移除，直接使用 app.js)
│   ├── package.json            # Node.js 依赖
│   └── Dockerfile              # 后端 Docker 构建
│
├── frontend/                   # 前端应用 (Vue 3)
│   ├── public/
│   │   └── logo.png            # 系统 Logo
│   ├── src/
│   │   ├── assets/
│   │   │   ├── Logo.vue        # Logo 组件
│   │   │   └── styles/
│   │   │       └── theme.css   # 全局主题样式
│   │   ├── components/
│   │   │   └── CustomerImport.vue  # 客户导入组件
│   │   ├── composables/        # Vue 组合式函数
│   │   │   ├── useAssign.js    # 分配逻辑
│   │   │   ├── useCountUp.js   # 数字动画
│   │   │   ├── useFormat.js    # 格式化工具
│   │   │   ├── useLevel.js     # 客户等级
│   │   │   ├── useRelativeTime.js  # 相对时间
│   │   │   ├── useTable.js     # 表格逻辑
│   │   │   └── useUser.js      # 用户相关
│   │   ├── constants/
│   │   │   └── source.js       # 客户来源常量定义
│   │   ├── pages/              # 页面组件（旧目录）
│   │   ├── router/
│   │   │   └── index.js        # Vue Router 配置
│   │   ├── services/           # API 服务（旧目录）
│   │   ├── store/              # Pinia Store（旧目录）
│   │   ├── stores/
│   │   │   └── user.js         # 用户状态管理
│   │   ├── utils/
│   │   │   └── request.js      # Axios 封装 + 拦截器
│   │   ├── views/              # 页面视图组件
│   │   │   ├── layout/
│   │   │   │   └── index.vue   # 主布局（侧边栏 + 顶部）
│   │   │   ├── login/
│   │   │   │   └── index.vue   # 登录页
│   │   │   ├── Dashboard.vue   # 首页数据看板
│   │   │   ├── TeamDashboard.vue   # 团队看板
│   │   │   ├── leads/
│   │   │   │   └── Index.vue   # 线索管理
│   │   │   ├── customer/
│   │   │   │   ├── list.vue    # 客户列表
│   │   │   │   ├── detail.vue  # 客户详情
│   │   │   │   └── pool.vue    # 客户池
│   │   │   ├── opportunity/
│   │   │   │   └── list.vue    # 商机列表
│   │   │   ├── product/
│   │   │   │   └── index.vue   # 产品管理
│   │   │   ├── quotation/
│   │   │   │   ├── list.vue    # 报价列表
│   │   │   │   └── edit.vue    # 报价编辑
│   │   │   ├── contract/
│   │   │   │   └── list.vue    # 合同列表
│   │   │   ├── service/
│   │   │   │   └── index.vue   # 售后服务
│   │   │   ├── report/
│   │   │   │   └── index.vue   # 数据报表
│   │   │   ├── profile/
│   │   │   │   └── index.vue   # 个人中心
│   │   │   ├── settings/
│   │   │   │   └── index.vue   # 系统设置
│   │   │   ├── system/
│   │   │   │   ├── user.vue    # 用户管理
│   │   │   │   ├── role.vue    # 角色管理
│   │   │   │   ├── dept.vue    # 部门管理
│   │   │   │   └── log.vue     # 操作日志
│   │   │   └── NotFound.vue    # 404 页面
│   │   ├── App.vue             # 根组件
│   │   └── main.js             # 应用入口
│   ├── dist/                   # 构建产物（生产环境）
│   ├── index.html              # HTML 模板
│   ├── vite.config.js          # Vite 配置
│   ├── nginx.conf              # Nginx 配置（Docker 用）
│   ├── package.json            # Node.js 依赖
│   └── Dockerfile              # 前端 Docker 构建
│
├── database/                   # 数据库脚本
│   ├── backups/                # 数据库备份
│   ├── migrations/             # 迁移脚本
│   ├── seeds/                  # 种子数据
│   ├── init.sql                # 系统表初始化（部门/角色/用户）
│   ├── customer.sql            # 客户表 + 联系人表
│   ├── follow_up.sql           # 跟进记录表
│   ├── opportunity.sql         # 商机表
│   ├── quote.sql               # 产品表 + 报价表
│   └── business_tables.sql     # 合同/回款/服务工单/公海日志
│
├── docker/                     # Docker 数据卷
│   └── data/
│       ├── mysql/              # MySQL 持久化数据
│       └── redis/              # Redis 持久化数据
│
├── scripts/                    # 项目级脚本
├── deploy_package/             # 部署包
├── docker-compose.yml          # Docker Compose 编排
├── .env.example                # 环境变量示例
├── DEPLOY.md                   # NAS 部署指南
├── NAS_DEPLOY_STEP_BY_STEP.md  # NAS 详细部署步骤
└── CLAUDE.md                   # AI 编码规范
```

---

## 4. 后端模块详解

### 4.1 主应用入口 [backend/app.js](file:///c:/huakey-crm/backend/app.js)

#### 全局配置

| 配置项 | 来源 | 说明 |
|--------|------|------|
| `PORT` | 环境变量 / 默认 5000 | 服务端口 |
| `NODE_ENV` | 环境变量 | production 时强制要求 JWT_SECRET |
| `CORS` | 开发: `*` / 生产: 配置项 | 跨域配置 |

#### 统一响应格式中间件

```javascript
res.success(data, message)   // → { code: 200, message, data }
res.error(message, code)     // → { code, message, data: null }
```

#### 路由挂载

所有路由以 `/api` 为前缀：

| 路径前缀 | 路由文件 | 说明 |
|----------|----------|------|
| `/api/auth` | auth.js | 登录/登出/注册/个人信息/修改密码 |
| `/api/user` | user.js | 用户 CRUD |
| `/api/customer` | customer.js | 客户 CRUD + 导入导出 + 客户池 |
| `/api/follow-up` | followUp.js | 跟进记录 |
| `/api/opportunity` | opportunity.js | 商机管理 |
| `/api/product` | product.js | 产品管理 |
| `/api/quote` | quote.js | 报价管理 |
| `/api/contract` | contract.js | 合同管理 |
| `/api/service` | service.js | 售后服务 |
| `/api/role` | role.js | 角色管理 |
| `/api/dept` | dept.js | 部门管理 |
| `/api/report` | report.js | 数据报表 |
| `/api/log` | log.js | 操作日志查询 |
| `/api/team-dashboard` | teamDashboard.js | 团队看板 |
| `/api/reminder` | reminder.js | 提醒/待办 |

### 4.2 认证中间件 [backend/middleware/auth.js](file:///c:/huakey-crm/backend/middleware/auth.js)

```javascript
authenticateToken(req, res, next)
```
- **作用**：验证请求头中的 JWT Token
- **Header**：`Authorization: Bearer <token>`
- **错误处理**：区分 Token 过期 / 无效 / 验证失败
- **注入信息**：将解码后的用户信息注入 `req.user`

```javascript
generateToken(user)
```
- **作用**：生成 JWT Token
- **载荷**：`{ userId, username, roleId, viewAll, manageAll }`
- **过期时间**：默认 7 天（`JWT_EXPIRES_IN` 环境变量）

### 4.3 日志中间件 [backend/middleware/logger.js](file:///c:/huakey-crm/backend/middleware/logger.js)

#### 核心功能

| 函数 | 说明 |
|------|------|
| `logAction()` | 手动记录操作日志 |
| `globalLogMiddleware()` | 全局自动日志中间件，记录所有 API 请求 |
| `logMiddleware(module)` | 模块级日志中间件 |

#### 日志字段

- `module`: 模块名称（客户管理/商机管理/系统管理等）
- `action`: 操作类型（查询/新增/编辑/删除/登录等）
- `method`: HTTP 方法
- `url`: 请求路径
- `params`: 请求参数（截断 2000 字符）
- `ip_address`: 客户端 IP
- `user_id` / `user_name`: 操作用户
- `status`: 1=成功, 0=失败
- `error_msg`: 错误信息

#### 自动跳过日志的路径

- `/api/log/*` — 避免循环记录
- `/api/health`, `/api/` — 健康检查
- `/api/auth/login`, `/api/auth/logout` — 认证路由自行记录

### 4.4 数据库配置 [backend/config/database.js](file:///c:/huakey-crm/backend/config/database.js)

使用 `mysql2/promise` 创建连接池：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| host | localhost | 数据库主机 |
| port | 3306 | 端口 |
| user | crm_user | 用户名 |
| password | Huakey@2024 | 密码 |
| database | huakey_crm | 数据库名 |
| connectionLimit | 10 | 最大连接数 |

### 4.5 认证路由 [backend/src/routes/auth.js](file:///c:/huakey-crm/backend/src/routes/auth.js)

| 接口 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/auth/login` | POST | 用户登录，返回 JWT | 公开 |
| `/api/auth/logout` | POST | 用户登出 | 需登录 |
| `/api/auth/register` | POST | 注册新用户 | 仅管理员 |
| `/api/auth/profile` | GET | 获取当前用户信息 | 需登录 |
| `/api/auth/update-profile` | POST | 修改个人信息 | 需登录 |
| `/api/auth/change-password` | POST | 修改密码 | 需登录 |

**密码安全**：使用 `bcryptjs` 进行哈希（salt rounds = 10）

### 4.6 用户路由 [backend/routes/user.js](file:///c:/huakey-crm/backend/routes/user.js)

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/user/list` | POST | 用户列表（分页 + 筛选） |
| `/api/user/add` | POST | 新增用户 |
| `/api/user/update` | POST | 修改用户 |
| `/api/user/delete` | POST | 删除用户（逻辑删除，status=0） |
| `/api/user/detail/:id` | GET | 用户详情 |

### 4.7 客户路由 [backend/routes/customer.js](file:///c:/huakey-crm/backend/routes/customer.js)

**数据权限设计**：
- **查看权限**：所有登录用户均可查看全部客户（共享客户池）
- **编辑权限**：仅客户负责人、管理员、老板可编辑

**核心接口**：

| 接口 | 说明 |
|------|------|
| `POST /api/customer/list` | 客户列表（分页 + 多条件筛选） |
| `GET /api/customer/detail/:id` | 客户详情（含联系人、跟进记录） |
| `POST /api/customer/add` | 新增客户 |
| `POST /api/customer/update` | 修改客户 |
| `POST /api/customer/delete` | 删除客户 |
| `POST /api/customer/import` | Excel 导入客户 |
| `POST /api/customer/export` | Excel 导出客户 |
| `POST /api/customer/claim` | 认领公海客户 |
| `POST /api/customer/release` | 释放客户到公海 |

**客户来源常量**（应用层校验）：
- `展会`
- `网络` → Facebook / Instagram / LinkedIn / 独立站 / 其他网络渠道
- `转介绍`
- `电话`
- `其他`

---

## 5. 前端模块详解

### 5.1 应用入口 [frontend/src/main.js](file:///c:/huakey-crm/frontend/src/main.js)

```javascript
// 技术栈初始化
createApp(App)
  .use(createPinia())      // 状态管理
  .use(router)              // 路由
  .use(ElementPlus)         // UI 组件库
  .mount('#app')
```

**Axios 配置**：
- 基础 URL：`/api`
- 请求拦截器：自动附加 `Authorization: Bearer <token>`
- 响应拦截器：401 自动清除登录状态并跳转登录页

### 5.2 路由配置 [frontend/src/router/index.js](file:///c:/huakey-crm/frontend/src/router/index.js)

**路由模式**：`createWebHistory`（History 模式）

**路由守卫**：
- `meta.public` 标记的页面无需登录
- 其他页面必须携带有效 Token

**路由结构**：

| 路径 | 组件 | 说明 |
|------|------|------|
| `/login` | Login | 登录页（公开） |
| `/dashboard` | Dashboard | 首页数据看板 |
| `/leads` | Leads | 线索管理 |
| `/customer/list` | CustomerList | 客户列表 |
| `/customer/detail/:id` | CustomerDetail | 客户详情 |
| `/customer/pool` | CustomerPool | 客户池 |
| `/opportunity` | Opportunity | 商机管理 |
| `/product` | Product | 产品管理 |
| `/quotation` | Quotation | 报价列表 |
| `/quotation/edit/:id?` | QuotationEdit | 报价编辑 |
| `/contract` | Contract | 合同管理 |
| `/service` | Service | 售后服务 |
| `/report` | Report | 数据报表（仅管理员） |
| `/team-dashboard` | TeamDashboard | 团队看板 |
| `/profile` | Profile | 个人中心 |
| `/settings` | Settings | 系统设置 |
| `/system/user` | UserManage | 用户管理 |
| `/system/role` | RoleManage | 角色管理 |
| `/system/dept` | DeptManage | 部门管理 |
| `/system/log` | SystemLog | 操作日志 |

### 5.3 请求封装 [frontend/src/utils/request.js](file:///c:/huakey-crm/frontend/src/utils/request.js)

```javascript
// Axios 实例配置
baseURL: '/api'
timeout: 10000
headers: { 'Content-Type': 'application/json' }
```

**响应拦截器错误处理**：

| HTTP 状态码 | 处理方式 |
|-------------|----------|
| 400 | `ElMessage.error('请求参数错误')` |
| 401 | 清除登录状态，跳转登录页 |
| 403 | `ElMessage.error('没有权限访问')` |
| 404 | `ElMessage.error('请求的资源不存在')` |
| 500 | `ElMessage.error('服务器内部错误')` |

**封装方法**：`get(url, params)`, `post(url, data)`, `put(url, data)`, `del(url, params)`

### 5.4 状态管理 [frontend/src/stores/user.js](file:///c:/huakey-crm/frontend/src/stores/user.js)

使用 Pinia Composition API 风格：

| State | 说明 |
|-------|------|
| `token` | JWT Token（持久化到 localStorage） |
| `userInfo` | 用户信息对象 |

| Action | 说明 |
|--------|------|
| `setToken(newToken)` | 设置并持久化 Token |
| `clearToken()` | 清除 Token 和用户信息 |

### 5.5 布局组件 [frontend/src/views/layout/index.vue](file:///c:/huakey-crm/frontend/src/views/layout/index.vue)

**布局结构**：
- 左侧边栏（可折叠）：Logo + 导航菜单
- 右侧内容区：顶部栏 + 路由视图

**菜单结构**：

```
首页
客户管理
  ├─ 线索管理
  ├─ 客户列表
  └─ 客户池
商机管理
产品管理
报价管理
合同管理
售后服务
数据报表（仅管理员）
系统管理（仅管理员）
  ├─ 用户管理
  ├─ 角色管理
  ├─ 部门管理
  └─ 操作日志
```

### 5.6 客户来源常量 [frontend/src/constants/source.js](file:///c:/huakey-crm/frontend/src/constants/source.js)

提供统一的客户来源定义，避免各模块重复：

| 导出 | 用途 |
|------|------|
| `SOURCE_GROUPS` | 源分组定义 |
| `ALL_SOURCE_VALUES` | 所有叶子值数组 |
| `SOURCE_FORM_OPTIONS` | 表单 option-group 选项 |
| `SOURCE_SEARCH_OPTIONS` | 搜索筛选选项（含"全部来源"） |
| `getSourceParent(leaf)` | 叶子值 → 父分组名 |
| `getSourceColor(source)` | 来源 → 标签颜色 |
| `PARENT_SOURCE_COLORS` | 父分组颜色（饼图用） |

---

## 6. 数据库设计

### 6.1 E-R 关系图

```
sys_dept (1) ───< (N) sys_user
    │
sys_role (1) ───< (N) sys_user

sys_user (1) ───< (N) crm_customer (owner_id)
    │
    ├──< (N) crm_contact
    │       │
    │       └── (N) crm_follow_up
    │
    ├──< (N) crm_opportunity
    │       │
    │       └── (1) crm_contract
    │               │
    │               ├──< (N) crm_payment_plan
    │               ├──< (N) crm_payment
    │               └── (1) crm_service_order
    │
    ├──< (N) crm_quote
    │       │
    │       └──< (N) crm_quote_item
    │               │
    │               └── (1) crm_product
    │
    └──< (N) sys_log
```

### 6.2 系统表

#### sys_dept（部门表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 部门ID |
| name | VARCHAR(50) | 部门名称 |
| parent_id | INT | 上级部门ID（0=根） |
| sort | INT | 排序 |
| create_time / update_time | DATETIME | 时间戳 |

#### sys_role（角色表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 角色ID |
| name | VARCHAR(50) | 角色名称 |
| code | VARCHAR(50) UNIQUE | 角色编码 |
| description | VARCHAR(255) | 描述 |
| status | TINYINT | 1=正常, 0=禁用 |
| view_all | 隐式 | 是否可查看全部数据 |
| manage_all | 隐式 | 是否可管理全部数据 |

**默认角色**：

| ID | 名称 | 编码 | 权限 |
|----|------|------|------|
| 1 | 超级管理员 | super_admin | 全部权限 |
| 2 | 管理员 | admin | 全部权限 |
| 3 | 销售经理 | sales_manager | 部门管理 |
| 4 | 销售人员 | sales | 普通销售 |
| 5 | 技术人员 | tech | 技术支持 |

#### sys_user（用户表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 用户ID |
| username | VARCHAR(50) UNIQUE | 用户名 |
| password | VARCHAR(255) | bcrypt 哈希密码 |
| real_name | VARCHAR(50) | 真实姓名 |
| phone | VARCHAR(20) | 电话 |
| email | VARCHAR(100) | 邮箱 |
| dept_id | INT FK | 部门ID |
| role_id | INT FK | 角色ID |
| status | TINYINT | 1=正常, 0=禁用（逻辑删除） |

### 6.3 业务表

#### crm_customer（客户表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| company_name | VARCHAR(200) | 公司名称 |
| contact_name | VARCHAR(50) | 联系人 |
| phone | VARCHAR(20) | 电话 |
| email | VARCHAR(100) | 邮箱 |
| address | VARCHAR(500) | 地址 |
| industry | VARCHAR(50) | 行业 |
| source | VARCHAR(50) | 来源 |
| level | VARCHAR(20) | 等级 A/B/C/D |
| owner_id | INT FK | 负责人ID |
| status | TINYINT | 1=潜在, 2=成交, 3=流失 |
| pool_status | TINYINT | 0=归属, 1=公海 |
| protect_until | DATETIME | 认领保护截止 |
| last_follow_time | DATETIME | 最近跟进时间 |
| remark | TEXT | 备注 |

#### crm_contact（联系人表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| customer_id | INT FK | 客户ID |
| name | VARCHAR(50) | 姓名 |
| position | VARCHAR(50) | 职位 |
| phone | VARCHAR(20) | 电话 |
| email | VARCHAR(100) | 邮箱 |
| wechat | VARCHAR(50) | 微信 |
| is_decision | TINYINT | 1=决策人 |
| remark | VARCHAR(500) | 备注 |

#### crm_opportunity（商机表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| customer_id | INT FK | 客户ID |
| name | VARCHAR(200) | 商机名称 |
| expected_amount | DECIMAL(15,2) | 预计金额 |
| expected_date | DATE | 预计成交日期 |
| stage | TINYINT | 1询盘→6失败 |
| win_rate | TINYINT | 赢单率 0-100 |
| remark | TEXT | 备注 |
| owner_id | INT FK | 负责人ID |

**商机阶段**：

| 值 | 阶段 |
|----|------|
| 1 | 询盘 |
| 2 | 需求确认 |
| 3 | 方案报价 |
| 4 | 谈判 |
| 5 | 成交 |
| 6 | 失败 |

#### crm_product（产品表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| name | VARCHAR(200) | 产品名称 |
| code | VARCHAR(50) UNIQUE | 产品编码 |
| category | VARCHAR(100) | 分类 |
| unit | VARCHAR(20) | 单位 |
| price | DECIMAL(15,2) | 参考价格 |
| cost_price | DECIMAL(15,2) | 成本价 |
| stock | INT | 库存 |
| description | TEXT | 描述 |
| status | TINYINT | 1=启用 |

#### crm_quote / crm_quote_item（报价单）

| 表 | 说明 |
|----|------|
| crm_quote | 报价单主表（单号、客户、金额、折扣、状态） |
| crm_quote_item | 报价单项表（产品、数量、单价、小计） |

#### crm_contract（合同表）

| 字段 | 说明 |
|------|------|
| contract_no | 合同编号 |
| customer_id | 客户ID |
| opportunity_id | 关联商机 |
| amount | 合同金额 |
| sign_date / delivery_date | 签订/交付日期 |
| status | 1=执行中, 2=已完成, 3=已终止 |

#### crm_payment_plan / crm_payment（回款）

| 表 | 说明 |
|----|------|
| crm_payment_plan | 回款计划（计划日期、计划金额） |
| crm_payment | 实际回款（回款日期、金额、方式） |

#### crm_service_order（服务工单表）

| 字段 | 说明 |
|------|------|
| order_no | 工单编号 |
| customer_id / contract_id | 关联客户/合同 |
| type | 安装/维修/咨询/投诉/其他 |
| priority | 1=紧急, 2=高, 3=中, 4=低 |
| status | 1=待处理, 2=处理中, 3=已完成, 4=已关闭, 5=已评价 |
| assignee_id | 处理人 |
| satisfaction | 满意度 1-5 |

#### crm_follow_up（跟进记录表）

| 字段 | 说明 |
|------|------|
| customer_id / contact_id | 关联客户/联系人 |
| follow_type | 电话/拜访/微信/邮件/其他 |
| content | 跟进内容 |
| next_time / next_content | 下次提醒时间和计划 |
| create_by | 创建人 |

#### sys_log（操作日志表）

| 字段 | 说明 |
|------|------|
| module | 模块名称 |
| action | 操作类型 |
| method / url | HTTP 方法和路径 |
| params | 请求参数 |
| ip_address | 客户端IP |
| user_id / user_name | 操作用户 |
| description | 描述 |
| status | 1=成功, 0=失败 |
| error_msg | 错误信息 |

#### crm_pool_log（公海操作日志表）

| 字段 | 说明 |
|------|------|
| customer_id | 客户ID |
| action | claim=认领, release=释放 |
| from_user_id / to_user_id | 原/新负责人 |

---

## 7. API 接口文档

### 7.1 认证相关

#### POST /api/auth/login

**请求体**：
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**成功响应**：
```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "userInfo": {
      "id": 1,
      "username": "admin",
      "realName": "系统管理员",
      "phone": "13800138000",
      "email": "admin@huakey.com",
      "deptId": 1,
      "roleId": 1,
      "viewAll": true,
      "manageAll": true
    }
  }
}
```

### 7.2 客户管理

#### POST /api/customer/list

**请求体**：
```json
{
  "page": 1,
  "pageSize": 10,
  "company_name": "华为",
  "source": "展会",
  "level": "A",
  "status": 2,
  "owner_id": 1
}
```

**响应**：
```json
{
  "code": 200,
  "message": "获取客户列表成功",
  "data": {
    "list": [...],
    "total": 100,
    "page": 1,
    "pageSize": 10
  }
}
```

### 7.3 数据报表

#### GET /api/report/dashboard-stats

**响应**：
```json
{
  "code": 200,
  "data": {
    "month_sales": 1500000,
    "month_customers": 12,
    "month_contracts": 5,
    "month_payments": 800000,
    "opportunity_amount": 3200000,
    "pending_payment": 3
  }
}
```

### 7.4 健康检查

#### GET /api/health

```json
{
  "code": 200,
  "data": {
    "status": "ok",
    "version": "crm_v1",
    "timestamp": "2026-05-20T10:00:00.000Z"
  }
}
```

---

## 8. 认证与授权

### 8.1 JWT 认证流程

```
Client ──POST /api/auth/login──> Server
         <────── Token ──────────

Client ──API Request (Authorization: Bearer <token>)──> Server
         <────────── 受保护数据 ────────────────────────
```

### 8.2 权限矩阵

| 功能 | 超级管理员 | 管理员 | 销售经理 | 销售人员 | 技术人员 |
|------|-----------|--------|----------|----------|----------|
| 用户/角色/部门管理 | 是 | 是 | 否 | 否 | 否 |
| 查看全部客户 | 是 | 是 | 是 | 是 | 是 |
| 编辑全部客户 | 是 | 是 | 否 | 否 | 否 |
| 编辑自己的客户 | 是 | 是 | 是 | 是 | 否 |
| 数据报表 | 是 | 是 | 是 | 否 | 否 |
| 系统设置 | 是 | 是 | 否 | 否 | 否 |

### 8.3 数据权限判断逻辑

```javascript
// 检查是否有管理权限
if (user.manageAll || user.roleId === 1 || user.roleId === 2) {
  return true; // 管理员/老板可管理全部
}
return customerOwnerId === user.userId; // 仅可管理自己的客户
```

---

## 9. 依赖关系

### 9.1 后端依赖 [backend/package.json](file:///c:/huakey-crm/backend/package.json)

| 包名 | 版本 | 用途 |
|------|------|------|
| express | ^5.2.1 | Web 框架 |
| mysql2 | ^3.22.3 | MySQL 驱动（支持 Promise） |
| jsonwebtoken | ^9.0.3 | JWT 生成与验证 |
| bcryptjs | ^3.0.3 | 密码哈希 |
| cors | ^2.8.6 | 跨域支持 |
| dotenv | ^17.4.2 | 环境变量 |
| multer | ^2.1.1 | 文件上传 |
| xlsx | ^0.18.5 | Excel 读写 |
| redis | ^5.12.1 | Redis 客户端（预留） |
| nodemon | ^3.1.14 (dev) | 开发热重载 |

### 9.2 前端依赖 [frontend/package.json](file:///c:/huakey-crm/frontend/package.json)

| 包名 | 版本 | 用途 |
|------|------|------|
| vue | ^3.4.21 | 前端框架 |
| vue-router | ^4.3.0 | 路由管理 |
| pinia | ^2.1.7 | 状态管理 |
| element-plus | ^2.5.6 | UI 组件库 |
| @element-plus/icons-vue | ^2.3.1 | 图标库 |
| axios | ^1.6.7 | HTTP 请求 |
| echarts | ^6.0.0 | 图表库 |
| vite | ^5.1.6 (dev) | 构建工具 |
| @vitejs/plugin-vue | ^5.0.4 (dev) | Vue 插件 |
| unplugin-auto-import | ^0.17.5 (dev) | 自动导入 |
| unplugin-vue-components | ^0.26.0 (dev) | 组件自动导入 |

### 9.3 基础设施依赖

| 组件 | 版本 | 说明 |
|------|------|------|
| Node.js | 22+ | 运行时 |
| MySQL | 8.0 / MariaDB 10 | 数据库 |
| Nginx | Alpine | 前端服务器 + 反向代理 |
| Redis | 7 (可选) | 缓存（当前未启用） |

---

## 10. 项目运行方式

### 10.1 开发环境

**后端启动**：
```bash
cd backend
npm install
npm run dev        # nodemon 热重载，端口 5000
```

**前端启动**：
```bash
cd frontend
npm install
npm run dev        # Vite 开发服务器，端口 5173
```

**开发环境特性**：
- Vite 代理：`/api` → `http://localhost:5000`
- CORS 允许所有来源

### 10.2 Docker Compose 部署

```bash
docker-compose up -d
```

**服务映射**：

| 服务 | 容器名 | 端口 | 说明 |
|------|--------|------|------|
| MySQL | huakey-mysql | 3306 | 数据库 |
| Redis | huakey-redis | 6379 | 缓存（预留） |
| Backend | huakey-backend | 5000 | API 服务 |
| Frontend | huakey-frontend | 80 | Nginx 静态资源 |

**环境变量**（可通过 `.env` 文件配置）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MYSQL_ROOT_PASSWORD` | RootPassword@2024 | MySQL root 密码 |
| `DB_NAME` | huakey_crm | 数据库名 |
| `DB_USER` | crm_user | 数据库用户 |
| `DB_PASSWORD` | Huakey@2024 | 数据库密码 |
| `DB_PORT` | 3306 | 数据库端口 |
| `JWT_SECRET` | - | **生产环境必须设置** |
| `JWT_EXPIRES_IN` | 7d | Token 有效期 |
| `REDIS_PORT` | 6379 | Redis 端口 |

### 10.3 数据库初始化

按顺序执行 SQL 脚本：

```sql
1. database/init.sql                -- 系统表（部门/角色/用户）
2. database/customer.sql            -- 客户表 + 联系人表
3. database/follow_up.sql           -- 跟进记录表
4. database/opportunity.sql         -- 商机表
5. database/quote.sql               -- 产品表 + 报价表
6. database/business_tables.sql     -- 合同/回款/服务工单/公海日志
7. database/migrations/*.sql        -- 迁移脚本
```

---

## 11. 部署说明

### 11.1 Docker 构建流程

**后端 Dockerfile**：
```
node:22-alpine (build)
  ├── npm ci --production=false
  ├── npm run build
  └── 产出 dist/

node:22-alpine (runtime)
  ├── 复制 dist/ + package.json
  ├── npm ci --production
  └── CMD node app.js
```

**前端 Dockerfile**：
```
node:22-alpine (build)
  ├── npm ci
  ├── npm run build
  └── 产出 dist/

nginx:alpine (runtime)
  ├── 复制 dist/ 到 /usr/share/nginx/html
  ├── 复制 nginx.conf
  └── CMD nginx -g 'daemon off;'
```

### 11.2 Nginx 配置 [frontend/nginx.conf](file:///c:/huakey-crm/frontend/nginx.conf)

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    
    # 前端路由（History 模式支持）
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API 反向代理到后端
    location /api/ {
        proxy_pass http://backend:5000;
    }
}
```

### 11.3 生产环境安全要求

1. **必须设置 `JWT_SECRET`**：生产环境启动时会校验，未设置则退出
2. **修改默认密码**：admin123 等默认密码必须在首次登录后修改
3. **配置 CORS 白名单**：生产环境不应使用 `*`
4. **启用 HTTPS**：通过 Nginx 或负载均衡器配置 SSL
5. **数据库安全**：限制数据库访问权限，定期备份

### 11.4 NAS 部署

项目支持群晖 NAS 部署，详见 [DEPLOY.md](file:///c:/huakey-crm/DEPLOY.md)：

1. 安装 Node.js v22、MariaDB 10、Web Station
2. 上传并解压 `huakey-crm-deploy.tar.gz`
3. 创建数据库并执行 SQL 脚本
4. 配置 Web Station 虚拟主机
5. 启动后端服务

---

## 附录

### A. 项目文件清单

| 文件 | 行数/大小 | 说明 |
|------|----------|------|
| backend/app.js | 143 | Express 主入口 |
| backend/config/database.js | 44 | MySQL 连接池 |
| backend/middleware/auth.js | 71 | JWT 认证 |
| backend/middleware/logger.js | 214 | 操作日志 |
| backend/routes/customer.js | ~900 | 客户管理（最大路由文件） |
| backend/routes/user.js | 304 | 用户管理 |
| backend/src/routes/auth.js | 361 | 认证路由 |
| frontend/src/main.js | 53 | Vue 入口 |
| frontend/src/router/index.js | 161 | 路由配置 |
| frontend/src/views/layout/index.vue | ~350 | 主布局 |
| frontend/src/views/Dashboard.vue | ~600 | 首页看板 |
| frontend/src/utils/request.js | 103 | Axios 封装 |
| database/init.sql | 90 | 系统表初始化 |
| database/customer.sql | 109 | 客户表 |
| docker-compose.yml | 84 | Docker 编排 |

### B. 扩展建议

1. **ORM 迁移**：使用 Sequelize/Prisma 替代原生 SQL
2. **接口文档**：引入 Swagger/OpenAPI 自动生成文档
3. **测试覆盖**：补充单元测试和 E2E 测试
4. **Redis 启用**：实现 Session 缓存、热点数据缓存
5. **消息队列**：引入 RabbitMQ/Bull 处理异步任务
6. **监控告警**：接入 Prometheus + Grafana
7. **CI/CD**：配置 GitHub Actions 自动构建部署

# HUAKEYCRM_MASTER_SPEC

> **版本**: v1.0  
> **生效日期**: 2026-09-21  
> **性质**: 项目唯一业务真相（Single Source of Truth）  
> **裁定权**: 产品负责人 / 公司 owner  
> **适用范围**: 铧旗CRM 全部代码库（frontend + backend + database + deploy + scripts + docs）  
> **关联准则**: 本文件与根目录 `AGENTS.md`、`CLAUDE.md` 共同构成行为约束，冲突时以 `AGENTS.md` 为准

---

## ⚠️ 使用前置

**任何 AI / 开发者修改代码前必须：**

1. 完整阅读本文件
2. 完整阅读根目录 `AGENTS.md` 和 `.claude/CLAUDE.md`
3. 确认修改范围不违反本文件任何一条禁止规则
4. 涉及数据库结构变更、权限模型变更、冻结模块变更时，**先提交 RFC**

**如果本文件与当前代码冲突：**

- 不要自行选择站在哪一边
- 报告「规范与现有实现冲突」并说明：本规范规定什么、当前代码是什么、两者为什么冲突
- 等待产品负责人裁定后再行动

---

## 冲突裁决议录（2026-09-21）

| # | 问题 | 裁定 | 依据 |
|---|---|---|---|
| D1 | 备份调度以哪套为准 | **02:45 容器三合一方案**（MySQL 02:00 / uploads 02:30 / config+证书 02:45），旧 DSM Task Scheduler 方案废弃 | 08-31 重构已在生产验证；旧方案 4 篇文档已归档 |
| D2 | 生产就绪以哪份报告为准 | **`crm-v1-final-audit-report.md`（08-31）** 为最终技术结论（P0/P1 全闭环 + 实测 1028/1028 用例通过） | 09-10 的 `crm-full-health-report-v1.md` C+ 评级为 Phase 0 扫描原始证据，其内部已登记全部 P0 修复（带 commit hash） |
| D3 | 4 份 08-06 checklist 处理 | **全部归档** | 08-31 的 `crm-v1.0.1-release-checklist.md` 已完全覆盖 |
| D4 | 15 篇沉余文档处理 | **全部归档到 docs/archive/** | 2026-09-21 已执行，docs/ 根目录从 122 篇收敛为 107 篇 |
| D5 | 数据库表数 | **105 表**（实测） | 旧估算「约 93 张」已过时，AGENTS.md 十四章实测为 105 |

---

## 1. 系统架构

### 1.1 总体架构

**单体架构**（不使用微服务 / Redis 分布式锁 / Kafka / Kubernetes / GraphQL / Elasticsearch）。

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

### 1.2 技术栈基线

| 层 | 技术 | 版本/备注 |
|---|---|---|
| 前端框架 | Vue 3 | `<script setup>` Composition API |
| 构建 | Vite | 7.x |
| UI | Element Plus | 2.5+ |
| 图表 | ECharts | 前端主题源：`frontend/src/utils/chartTheme.js` |
| 路由 | Vue Router | 4.x，history mode |
| HTTP | axios | 封装于 `frontend/src/utils/request.js`，自动注入 token |
| 后端 | Express | 4.x |
| 运行时 | Node.js | 22.x |
| 数据库驱动 | mysql2 | promise 风格 + 连接池 |
| 参数校验 | Joi | 路由级 schema 校验 |
| 认证 | jsonwebtoken + bcryptjs | JWT 7 天过期 + token 黑名单 |
| 文件上传 | multer | 必须限制大小/MIME/扩展名 |
| 邮件 | nodemailer | |
| 缓存 | node-cache | 权限码缓存 5 分钟 |
| 验证码 | svg-captcha | `SKIP_CAPTCHA=true` 时固定 `abcd` |
| 定时任务 | node-cron | 公海回收 / 逾期提醒 / 合同到期 |
| 日志 | winston | JSON 每日轮转 |
| 数据库 | MySQL | 8.0 / InnoDB / utf8mb4_unicode_ci |
| 部署 | Docker Compose | 群晖 NAS Container Manager |

### 1.3 代码分层

```
frontend/  (Vue 3 SPA)
  ├── src/views/       # 功能页面（40+）
  ├── src/components/  # 公共组件
  ├── src/composables/ # 组合式函数（useUser/useTable/...）
  ├── src/api/         # 26 个 API 模块
  ├── src/utils/       # request / permission / error / chartTheme
  └── src/styles/      # apple.css（唯一主题源）

backend/  (Express)
  ├── app.js             # 入口 + 中间件链 + 路由挂载
  ├── middleware/         # auth / permission / validate / errorHandler / rateLimiter / responseFormat / logger / csrf / cache / traceId
  ├── routes/            # 30+ 路由文件（其中 customer/product/report/dataManagement 已用 ModuleRegistry）
  ├── services/          # 65 个 service 文件（业务逻辑层）
  ├── controllers/       # 路由参数提取 + service 调用 + 响应格式化
  ├── config/            # database / roles / logger / metrics / slowQuery / swagger / fieldPermissions
  ├── constants/         # customerStatus / customer 旧版数值
  ├── cron/scheduler.js  # 定时任务
  └── utils/             # alert / mask / validator / pagination / softDelete

database/
  └── migrations/  # 三位数编号正向迁移 + 对应 _down.sql 回滚（共 117 号）
```

### 1.4 请求处理管道

```
请求 → Compression → Helmet(CSP) → TraceId → metrics → CORS → CookieParser → JSON Body →
  → /api/v1 Router → apiLimiter → globalLogMiddleware → responseFormat →
  → 各业务路由（authenticateToken / checkPermission / validate(Joi) 在路由层按需挂载） →
  → Route Handler → Service Layer → Database →
  → appErrorHandler → globalErrorHandler → 响应 {code, message, data}
```

### 1.5 响应格式（强制）

```json
{"code": 200, "message": "操作成功", "data": {...}}
```

| code | 含义 |
|---|---|
| 200 | 成功 |
| 400 | 参数校验失败（VALIDATION_ERROR） |
| 401 | Token 过期/无效 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 409 | 唯一约束冲突 |
| 500 | 内部错误 |

Service 层必须使用 `AppError(ErrorCodes.XXX, 'msg', statusCode)`，禁止直接返回三元组。

---

## 2. 数据库字典

### 2.1 基本信息

| 项 | 值 |
|---|---|
| 库名 | `huakey_crm`（生产） / `huakey_crm_test`（测试） |
| 表数 | **105 张**（实测） |
| 字符集 | `utf8mb4_unicode_ci` |
| 引擎 | InnoDB |
| 迁移数 | 117（含 down 脚本） |
| 迁移执行器 | `database/migrations/run_migrations.js`，维护 `schema_migrations` 版本表，事务包裹 |

### 2.2 核心表清单

**用户/权限**（8 张）
- `sys_user` — 用户（含 `must_change_password` / `status` / `deleted_at`）
- `sys_role` — 角色（code 字段：boss/manager/sales/hr/purchase/finance/engineer）
- `sys_permission` — 权限码（117 条定义）
- `sys_role_permission` — 角色-权限关联
- `sys_data_permission` — 数据权限（data_scope: all/dept_and_sub/dept/self/custom）
- `sys_dept` — 部门
- `crm_user_permission` — 用户级特殊授权（当前 0 行，权限完全由角色驱动）
- `sys_token_blacklist` — JWT 黑名单

**客户域**（7 张）
- `crm_customer` — 客户主表（单表模型，禁止拆表）
- `crm_contact` — 联系人
- `crm_opportunity` — 商机
- `crm_customer_transfer` — 客户转移
- `crm_customer_tag` — 客户标签
- `crm_pool_log` — 公海操作日志
- `crm_follow_up` — 跟进记录

**业务域**（8 张）
- `crm_quote` — 报价
- `crm_quote_item` — 报价明细
- `crm_contract` — 合同
- `crm_contract_item` — 合同明细
- `crm_payment` — 付款
- `crm_payment_plan` — 付款计划
- `crm_order` — 订单
- `crm_invoice` — 发票

**产品/采购**（6 张）
- `crm_product` — 产品
- `crm_supplier` — 供应商
- `crm_purchase_order` — 采购单
- `crm_purchase_request` — 采购申请
- `crm_purchase_comparison` — 采购比价
- `crm_purchase_item` — 采购明细

**系统**（12 张）
- `sys_log` — 审计日志
- `sys_notification` — 通知
- `sys_config` — 系统配置
- `cron_job_log` — 定时任务日志
- 其他辅助表（附件、审批、工单等）

### 2.3 命名约定

| 规则 | 说明 |
|---|---|
| 表名 | `crm_` 业务前缀 + `sys_` 系统前缀 |
| 软删除 | 所有核心表必须有 `deleted_at DATETIME NULL` |
| 主键 | `id BIGINT UNSIGNED AUTO_INCREMENT` |
| 创建/更新 | `create_time` / `update_time`（DATETIME，服务端写入） |
| 创建人 | `create_by`（用户 ID） |
| 禁止保留字 | `rank` → `sort_order`；避免 MySQL 保留字 |

---

## 3. 数据关系

### 3.1 核心业务链（禁止断裂）

```
客户 (crm_customer)
 ├── 1:N ── 联系人 (crm_contact)
 ├── 1:N ── 跟进记录 (crm_follow_up)
 ├── 1:N ── 商机 (crm_opportunity)
 │            └── 1:1 ── 合同 (crm_contract)
 ├── 1:N ── 报价 (crm_quote)
 │            └── 报价明细 (crm_quote_item)
 │            └── 可关联商机 / 合同
 ├── 1:N ── 订单 (crm_order)
 └── 1:N ── 付款 (crm_payment)

合同 (crm_contract)
 └── 1:N ── 付款计划 (crm_payment_plan)
             └── 状态驱动合同 overdue/partial/completed 派生
```

### 3.2 外键策略

| 策略 | 使用场景 | 原因 |
|---|---|---|
| `ON DELETE SET NULL` | 客户 → 跟进、合同、报价等关联表 | 删除客户时保留业务记录 |
| `ON DELETE CASCADE` | 明细表（报价明细、合同明细） | 主表删除时级联 |

### 3.3 客户归属与公海语义（权威定义）

| 规则 | 定义 |
|---|---|
| **唯一标准** | `owner_id IS NULL` 为公海 / 待分配；`owner_id IS NOT NULL` 为私有客户 |
| `pool_status` 字段 | 降级为只读兼容字段，业务逻辑**禁止**再据此判断归属 |
| 员工删除级联 | 用户 status=0 + `crm_customer.owner_id = NULL`（释放到公海）+ `crm_opportunity.owner_id = manager_id`（有上级时转移，否则 NULL） |

---

## 4. API 规范

### 4.1 端点前缀

- 当前生产前缀：`/api/v1/`
- 旧 `/api/` 前缀已移除（2026-08-18 审计确认）

### 4.2 分页查询（强制）

所有列表接口**必须**支持分页，禁止 `SELECT *` 全部返回：

```sql
SELECT col1, col2, ... FROM crm_customer
  WHERE deleted_at IS NULL AND <权限条件> AND <筛选条件>
  ORDER BY <字段> DESC
  LIMIT ? OFFSET ?
```

**分页 count 查询****必须包含**相同的权限条件（permParams），否则总数与实际数据不一致。

### 4.3 统一 API 结构

| HTTP 方法 | 用途 | 要求 |
|---|---|---|
| GET | 查询列表 / 详情 | 带分页参数 |
| POST | 新增 | **必须**带 Joi schema + validate() 中间件 |
| PUT/PATCH | 更新 | **必须**带 Joi schema + validate() 中间件 |
| DELETE | 删除 | 优先软删除，物理删除需额外审批 |

### 4.4 文件上传

- 统一走 `multer` 封装
- **必须**限制：文件大小、MIME 类型、扩展名、保存路径
- 上传接口**必须**绑定业务权限码，不能仅做 `authenticateToken`
- 禁止用户上传可执行文件后直接通过 Web Server 执行

### 4.5 公开接口防护

- 调查回复等公开接口**必须**添加 IP 限流 / 验证码防刷

---

## 5. 权限矩阵

### 5.1 角色定义（7 个业务角色 + 1 个超管）

| role_code | 名称 | view_all | manage_all | 数据范围 | 说明 |
|---|---|---|---|---|---|
| `super_admin` | 超级管理员 | 绕过 | 绕过 | 绕过 | **唯一绕过所有权限检查的角色**（`ADMIN_ROLE_CODES` 硬编码） |
| `boss` | 老板 | YES | YES | 通常 all | 全部权限，但**不绕过**功能权限检查（仍需 checkPermission） |
| `manager` | 部门经理 | YES | NO | 通常 dept_and_sub | 看全部，管理本部门 |
| `sales` | 销售 | NO | NO | self（owner_id = 当前用户） | 看自己的客户 + 公海客户 |
| `hr` | 人力资源 | NO | NO | self | 查看权限 |
| `purchase` | 采购专员 | NO | NO | self | 采购管理 |
| `finance` | 财务专员 | YES | NO | 通常 all | 财务查看 |
| `engineer` | 工程师 | NO | NO | self | 技术支持 |

### 5.2 三层权限检查（强制同时生效）

```
第一层：authenticateToken → JWT 验证 + token 黑名单 + 每次请求从 DB 查最新角色
第二层：checkPermission('code') → 查 sys_role_permission，结果 node-cache 缓存 5 分钟
第三层：checkDataPermission(module, ownerColumn) → 数据范围过滤
```

**缓存失效**：
- 用户直接权限变更 → 主动调用 `clearPermissionCache(userId)` 失效
- 角色权限 / 数据权限变更 → **当前依赖 5 分钟 TTL 自然过期**（已知 P3 待优化项）

### 5.3 敏感字段权限（fieldPermissions.js）

| 模块 | 字段 | 可见角色 |
|---|---|---|
| product | `cost_price` | boss / manager / super_admin |
| quote | `cost_price` | boss / manager / super_admin |
| purchase_item | `unit_price`, `amount`, `total_price` | boss / manager / finance / purchase / super_admin |
| supplier | `bank_account`, `tax_id`, `contact_phone`, `contact_email` | boss / manager / finance / purchase / super_admin |
| contract | `amount` | boss / manager / finance / super_admin |

### 5.4 权限中间件使用规则

| 场景 | 必须使用 |
|---|---|
| 所有 POST / PUT / PATCH 路由 | `authenticateToken` + `checkPermission('code')` + `validate(Joi)` |
| 所有 GET 列表路由 | `authenticateToken` + `checkDataPermission()` |
| 所有 DELETE 路由 | `authenticateToken` + `checkPermission('模块:delete')` |
| 公开接口（调查回复等） | IP 限流 + 验证码 |

**绝对禁止**：仅用 `authenticateToken` 而跳过 `checkPermission` 或 `checkDataPermission`。

**绝对禁止**：使用 `requireAdmin`（旧版硬编码）替代 `checkPermission`。

### 5.5 权限码命名

```
模块
模块:操作
```

例：`customer` / `customer:view` / `customer:add` / `customer:edit` / `customer:delete` / `customer:pool` / `customer:assign` / `customer:transfer`

---

## 6. 客户业务规则

### 6.1 客户唯一标识

`crm_customer.id`（BIGINT UNSIGNED AUTO_INCREMENT）。

### 6.2 客户来源（统一数据字典）

来源字段**必须**从 `sys_customer_source` 字典表取值，禁止手写。常见值：

Facebook / Instagram / LinkedIn / 独立站 / Google / 展会 / 老客户介绍 / Alibaba / Made-in-China / 其他

### 6.3 客户归属规则（核心）

| 问题 | 规则 |
|---|---|
| 客户当前属于谁？ | `owner_id` 字段指向负责人 user ID；`owner_id IS NULL` 为公海 |
| 谁能编辑？ | owner_id 本人（data_scope=self）+ boss/manager（data_scope=all/dept_and_sub）+ super_admin |
| 谁能删除？ | boss + super_admin（权限码 `customer:delete`） |
| 谁能分配？ | boss + manager（权限码 `customer:assign`） |
| 谁能转移？ | boss + manager + 原 owner（权限码 `customer:transfer`） |
| 谁能从公海领取？ | 有 `customer:pool` 权限的销售（**必须**在权限校验后才能成为候选人，见 §6.4） |
| 谁能放入公海？ | boss + manager |

### 6.4 并发认领防护（P0 级强制）

公海认领**必须**使用以下任一机制，禁止"先 SELECT 再 UPDATE"：

```sql
-- 方案 A：原子条件 UPDATE + 影响行数判断
UPDATE crm_customer
  SET owner_id = ?, pool_status = 'private', ...
  WHERE id = ? AND owner_id IS NULL AND deleted_at IS NULL

-- 检查 affectedRows === 0 → 已被他人认领
```

**当前已修复 3 套认领实现**（`poolService.claimPoolCustomer`、`poolService.batchClaimCustomers`、`customerService.claimPoolCustomer`），均使用原子条件。

### 6.5 客户重复判断

| 字段 | 重复判定方式 |
|---|---|
| 客户名称 | 精确匹配 + 忽略大小写 |
| 邮箱 | 精确匹配 |
| 电话 | 归一化后匹配（去空格、去国家码前缀） |

重复客户**禁止物理删除**，应标记并提示人工合并。

### 6.6 客户状态（与业务状态分离）

客户有**两个独立字段**共同描述当前状态：

| 字段 | 语义 | 取值 |
|---|---|---|
| `business_status`（业务状态） | 销售漏斗阶段（**销售视角**） | 见 §7 客户生命周期 |
| `pool_status`（资源归属） | 公海/私有（**资源视角**） | `sea`（公海）/ `private`（私有） |

**业务判断**：归属以 `owner_id IS NULL` 为准，`pool_status` 仅作兼容参考。

---

## 7. 客户生命周期

### 7.1 状态机定义

```
lead（线索）
  ↓ forwardStatus
sea（公海客户，owner_id 为 NULL）
  ↓ 被分配给销售 → owner_id 设为某 user ID
following（跟进中）
  ↓ forwardStatus
quoted（已报价）
  ↓ forwardStatus
negotiating（谈判中）
  ↓ forwardStatus
signed（已签约 · 终态）

任何非终态状态 ↓ backwardStatus + reason
lost（已流失 · 终态）

following 超过 N 天未跟进 → 系统自动释放回公海
```

| 状态码 | 中文 | 是否终态 | Tag 颜色 |
|---|---|---|---|
| `lead` | 线索 | 否 | 灰色 |
| `sea` | 公海客户 | 否 | 灰色 |
| `following` | 跟进中 | 否 | 蓝色 |
| `quoted` | 已报价 | 否 | 绿色 |
| `negotiating` | 谈判中 | 否 | 橙色 |
| `signed` | 已签约 | ✅ 终态 | 绿色 |
| `lost` | 已流失 | ✅ 终态 | 红色 |
| `paused` | 暂停跟进 | 否 | 灰色 |

### 7.2 状态推进规则（权威）

| 触发条件 | 状态变化 | 执行位置 |
|---|---|---|
| 销售创建第一条跟进 | `lead` / `sea` / `new` → `following` | `followUpService.addFollowUp` |
| 15 天逾期未跟进 | 提醒负责人 + 老板 | `cronService.js` 定时任务 |
| following 超过 M 天未跟进（M > 15） | 自动释放到公海 | `cronService.js` 定时任务 |
| 公海释放前 1 天 | 通知负责人 | `cronService.js` |

### 7.3 ⛔ 禁止跨模块自动改客户状态

**领域边界铁律**：

| 模块 | 允许 | 禁止 |
|---|---|---|
| 商机 / 报价 / 合同 / 订单 / 付款 / 服务工单 | SELECT 读取客户数据、JOIN 关联查询 | UPDATE crm_customer、调用 customerService 写方法、cron 同步客户状态 |

**客户状态推进只能由客户中心模块或用户在客户详情页手动触发**。报价创建后**不会**自动把客户状态从 following 推进到 quoted——此逻辑已移除（`quoteService.test.js` 有守护测试）。

### 7.4 逾期提醒与自动释放（源码级确认，见 `backend/utils/config.js`）

| 规则 | 默认值 | 来源 | 可配置 |
|---|---|---|---|
| 逾期提醒阈值 | **15 天** | `sys_config.config_key='overdue_days'`，默认 `'15'` | ✅ 运行时改 |
| 预回收通知（释放前 N 天提醒） | **7 天** | `sys_config.config_key='near_recycle_days'`，默认 `'7'` | ✅ 运行时改 |
| 自动释放阈值（超过 N 天未跟进→公海） | **15 天** | `sys_config.config_key='recycle_days'`，默认 `'15'` | ✅ 运行时改 |

| 触发条件 | 动作 | 执行位置 |
|---|---|---|
| 销售创建第一条跟进 | `lead` / `sea` / `new` → `following` | `followUpService.addFollowUp` |
| 超过 `overdue_days` 未跟进 | 提醒负责人 + 老板 | `backend/scripts/overdue_reminder.js` + 前端提醒 |
| 距离自动释放还剩 `near_recycle_days` 天 | 通知负责人即将被回收 | `backend/cron/scheduler.js` `notifyPreReleaseCustomers` |
| 超过 `recycle_days` 未跟进 | 自动释放到公海（`pool_status='sea'`） | `backend/cron/scheduler.js` `autoReleaseCustomers` |

| 规则 | 说明 |
|---|---|
| **提醒对象** | 负责人 + 老板 / 管理人员 |
| **时区** | 统一服务器时区（`TZ=Asia/Shanghai`），**禁止混用浏览器时区 / Docker 默认时区 / NAS 时区** |
| **去重** | 同一客户 24 小时内不重复提醒（`logAction` 去重 key） |

---

## 8. 报价业务规则

### 8.1 数据关系链

```
报价 (crm_quote)
  ├── 客户 (crm_customer) — 通过 customer_id 关联
  ├── 明细 (crm_quote_item) — 1:N
  ├── 可关联商机 (crm_opportunity)
  └── 可转化为合同 (crm_contract)
```

### 8.2 金额计算规则（避免 JS 浮点数误差）

| 计算项 | 规则 |
|---|---|
| 小计 | 前端展示用 `Number(qty * price).toFixed(2)`；**存储用 DECIMAL(15,2)** |
| 折扣 | 字段 `discount_rate`（百分比）或 `discount_amount`（固定值），**二者取其一** |
| 总金额 | `SUM(qty * price) * (1 - discount_rate)`，在**数据库侧**用 `DECIMAL` 计算后存储 |
| 币种 | 客户币种，支持 `exchange_rate` 换算 |
| 前端校验 | 显示层可做四舍五入提示，但**权威值以 DB 存储为准** |

### 8.3 报价状态

| 状态 | 含义 |
|---|---|
| draft | 草稿 |
| sent | 已发送给客户 |
| accepted | 客户接受 |
| rejected | 客户拒绝 |
| expired | 已过期 |

### 8.4 报价与客户状态（禁自动联动）

⚠️ **报价创建不会自动修改 crm_customer.business_status**（见 §7.3 领域边界铁律）。

---

## 9. 订单业务规则

### 9.1 数据关系链

```
客户 → 报价 → 订单 → 付款
                  ↓
                合同 → 付款计划 → 实际付款
```

### 9.2 合同状态

| 字段 | 含义 | 取值 |
|---|---|---|
| `crm_contract.status` | 合同执行状态（原始枚举） | `1` 待执行 / `2` 执行中 / `3` 已完成(终态) / `4` 已取消(终态) |
| `crm_contract.approval_status` | 审批状态 | pending / approved / rejected |
| 派生状态（由付款计划表决定） | overdue / partial / completed | 由 `contractService` 的 SQL 子查询计算 |

### 9.3 付款类型

| 类型 | 规则 |
|---|---|
| 部分付款 | 可以多次记录，每次关联订单 / 合同 |
| 全额付款 | 付款总额 = 合同金额时标记合同完成 |
| 退款 | 必须关联原付款，标记 `type='refund'` + `original_payment_id` |

### 9.4 关键业务事务保护

| 操作 | 涉及表 | 事务 |
|---|---|---|
| 创建合同 + 合同明细 | crm_contract + crm_contract_item | ✅ 必须 |
| 创建报价 + 报价明细 | crm_quote + crm_quote_item | ✅ 必须 |
| 客户转移（所有权变更） | crm_customer + crm_customer_transfer + crm_pool_log + 通知 | ✅ 必须 |

---

## 10. 文件规则

### 10.1 存储位置

| 类型 | 存储 |
|---|---|
| 用户上传附件 | Docker named volume `crm-stack_app-uploads` |
| 备份文件 | NAS 本地目录 `/volume1/docker/crm-backups/` |
| Docker volumes | 挂载到群晖 `/volume1/@docker/volumes/` |

### 10.2 上传安全（强制）

| 规则 | 实现位置 |
|---|---|
| 文件大小限制 | multer `limits.fileSize`，常见限制：图片 5MB / PDF 20MB / Office 30MB / 压缩包 50MB |
| MIME 白名单 | multer `fileFilter` 检查 `mimetype` |
| 扩展名白名单 | 上传后二次检查 `path.extname` |
| 文件名清洗 | 重命名为 UUID + 原扩展名，禁止用用户输入的原始文件名 |
| 路径穿越防护 | 禁止路径中包含 `..` / `/` / `\` |
| 访问权限 | 附件下载接口**必须**校验业务权限码 |

### 10.3 备份文件安全

| 规则 |
|---|
| 备份目录权限 `700`，备份文件权限 `600` |
| 配置备份（含证书）**禁止**明文复制到 backup 目录，需加密或离线保存 |
| 备份文件经 `gzip -t` 完整性校验，损坏则 `exit 1` |

---

## 11. 日志规则

### 11.1 日志分类（winston JSON 每日轮转）

| 类型 | 等级 | 说明 |
|---|---|---|
| Application Log | INFO | 正常业务操作 |
| Error Log | ERROR | 业务异常（AppError + ValidationError） |
| Security Log | SECURITY | 登录失败、权限拒绝、token 失效、暴力破解 |
| Audit Log | AUDIT | 关键操作：登录/登出/客户新增修改删除/分配/转移/权限变更/报价修改/订单修改/付款修改/文件上传删除 |

### 11.2 日志强制要求

| 规则 |
|---|
| 所有日志必须包含 `traceId`（由 `traceId` 中间件注入 `crypto.randomUUID()`） |
| `logAction` 必须对密码 / token / 手机号 / 银行卡号 **脱敏** |
| 日志**禁止无限增长**，必须按日期轮转 + 保留 N 天自动清理 |
| 500 错误窗口 ≥ 10 次 → 触发告警（企业微信 webhook + 邮件） |
| ≥1s 慢查询 → `config/slowQuery.js` 记录 warn 日志 |

### 11.3 审计日志范围（必须覆盖）

| 操作 | 记录内容 |
|---|---|
| 登录/登出 | 用户 ID、IP、时间、UA |
| 客户 CRUD | 操作人、客户 ID、变更前后字段 |
| 客户分配/转移 | 操作人、客户 ID、原负责人 → 新负责人 |
| 权限变更 | 角色 / 权限码变更详情 |
| 报价/订单/付款变更 | 操作人、单据 ID、金额变更 |
| 文件上传/删除 | 操作人、文件信息 |

---

## 12. 删除规则

### 12.1 软删除优先（强制）

| 规则 | 说明 |
|---|---|
| 所有核心表 | **必须**有 `deleted_at DATETIME NULL` 列 |
| 查询条件 | 业务查询**必须**追加 `WHERE deleted_at IS NULL` |
| 物理删除 | **禁止**随便使用；仅限归档清理 + 带审批 |

### 12.2 客户级联删除策略

| 场景 | 处理 |
|---|---|
| 用户软删除（离职/禁用） | 用户 `status=0` + 软删除标记 + 客户释放到公海 + 商机转移给直属上级 |
| 客户软删除 | `crm_customer.deleted_at = NOW()`；关联表通过 `ON DELETE SET NULL` 保留业务记录 |
| 商机软删除 | `crm_opportunity.deleted_at = NOW()`；报价引用置 NULL |
| 报价软删除 | `crm_quote.deleted_at = NOW()` + `crm_quote_item` 级联删除 |
| 合同软删除 | 同报价 |
| 付款软删除 | 软删除记录；合同 payment_plan 状态重算 |

### 12.3 删除前安全检查

| 对象 | 必须检查 |
|---|---|
| 客户 | 是否有报价 / 订单 / 合同 / 付款 / 跟进 / 附件 |
| 合同 | 是否有未完成付款计划 |
| 用户 | 是否有客户 owner_id、商机 owner_id |

---

## 13. 数据一致性规则

### 13.1 时区统一（强制）

| 层级 | 要求 |
|---|---|
| MySQL | `default-time-zone = '+08:00'` 或指定 `Asia/Shanghai` |
| Node.js | `TZ=Asia/Shanghai` 环境变量 |
| Docker | `TZ=Asia/Shanghai` + `--name container` |
| NAS | 系统时区同步 |
| 禁止混用 | 浏览器时区 / UTC 与服务器时区混着存 |

### 13.2 字符集与编码（强制）

| 项 | 值 |
|---|---|
| 数据库 | `utf8mb4_unicode_ci` |
| 双重编码修复 | `UPDATE t SET col = CONVERT(BINARY CONVERT(col USING latin1) USING utf8mb4)` |
| 备份导入 | 注意 `mysqldump` 的 `--default-character-set=utf8mb4` |

### 13.3 测试 / 生产隔离（强制，P0 级）

| 项 | 规则 |
|---|---|
| 测试库 ≠ 生产库 | schema 相同但数据完全独立 |
| `JWT_SECRET` | **必须不同**（已修复，见 08-31 安全补丁） |
| `MYSQL_PASSWORD` | 历史共用，建议后续拆分 |
| `CORS_ORIGIN` | 各自配置为真实域名 |
| 测试操作 | **绝对禁止**写入生产数据 |
| E2E 账号 | 从 `.env.test` 读取（`E2E_ADMIN_USER`），禁止硬编码 |

### 13.4 幂等

| 场景 | 防护 |
|---|---|
| 重复提交 / 重复点击 | 前端按钮 disable + 后端唯一约束检查 |
| 网络重试 / API retry | 业务接口检查 `idempotency_key` 或唯一约束 |
| 定时任务 | 检查是否已执行 + 幂等写入 |
| 邮件 | 发送前检查是否 24 小时内已发送 |

### 13.5 并发控制

| 场景 | 机制 |
|---|---|
| 公海认领 | 原子条件 UPDATE + `owner_id IS NULL`（见 §6.4） |
| 审批 / 批量审批 | `SELECT ... FOR UPDATE` 行锁 + 事务 |
| 库存扣减 | 原子条件 UPDATE + 事务 |

---

## 14. 安全规则

### 14.1 必须防护的漏洞清单

| 漏洞类型 | 防护措施 |
|---|---|
| **SQL 注入** | mysql2 参数化查询（`?` 占位符）+ Joi 输入校验 + 禁止拼接 SQL |
| **XSS** | 前端 `v-safe-html`（DOMPurify）+ 后端 Helmet CSP |
| **CSRF** | httpOnly Cookie + double-submit CSRF（`X-CSRF-Token`） |
| **JWT 安全** | 64 字节 hex secret + 7 天过期 + token 黑名单 + HS256 |
| **暴力登录** | 30 次 / 15 分钟 per IP 限制 + svg-captcha |
| **文件上传漏洞** | MIME + 扩展名 + 大小三重白名单 + UUID 重命名 |
| **路径穿越** | 禁止路径中包含 `..` / `/` / `\` |
| **IDOR 越权** | 后端 `checkDataPermission` 强制过滤，**禁止仅前端隐藏按钮** |
| **敏感信息泄漏** | `.env` 提交进 `.gitignore` + 后端错误响应**禁止**暴露堆栈/SQL/路径 |
| **Nginx / Docker secrets** | 密钥经环境变量注入，禁止硬编码 |

### 14.2 密码策略

| 项 | 要求 |
|---|---|
| 初始账号 | `must_change_password=1`（强制首次改密） |
| bcrypt | 10 轮哈希 |
| 后端校验 | Joi 密码策略 + 登录限流 |
| 生产 | `SKIP_CAPTCHA=false` |

### 14.3 错误信息安全

- 前端得到：**用户能理解的信息**（如"客户不存在"、"无权操作"）
- 后端日志记录：**开发人员需要的信息**（含 traceId / SQL / 错误位置）
- 生产环境**禁止**向用户返回：SQL error、stack trace、数据库结构、文件路径、JWT secret、服务器信息

---

## 15. 测试规则

### 15.1 测试结构

| 层 | 框架 | 位置 |
|---|---|---|
| 后端单元 | Jest + Supertest | `backend/tests/`（80 个文件） |
| 前端单元 | Vitest + Vue Test Utils | `frontend/src/**/*.spec.js` |
| E2E | Playwright | `frontend/e2e/` |

### 15.2 强制门禁

| 项 | 阈值 |
|---|---|
| 后端 lint | **0 errors**（`npm run lint`） |
| 后端测试 | 全绿（实测 106 套件 / 1034 用例） |
| 后端覆盖率 | statements ≥ 40% / branches ≥ 30% / functions ≥ 40% / lines ≥ 40% |
| 前端构建 | 成功（`npm run build -- --emptyOutDir=false`） |
| 前端测试 | 全绿（实测 11 文件 / 44 用例） |
| E2E（chromium） | 全绿（实测 34 passed） |
| 迁移往返 | schema_migrations 与迁移文件一致 |

### 15.3 测试数据隔离

- 测试数据库使用独立 schema
- **绝对禁止**污染开发 / 生产数据
- E2E 自举会导入 `deploy/init-complete.sql` 并**把所有迁移标记为已执行**（绕开迁移链）

### 15.4 禁止行为

| 禁止 | 原因 |
|---|---|
| 为了让测试通过而**修改测试结果** | 掩盖真实问题 |
| **删除**失败测试 | 测试是质量底线 |
| **注释掉**失败代码 | 隐藏隐患 |
| **隐藏错误**（空 catch `{}`、吞掉异常） | 已验证全仓 0 命中，但需持续防护 |

---

## 16. 部署规则

### 16.1 部署架构

```
Synology NAS DS925+
├── Container Manager (Docker 管理)
│   ├── huakey-mysql   (MySQL 8.0)
│   ├── huakey-redis   (Redis 7-alpine，可选)
│   ├── huakey-app     (Express App，端口 5000)
│   └── huakey-backup  (MySQL:8.0 镜像纯 shell 调度)
└── DSM Nginx (HTTPS 443 → 反代到容器 App)
```

- 生产端口映射：`6789:5000`
- 测试端口映射：`6790:5000`

### 16.2 备份时间线（权威版本）

```
每日 02:00  MySQL 数据库备份  → mysql-backup.sh
每日 02:30  uploads 文件备份   → uploads-backup.sh
每日 02:45  配置+证书备份      → config-backup.sh
每日 03:00  备份验证           → gzip -t + 文件非空检查 → 损坏则 exit 1
```

| 保留周期 | 值（源码级确认，见 `deploy/backup/*.sh`） |
|---|---|
| MySQL 日备 | **7 天**（`KEEP_DAILY_DAYS=7`） |
| MySQL 周备 | **4 周（28 天）**（`KEEP_WEEKLY_WEEKS=4`） |
| uploads 备份 | **7 天**（`KEEP_DAILY_DAYS=7`） |
| 配置备份 | **7 天**（`KEEP_DAILY_DAYS=7`） |
| 宿主机双保险 | /etc/cron.d/crm-backup 每日 04:00 额外 MySQL 备份 |

### 16.3 发版流程（权威：`crm-v1.0.1-release-checklist.md`）

```
本地开发 → Git commit → 推送 origin
  ↓
test 环境部署 → 运行测试 → 验证
  ↓
GPT-6 审查（可选但推荐）
  ↓
release（打标签 + 部署脚本执行）
  ↓
production（NAS 容器重启 + 健康检查 + 冒烟测试）
```

### 16.4 回滚策略

| 类型 | 方法 |
|---|---|
| 代码回滚 | `git checkout <上一个稳定标签>` → 重新部署 |
| 数据库回滚 | 优先使用对应迁移的 `_down.sql` 脚本；无则手动编写回滚 SQL |
| 配置回滚 | `.env` 备份 + `.env.secrets` 备份，修改前复制为 `.env.bak` |

### 16.5 生产部署安全配置（强制）

| 项 | 值 |
|---|---|
| `SKIP_CAPTCHA` | **false** |
| `CORS_ORIGIN` | 真实域名（`https://crm.huakey.local` 或 `http://192.168.0.200:6789`），禁止 `*` 或 localhost |
| `ENABLE_SWAGGER` | **false** |
| Helmet CSP | HTTP 部署时显式设置 `upgradeInsecureRequests: null`（防止强制升级 HTTP 为 HTTPS） |
| Docker 资源限制 | 每个容器设置 `mem_limit` 和 `cpus` |
| Nginx | HTTPS 监听 + 证书挂载 + DSM 反代 |
| 密钥注入 | 通过 `.env.secrets` + `deploy/inject-secrets.sh`，**禁止硬编码** |

---

## 17. 禁止 AI 擅自修改的规则

### 17.1 绝对禁止（红线）

| 禁止 | 原因 |
|---|---|
| 自行改变业务规则 | 业务规则属于产品决策，AI 没有决策权 |
| 自行删除数据库字段 | 可能丢失历史数据 |
| 自行删除数据 | 软删除优先，物理删除需审批 |
| 自行修改生产数据库 | 可能造成数据损坏 |
| 自行修改本文件（MASTER_SPEC） | 本文件是唯一真相，修改必须经产品负责人 |
| 为让测试通过而改测试结果 | 掩盖真实问题 |
| 删除失败测试 | 测试是质量底线 |
| 注释掉失败代码 | 隐藏隐患 |
| 使用临时 hack 掩盖问题 | 制造技术债 |
| 大范围重构无关模块 | 违反"小范围修改"原则 |

### 17.2 涉及以下模块的修改需走 RFC 流程

| 模块 | 冻结日期 | 冻结边界 |
|---|---|---|
| Customer Center v1.0 | 2026-08-04 | 单表模型 / 双字段状态 / 权限码独立 / API 端点独立 / 后续模块只能读不能写 |

**仅以下例外情况允许直接修改冻结模块**：
1. P0 Bug — 影响生产数据正确性或服务可用性
2. 安全漏洞 — 权限绕过、SQL 注入、XSS 等
3. 数据错误 — 数据损坏、状态流转错误、级联删除异常
4. 法规要求 — 合规性强制修改

### 17.3 数据库变更流程

如果需要修改数据库结构，**先停止实施**，输出：

- 为什么需要修改
- 修改哪张表
- 新增/修改什么字段
- 是否影响历史数据
- 是否需要 migration
- 是否需要回滚方案

**等待批准后再执行**。

### 17.4 权限相关变更流程

任何权限修改**必须同时检查**：

- 前端权限（按钮隐藏）
- 路由权限（中间件挂载）
- Controller 层权限（参数校验）
- Service 层权限（业务逻辑）
- 数据库查询权限（SQL 追加 `owner_id` / `dept_id` 条件）

**不能只改前端**。

---

## 附录 A · 当前生产版本快照

| 项 | 值 | 来源 |
|---|---|---|
| 生产分支 | main | `git branch` |
| 最近稳定 commit | 42c220c | `git log -1` |
| 后端 package.json 版本 | 1.5.1 | `backend/package.json` |
| 前端 package.json 版本 | 1.5.1 | `frontend/package.json` |
| 数据库迁移版本 | 117 | `schema_migrations` |
| 后端测试 | 106 套件 / 1034 用例全绿 | `crm-release-readiness-summary-2026-09-10.md` |
| 后端覆盖率 | 48.56 / 30.83 / 46.88 / 51.64（阈值 40/30/40/40 达标） | 同上 |
| 前端测试 | 11 文件 / 44 用例全绿 | 同上 |
| E2E（chromium） | 34 passed | 同上 |
| Lint | 0 errors | 同上 |
| 生产库用户数 | 22 活跃 + 3 E2E（已禁用） | `crm-v1-final-audit-report.md` |
| 休眠账号 | 13 个 last_login_time=NULL（待治理） | 同上 |
| 活跃角色 | boss(2) / manager / sales / hr / purchase / finance / engineer | 同上 |
| 权限码定义 | 117 条 | 同上 |
| 生产域名 | `https://crm.huakey.local` | `deploy/init-complete.sql` |
| 生产端口 | 6789:5000 | docker-compose |

## 附录 B · 权威文档索引（已纳入 Master Spec 的源文档）

| 文档 | 日期 | 用途 |
|---|---|---|
| `architecture.md` | — | 架构总览、冻结模块、领域边界 |
| `crm-functional-logic.md` | — | 业务规则（客户/合同/工单状态机） |
| `customer-permission-standard.md` | — | 客户权限矩阵 |
| `customer-center-freeze-v1.md` | 08-04 | 冻结边界文件清单 |
| `crm-v1-final-audit-report.md` | 08-31 | 最终技术结论（P0 全闭环、1028/1028 用例、全量权限审计） |
| `crm-release-readiness-summary-2026-09-10.md` | 09-10 | 当前实测数据（106 套件 / 1034 用例 / E2E 34 passed） |
| `crm-full-health-report-v1.md` | 09-10 | Phase 0 扫描原始证据 + P0 修复登记 |
| `crm-v1.0.1-release-checklist.md` | 08-31 | 发版流程 + 部署 Checklist |
| `crm-v1-operation-runbook.md` | 08-31 | 运维全流程 |
| `contract-status-definition.md` | — | 合同状态机 |
| `quote-discount-definition.md` | — | 报价折扣规则 |
| `opportunity-domain-design.md` | — | 商机域模型 |
| `CODE_DOCUMENTATION.md` | — | API 字典、状态枚举 |
| `AGENTS.md` | — | 项目最高行为准则 |
| `.claude/CLAUDE.md` | — | 项目技术约定 |
| `backend/config/roles.js` | — | 角色常量（源码级） |
| `backend/constants/customerStatus.js` | — | 客户状态机（源码级） |
| `backend/config/fieldPermissions.js` | — | 敏感字段（源码级） |

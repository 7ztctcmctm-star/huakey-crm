# Huakey CRM - Changelog

---

# 2026-06-22

## Bug修复

- **[P0] 修复跟进列表数据泄露**：POST /api/follow-up/list 补 checkDataPermission + buildDataPermissionWhere，防止跨用户查看跟进记录
- **[P1] 修复报价列表500错误**：crm_quote 与 crm_currency 表 collation 不匹配（utf8mb4_unicode_ci vs utf8mb4_0900_ai_ci），JOIN 时添加 COLLATE 子句
- **[P1] 修复端口配置**：根目录 .env PORT 从 5000 改为 9527，与 backend/.env 保持一致
- **[P1] 修复测试账号密码**：种子数据用户密码哈希更新，boss/sales_wang/sales_li 等账号可正常登录

## Redis缓存接入（P1）

- 新建 backend/config/redis.js：Redis客户端封装，支持 getCache/setCache/clearByPrefix
- 新建 backend/middleware/cache.js：缓存中间件，自动判断是否启用，支持GET/POST请求
- app.js：REDIS_ENABLED=true 时自动连接Redis，失败降级为无缓存模式
- customer/detail.js：客户列表缓存60秒，增删改时自动清除缓存
- report.js：销售漏斗/概览仪表盘缓存300秒
- 缓存key包含userId，避免不同权限用户读到他人缓存
- REDIS_ENABLED=false 时所有新增代码被短路跳过，行为与修改前完全一致

## Joi校验补全（P1）

- service.js: list/add/update/delete/assign/rate 6个路由补 Joi schema
- report.js: sales-funnel/payment/performance/customer-analysis 等查询参数补 queryValidate
- search.js: /global 补 keyword 校验（min:2, max:100）
- log.js: list/export 补分页+过滤参数校验

## Token撤销机制（P1）

- 新建 sys_token_blacklist 表，存储已注销token的SHA256哈希
- middleware/auth.js: 验证token时增加黑名单检查
- auth.js /logout: 登出时将token写入黑名单
- app.js: 每天凌晨3点定时清理过期黑名单记录

---

# 2026-06-18

## Bug修复（P0/P1）

- **[P0] 修复销售漏斗SQL错误**：`opportunity.js` funnel端点 `permParams` 未展开导致 `?` 占位符绑定失败，改为 `[...permParams]` 展开
- **[P1] 修复Migration 056语法错误**：移除 `DELIMITER $$` 语法（mysql2不支持），简化 `STARTS` 表达式
- **[P0] 修复6模块list接口权限漏洞**：contract/invoice/quote/purchase/service/supplier 的 list 路由缺少 `checkPermission` 中间件，任何已登录用户可绕过功能权限访问列表
- **[P2] 修复followPlan内联数据权限**：改用 `checkDataPermission` + `buildDataPermissionWhere` 替代内联角色判断
- **[P2] 修复followupTemplate权限不一致**：`requireManager` 改为 `requireAdmin`，删除重复的 `isAdmin` 检查

## 数据完整性

- **Migration 059**：为核心业务表添加13个外键约束（crm_customer/follow_up/follow_plan/opportunity/contract/quote/invoice → sys_user/crm_customer），全部 ON DELETE SET NULL
- **Migration 060**：为辅助表添加11个外键约束（stage_log/pool_log/calendar/email/notification/payment_reminder/sales_target/competitor_encounter）
- **输入校验补全**：assign.js（2路由）、leads.js（3路由）、reminder.js（5路由）添加 Joi schema 校验

## 错误处理标准化

- **后端错误日志**：全局错误中间件增加请求上下文（userId/method/path/ip/body）
- **进程异常处理**：`unhandledRejection` 标准化日志格式，`uncaughtException` 延迟1秒退出让Docker重启
- **前端Vue错误处理**：添加 `app.config.errorHandler`，生产环境显示友好提示避免白屏

## 操作日志增强

- **字段级变更追踪**：supplier/product/quote/invoice 的 update 路由补 `logFieldChanges`，记录变更前后值
- 现有 customer/detail.js、contract.js、opportunity.js 已有 fieldLog（确认完整）

## 部署脚本优化

- **sync-test.bat**：添加 `chcp 65001`、git clean检查、排除 `*.tar.gz`
- **push-prod.bat**：移除不可靠的 `sudo docker npm install`，改用 tar pipe 同步方式
- **deploy-all.bat**：全部改用ASCII英文，避免编码问题

---

# 2026-06-17

## 代码清理（P1/P2）

- 删除 `backend/src/` 空壳目录（6个空目录，从未实现）
- 删除 `app.js` 中未使用的 `res.success`/`res.error` 响应辅助方法
- 新建 `backend/config/roles.js` 角色常量定义，替代硬编码 roleId
- 更新 `backend/middleware/admin.js` 使用 ROLES 常量，新增 `requireManager` 中间件
- 更新 `backend/routes/hr.js` 使用共享 `requireManager` 代替内联定义

## 数据库优化

- 新建 `sys_log_archive` 归档表，归档30天前的日志（3024条已归档）
- 新建 `evt_archive_sys_log` 定时事件，每月自动归档
- `sys_log` 表从 3.45MB 优化至 2.88MB
- 清理5张表共12个冗余索引：`crm_customer`(3)、`crm_follow_up`(2)、`crm_contract`(3)、`crm_opportunity`(2)、`crm_payment_plan`(2)

---

# 2026-05-27

## 安全

- 修复.env泄露风险
- 更新JWT_SECRET
- 增加.env.example

---

## Docker

- 增加uploads volume持久化

---

## 权限

- 修复RBAC权限判断问题

---

## BUG修复

- 修复登录跳转异常
- 修复客户分页异常

---

## 文档

- 新增AI开发规则
- 新增系统架构文档

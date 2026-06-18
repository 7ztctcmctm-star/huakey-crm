# Huakey CRM - Changelog

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

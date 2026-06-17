# Huakey CRM - Changelog

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

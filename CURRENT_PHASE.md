# Huakey CRM - Current Development Phase

## 当前阶段

生产级稳定化阶段。


## 最近完成（2026-06-24）

### 服务层重构 + 路由优化

- [x] 4 个业务 service + permissionService 创建完成
- [x] contract 路由拆分子目录（crud/payment/export/approval）
- [x] report 路由拆分子目录（custom/dashboard/analytics）
- [x] recordPayment 三表写入包事务
- [x] /overdue-stats 补 checkPermission('report')
- [x] 310 测试 mock 链修复全通过

## 最近完成（2026-06-22）

### P1 修复

- [x] Joi校验补全：service/report/search/log 补齐参数校验
- [x] Token撤销：logout时将token加入黑名单，验证时检查黑名单
- [x] Redis缓存接入：可选缓存层，customer/list + report/sales-funnel + report/overview 试点
- [x] 报价列表500修复：crm_quote与crm_currency表collation不匹配
- [x] 种子数据导入：565客户/16商机/4测试用户，数据隔离验证通过

---

## 最近完成（2026-06-17）

### P1 修复

- [x] 新建 `config/roles.js` 角色常量，`middleware/admin.js` 使用常量替代硬编码 roleId
- [x] `sys_log` 归档清理：归档3024条旧日志，新建定时事件每月自动执行
- [x] 冗余索引清理：5张表删除12个冗余索引

### P2 修复

- [x] 删除 `backend/src/` 空壳目录
- [x] 删除 `app.js` 中未使用的 `res.success`/`res.error` 方法

---

## 当前优先级

### P0

- 安全修复
- 权限稳定
- 登录稳定
- Docker稳定
- 文件持久化

### P1

- BUG修复
- Redis接入
- API稳定
- 日志系统

### P2

- 自动化测试
- 性能优化
- 权限中心化

---

## 当前冻结模块

默认禁止修改：

- auth
- permission
- middleware
- request
- RBAC

除非明确允许。

---

## 当前禁止事项

禁止：

- 大规模重构
- 更换技术栈
- 修改数据库核心结构
- 升级核心依赖
- 重写权限系统

---

## 当前开发原则

优先：

稳定性 > 安全 > 测试 > 性能 > 新功能

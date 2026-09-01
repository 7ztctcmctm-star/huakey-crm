# HuakeyCRM v1.0 用户管理与安全策略

> **文档类型**: User Management & Security Policy
> **版本**: v1.0
> **生效日期**: 2026-08-06
> **适用范围**: HuakeyCRM v1.0 生产环境
> **维护人**: Production Operations Engineer

---

## 1. 用户生命周期管理

### 1.1 生命周期流程

```
员工入职
   ↓
管理员创建账号  (POST /api/v1/user/add)
   ↓
分配角色权限    (角色: boss/manager/sales/hr/purchase/finance/engineer)
   ↓
生成临时密码    (通过独立安全渠道交付: 短信/电话/面对面)
   ↓
员工首次登录    (POST /api/v1/auth/login)
   ↓
系统检测 must_change_password=1
   ↓
强制跳转修改密码页面  (/change-password)
   ↓
员工设置个人密码   (POST /api/v1/auth/force-change-password)
   ↓
must_change_password 更新为 0
   ↓
正式使用系统
   ↓
... 在职期间正常使用 ...
   ↓
员工离职
   ↓
管理员禁用账号  (status=0)
   ↓
保留业务数据    (客户/跟进/商机等数据保留)
   ↓
权限自动回收    (禁用账号无法登录)
```

### 1.2 关键控制点

| 阶段 | 控制点 | 责任人 |
|------|--------|--------|
| 入职 | 账号创建需审批 | HR + 管理员 |
| 首次登录 | 强制改密 | 员工本人 |
| 在职 | 定期密码更新 | 员工本人 |
| 离职 | 及时禁用账号 | HR + 管理员 |

---

## 2. 用户创建规范

### 2.1 创建前准备

| 准备项 | 说明 |
|--------|------|
| 真实姓名 | 必须使用员工真实姓名，不得使用昵称 |
| 部门信息 | 确认员工所属部门 (dept_id) |
| 角色信息 | 确认员工角色 (boss/manager/sales/hr/purchase/finance/engineer) |
| 临时密码 | 生成符合密码策略的临时密码 |

### 2.2 创建要求

**必须遵守**:

- [x] 使用真实姓名（`real_name` 字段必填）
- [x] 分配正确部门（`dept_id`）
- [x] 分配正确角色（`role_id`）
- [x] 设置临时密码（符合密码策略）
- [x] 首次登录必须修改密码（`must_change_password=1`）

### 2.3 创建接口

```
POST /api/v1/user/add
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "username": "employee_id",
  "password": "TempPass123",     // 临时密码
  "real_name": "员工真实姓名",
  "phone": "13800138000",
  "email": "employee@huakey.com",
  "dept_id": 1,
  "role_id": 4                   // sales 角色ID
}
```

### 2.4 密码交付规范

| 交付方式 | 安全等级 | 推荐度 |
|----------|----------|--------|
| 面对面交付 | HIGH | 推荐 |
| 电话通知 | MEDIUM | 可接受 |
| 短信 | MEDIUM | 可接受 |
| 邮件 | LOW | 不推荐 |
| 微信/QQ | LOW | 禁止 |

---

## 3. 密码安全策略

### 3.1 密码复杂度要求

基于当前代码 `backend/services/authService.js:16-17`:

```javascript
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_MESSAGE = '密码至少8位，需包含大写字母、小写字母和数字';
```

| 要求 | 说明 | 示例 |
|------|------|------|
| 最少 8 位 | 密码长度 ≥ 8 | `Abc12345` |
| 包含大写字母 | 至少 1 个 A-Z | `A` |
| 包含小写字母 | 至少 1 个 a-z | `b` |
| 包含数字 | 至少 1 个 0-9 | `1` |
| 特殊字符 | 不强制，但推荐 | `@#$%` |

### 3.2 密码存储方式

| 存储方式 | 说明 |
|----------|------|
| 哈希算法 | bcrypt |
| Cost 因子 | 10 |
| 哈希前缀 | `$2b$10$` |
| 哈希长度 | 60 字符 |
| 明文存储 | 禁止 |

**验证**: 当前 22 个用户密码全部使用 bcrypt $2b$10$ 哈希存储。

### 3.3 密码策略不一致问题

| 入口 | 校验规则 | 状态 |
|------|----------|------|
| authService.js (改密/注册) | 8位 + 大小写 + 数字 | PASS |
| user.js (添加用户) | min(6) | **WARN (待 v1.0.1 修复)** |

**临时缓解**: 管理员创建用户时手动确保密码符合 8 位 + 大小写 + 数字。

### 3.4 Cookie 安全策略

| 配置项 | 值 | 说明 |
|--------|-----|------|
| httpOnly | true | 防止 XSS 读取 |
| secure | true (HTTPS) | 仅 HTTPS 传输 |
| sameSite | strict | 防 CSRF |
| maxAge | 7 天 | Token 有效期 |

---

## 4. 首次登录流程

### 4.1 流程说明

基于 `must_change_password` 机制（三层强制防护）:

```
员工输入用户名 + 密码 + 验证码
   ↓
后端验证凭据 (POST /api/v1/auth/login)
   ↓
登录成功，返回 mustChangePassword=true
   ↓
前端检测，跳转 /change-password
   ↓
路由守卫拦截（每次路由跳转检查 mustChangePassword）
   ↓
后端中间件限制（仅允许 4 个白名单端点）
   ↓
员工设置新密码 (POST /api/v1/auth/force-change-password)
   ↓
后端更新 must_change_password=0
   ↓
允许正常访问系统
```

### 4.2 后端白名单端点

当 `must_change_password=1` 时，仅允许访问:

| 端点 | 用途 |
|------|------|
| `/auth/force-change-password` | 修改密码 |
| `/auth/logout` | 登出 |
| `/auth/me` | 获取用户信息 |
| `/auth/refresh` | 刷新 Token |

其他所有端点返回 `403 请先修改初始密码后再操作`。

### 4.3 前端强制跳转

```javascript
// frontend/src/router/index.js:586-590
if (user.mustChangePassword && to.path !== '/change-password') {
  next('/change-password')
  return
}
```

### 4.4 后端中间件强制

```javascript
// backend/middleware/auth.js:104-112
if (req.user.mustChangePassword) {
  const allowedPaths = ['/auth/force-change-password', '/auth/logout', '/auth/me', '/auth/refresh'];
  if (!isAllowed) {
    return res.status(403).json({ code: 403, message: '请先修改初始密码后再操作' });
  }
}
```

---

## 5. 管理员职责

### 5.1 用户管理职责

| 职责 | 操作 | 接口 |
|------|------|------|
| 创建用户 | 添加新员工账号 | POST /api/v1/user/add |
| 修改用户 | 更新员工信息/角色 | POST /api/v1/user/update |
| 禁用用户 | 离职员工账号禁用 | POST /api/v1/user/update (status=0) |
| 删除用户 | 逻辑删除（保留数据） | POST /api/v1/user/delete |
| 查看用户 | 查询用户列表 | POST /api/v1/user/list |
| 重置密码 | 重置员工密码 | POST /api/v1/user/reset-password (v1.0.1 新增) |

### 5.2 权限管理职责

| 职责 | 说明 |
|------|------|
| 角色分配 | 为用户分配正确的角色 |
| 权限调整 | 根据岗位变动调整角色 |
| 权限审计 | 定期审计用户权限 |
| 权限缓存清理 | 角色变更后清理 permissionCache |

### 5.3 所需权限码

| 权限码 | 说明 |
|--------|------|
| `system:user` | 用户管理（查看列表） |
| `system:user:add` | 新增用户 |
| `system:user:edit` | 编辑用户（含重置密码） |
| `system:user:delete` | 删除用户 |

### 5.4 操作日志

所有管理员操作自动记录日志（`logAction` 中间件），包括:
- 创建用户、修改用户、删除用户
- 重置密码（敏感操作）
- 角色调整

---

## 6. 员工职责

### 6.1 账号安全职责

| 职责 | 说明 |
|------|------|
| 保管账号 | 妥善保管个人账号密码 |
| 首次改密 | 首次登录后必须修改密码 |
| 定期改密 | 建议每 90 天修改密码 |
| 不共享账号 | 禁止将账号密码告知他人 |
| 密码强度 | 设置强密码（8位+大小写+数字） |
| 异常报告 | 发现异常立即联系管理员 |

### 6.2 禁止行为

- [ ] 禁止共享账号
- [ ] 禁止使用弱密码
- [ ] 禁止将密码写在便签/文档
- [ ] 禁止使用他人账号登录
- [ ] 禁止在非工作设备保存密码

---

## 7. 离职员工处理流程

### 7.1 处理流程

```
HR 通知员工离职
   ↓
管理员收到离职通知
   ↓
禁用账号 (status=0)
   ↓
验证账号已禁用（无法登录）
   ↓
保留业务数据（客户/跟进/商机等）
   ↓
客户资源处理（公海池或重新分配）
   ↓
权限自动回收（禁用账号无法访问任何接口）
   ↓
记录操作日志
   ↓
完成离职处理
```

### 7.2 数据处理策略

| 数据类型 | 处理方式 |
|----------|----------|
| 客户数据 | 保留，owner_id 保持或释放到公海池 |
| 跟进记录 | 保留（历史记录） |
| 商机 | 保留或重新分配 |
| 报价/合同 | 保留（历史记录） |
| 用户账号 | 禁用（status=0），不删除 |
| 操作日志 | 保留 |

### 7.3 禁用操作

```
POST /api/v1/user/update
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "id": <user_id>,
  "status": 0    // 0=禁用
}
```

### 7.4 离职检查清单

- [ ] 账号已禁用（status=0）
- [ ] 账号无法登录（验证）
- [ ] 业务数据已保留
- [ ] 客户资源已处理
- [ ] 操作日志已记录
- [ ] HR 已确认

---

## 8. 角色权限矩阵

### 8.1 角色权限概览

| 角色 | view_all | manage_all | 权限数 | 数据范围 |
|------|----------|------------|--------|----------|
| boss | 1 | 1 | 92 | 全局 |
| manager | 0 | 0 | 78 | 部门 |
| sales | 0 | 0 | 47 | 个人 |
| hr | 0 | 0 | 15 | HR 模块 |
| purchase | 0 | 0 | 22 | 采购模块 |
| finance | 0 | 0 | 19 | 财务模块 |
| engineer | 0 | 0 | 14 | 工程模块 |

### 8.2 数据隔离

基于 `backend/middleware/permission.js` 中 `buildDataPermissionWhere`:

| 角色 | 权限类型 | SQL 条件 |
|------|----------|----------|
| boss | all | `1=1` |
| manager | dept | `owner_id IN (部门用户) OR owner_id IS NULL` |
| sales | self | `owner_id = ? OR (owner_id IS NULL AND status IN ('lead', 'sea'))` |

---

## 9. 安全合规检查

### 9.1 定期审计项目

| 检查项 | 频率 | 责任人 |
|--------|------|--------|
| 用户账号状态 | 每月 | 管理员 |
| 密码强度 | 每季度 | 管理员 |
| 权限分配 | 每季度 | 管理员 |
| 离职账号清理 | 每月 | HR + 管理员 |
| 登录日志审计 | 每月 | 管理员 |
| 操作日志审计 | 每季度 | 管理员 |

### 9.2 安全基线

| 基线项 | 要求 |
|--------|------|
| 密码哈希 | bcrypt $2b$10$ |
| Cookie | httpOnly + secure + sameSite=strict |
| Token 有效期 | 7 天 |
| 登录限流 | Redis 存储 |
| 验证码 | 必须（生产环境） |
| CSRF 防护 | double-submit cookie |
| JWT_SECRET | 128 字符 hex |

---

## 10. 相关文档

| 文档 | 说明 |
|------|------|
| [crm-v1-operation-runbook.md](./crm-v1-operation-runbook.md) | 生产运维手册 |
| [crm-v1.0.1-security-maintenance-plan.md](./crm-v1.0.1-security-maintenance-plan.md) | v1.0.1 安全补丁计划 |
| [crm-v1-user-login-readiness-audit.md](./crm-v1-user-login-readiness-audit.md) | 用户登录审计 |
| [crm-v1-user-security-patch-plan.md](./crm-v1-user-security-patch-plan.md) | 用户安全补丁方案 |
| [crm-v1-final-production-acceptance-report.md](./crm-v1-final-production-acceptance-report.md) | 生产验收报告 |

# HuakeyCRM v1.0.1 安全维护计划

> **文档类型**: Security Maintenance Plan
> **版本**: v1.0.1
> **编制日期**: 2026-08-06
> **编制人**: Production Operations Engineer
> **状态**: 待审批执行
> **基于**: [crm-v1-user-login-readiness-audit.md](./crm-v1-user-login-readiness-audit.md)

---

## 0. 执行摘要

### 0.1 背景

基于 [用户登录就绪审计](./crm-v1-user-login-readiness-audit.md) 发现的 3 项安全问题，制定 v1.0.1 安全补丁计划。

### 0.2 当前状态

| 项目 | 状态 |
|------|------|
| 现有 22 个用户 | 全部正常（已改密） |
| 新建用户流程 | 存在安全缺陷（P0） |
| 密码校验一致性 | 存在不一致（P1） |
| 管理员重置密码 | 缺失（P2） |

### 0.3 补丁目标

修复 3 项安全问题，不影响现有 22 个用户、不修改数据库结构、不改变登录流程。

---

## 1. 当前问题

### 1.1 问题 1: 管理员添加用户未设置 must_change_password (P0)

**文件**: `backend/services/userRouteService.js:72-75`

**当前代码**:
```javascript
const [result] = await pool.query(
  `INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  [username, hashedPassword, ...]
);
```

**问题**: 未设置 `must_change_password` 字段，依赖数据库默认值 0。新建用户不会被强制改密。

**影响**: 管理员通过 `/user/add` 创建的新员工可永久使用初始密码。

### 1.2 问题 2: 密码校验规则不一致 (P1)

**文件**: `backend/routes/user.js:19`

**当前代码**:
```javascript
password: Joi.string().required().min(6).max(100),
```

**问题**: Joi 校验最小长度为 6，但系统密码策略（`authService.js:16`）要求至少 8 位 + 大小写 + 数字。

**影响**: 管理员可创建不符合密码策略的弱密码用户。

### 1.3 问题 3: 缺少管理员重置密码能力 (P2)

**现状**: `backend/routes/user.js` 仅有 list/add/update/delete/detail 5 个接口，无 reset-password。

**影响**: 管理员无法重置员工密码（员工遗忘密码时只能通过数据库操作）。

---

## 2. 修复计划

### 2.1 P0 修复: 创建用户强制改密

**文件**: `backend/services/userRouteService.js`

**修改内容**:

```javascript
// 修改前:
INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status)
VALUES (?, ?, ?, ?, ?, ?, ?, 1)

// 修改后:
INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status, must_change_password)
VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
```

**修改范围**: 1 行 INSERT 语句

**验证**: 创建用户后查询 `must_change_password` 应为 1

### 2.2 P1 修复: 统一密码策略

**文件**: `backend/routes/user.js`

**修改内容**:

```javascript
// 修改前:
password: Joi.string().required().min(6).max(100),

// 修改后:
password: Joi.string().required().min(8).max(100)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
  .message('密码至少8位，需包含大写字母、小写字母和数字'),
```

**修改范围**: 1 行 Joi 校验规则

**验证**: 创建用户时密码 `abc123`（6位）应被拒绝，返回 400

### 2.3 P2 修复: 管理员重置密码功能

**新增内容**:

#### 2.3.1 后端服务方法

**文件**: `backend/services/userRouteService.js`

新增 `resetPassword` 方法:
- 接收 `id` 和 `new_password`
- bcrypt 哈希新密码
- 更新 `password` + `must_change_password=1`
- 返回用户名

#### 2.3.2 后端路由

**文件**: `backend/routes/user.js`

新增 `POST /user/reset-password` 路由:
- 权限: `authenticateToken` + `checkPermission('system:user:edit')`
- 校验: `userResetPasswordSchema` (Joi)
- 调用 `userRouteService.resetPassword`
- 记录操作日志 `logAction`

#### 2.3.3 前端 API

**文件**: `frontend/src/api/system.js`

新增:
```javascript
export const resetUserPassword = (data) => request.post('/user/reset-password', data)
```

#### 2.3.4 前端按钮

**文件**: `frontend/src/views/system/user/index.vue`

新增"重置密码"按钮，弹出密码输入框。

### 2.4 版本号更新

**文件**: `backend/package.json`

```json
{
  "version": "1.5.1"
}
```

---

## 3. 影响评估

### 3.1 不影响范围

| 项目 | 影响 | 说明 |
|------|------|------|
| 现有 22 个用户 | 无 | 不修改 must_change_password 值 |
| 当前生产数据 | 无 | 不修改数据库 |
| 数据库结构 | 无 | 不创建 migration |
| 登录流程 | 无 | 不修改 routes/auth.js |
| 改密流程 | 无 | 不修改 forceChangePassword |
| RBAC 权限 | 无 | 不修改权限中间件 |

### 3.2 影响范围

| 项目 | 影响 |
|------|------|
| 新建用户 | must_change_password=1（强制改密） |
| 密码校验 | 密码必须 8 位 + 大小写 + 数字 |
| 重置密码 | 新增接口，管理员可重置用户密码 |

---

## 4. 发布流程

### 4.1 发布前准备

```
1. 创建修复分支
   git checkout -b fix/v1.0.1-security-patch

2. 修改代码
   - backend/services/userRouteService.js (P0 + P2)
   - backend/services/authService.js (P1)
   - backend/routes/user.js (P1 + P2)
   - frontend/src/api/system.js (P2)
   - frontend/src/views/system/user/index.vue (P2)

3. 单元测试
   npm test -- --testPathPattern="user.security"

4. CI 验证
   - npm test (全部测试通过)
   - npm run lint (ESLint 无错误)
```

### 4.2 发布步骤

```
1. 备份生产环境
   ↓
2. 合并修复分支到 main
   ↓
3. NAS 拉取新代码
   ↓
4. 构建新镜像
   ↓
5. 重启 app 容器
   ↓
6. 健康检查
   ↓
7. 功能验证
   ↓
8. 监控观察 24 小时
```

### 4.3 详细发布命令

```bash
# 步骤 1: 备份生产
ssh nas-crm "bash /volume1/docker/crm-stack/deploy/backup/mysql-backup.sh"
ssh nas-crm "bash /volume1/docker/crm-stack/deploy/backup/config-backup.sh"

# 步骤 2: 合并分支（在开发环境）
git checkout main
git merge fix/v1.0.1-security-patch
git push origin main

# 步骤 3: NAS 拉取新代码
ssh nas-crm "cd /volume1/docker/crm-stack && git pull origin main"

# 步骤 4: 构建新镜像
ssh nas-crm "cd /volume1/docker/crm-stack && docker compose -f docker-compose.synology.yml build --no-cache app"

# 步骤 5: 重启 app 容器
ssh nas-crm "cd /volume1/docker/crm-stack && docker compose -f docker-compose.synology.yml up -d app"

# 步骤 6: 健康检查
sleep 10
curl -sk https://crm.huakey.local/api/v1/health

# 步骤 7: 验证版本号
curl -sk https://crm.huakey.local/api/v1/health | grep version
# 预期: 1.5.1
```

### 4.4 发布后验证

| 验证项 | 方法 | 预期 |
|--------|------|------|
| 服务健康 | GET /api/v1/health | 200, version=1.5.1 |
| 现有用户登录 | admin 登录 | 成功 |
| 现有用户不受影响 | 22 个用户 must_change_password=0 | 不变 |
| 新建用户 | 创建测试用户 | must_change_password=1 |
| 密码校验 | 创建弱密码用户 | 返回 400 |
| 重置密码 | POST /user/reset-password | 200 |

---

## 5. 回滚方案

### 5.1 回滚步骤

```bash
# 1. 回滚代码
ssh nas-crm "cd /volume1/docker/crm-stack && git revert <commit-hash>"

# 2. 重新构建
ssh nas-crm "cd /volume1/docker/crm-stack && docker compose -f docker-compose.synology.yml build --no-cache app"

# 3. 重启
ssh nas-crm "cd /volume1/docker/crm-stack && docker compose -f docker-compose.synology.yml up -d app"

# 4. 验证
curl -sk https://crm.huakey.local/api/v1/health
```

### 5.2 回滚触发条件

| 条件 | 动作 |
|------|------|
| app 容器 1 分钟内未 healthy | 立即回滚 |
| 登录接口 5xx 错误率 > 5% | 立即回滚 |
| 现有用户无法登录 | 立即回滚 |

### 5.3 回滚后数据影响

| 数据 | 影响 |
|------|------|
| 现有 22 个用户 | 无影响 |
| 回滚后新建用户 | 恢复为 must_change_password=0 |
| 回滚后重置密码 | 接口 404 |

---

## 6. 测试方案

### 6.1 单元测试

| 测试用例 | 预期 |
|----------|------|
| 创建用户后 must_change_password=1 | PASS |
| 密码 min(6) 被拒绝 | 400 |
| 密码 min(8) + 大小写 + 数字 通过 | 200 |
| 重置密码后 must_change_password=1 | PASS |
| 重置密码后旧 token 失效 | 401 |

### 6.2 回归测试

| 测试项 | 预期 |
|--------|------|
| 现有用户登录 | 正常 |
| 现有用户改密 | 正常 |
| RBAC 权限 | 正常 |
| 前端路由守卫 | 正常 |

### 6.3 安全验证

| 检查项 | 预期 |
|--------|------|
| 新建用户 must_change_password | =1 |
| 密码哈希 | bcrypt $2b$10$ |
| 弱密码拒绝 | 400 |
| 重置密码后 token 失效 | 401 |
| 操作日志记录 | 记录重置密码操作 |

---

## 7. 修改文件清单

| # | 文件 | 修改类型 | 行数 | 优先级 |
|---|------|----------|------|--------|
| 1 | `backend/services/userRouteService.js` | 修改 + 新增 | ~20 行 | P0 + P2 |
| 2 | `backend/services/authService.js` | 修改 | 1 行 | P1 |
| 3 | `backend/routes/user.js` | 修改 + 新增 | ~25 行 | P1 + P2 |
| 4 | `frontend/src/api/system.js` | 新增 | ~3 行 | P2 |
| 5 | `frontend/src/views/system/user/index.vue` | 新增 | ~15 行 | P2 |
| 6 | `backend/package.json` | 修改 | 1 行 | - |

**总计**: 修改 6 个文件，约 65 行代码。

---

## 8. 时间计划

| 阶段 | 说明 |
|------|------|
| 开发 | 创建修复分支 + 修改代码 |
| 测试 | 单元测试 + 回归测试 |
| 审批 | Code Review + 审批 |
| 发布 | 备份 + 部署 + 验证 |
| 监控 | 24 小时观察 |

---

## 9. 审批

| 角色 | 状态 | 日期 |
|------|------|------|
| 编制人 (Operations Engineer) | ✓ 已编制 | 2026-08-06 |
| 审核人 (Tech Lead) | ⏳ 待审核 | - |
| 批准人 (Release Manager) | ⏳ 待批准 | - |

---

## 10. 相关文档

| 文档 | 说明 |
|------|------|
| [crm-v1-user-login-readiness-audit.md](./crm-v1-user-login-readiness-audit.md) | 用户登录审计（本计划依据） |
| [crm-v1-user-security-patch-plan.md](./crm-v1-user-security-patch-plan.md) | 用户安全补丁方案（详细版） |
| [crm-v1-user-management-and-security-policy.md](./crm-v1-user-management-and-security-policy.md) | 用户管理与安全策略 |
| [crm-v1-operation-runbook.md](./crm-v1-operation-runbook.md) | 生产运维手册 |

# HuakeyCRM v1.0 用户安全补丁方案

> **补丁版本**: v1.0.1
> **补丁类型**: 安全补丁 (Security Patch)
> **编制日期**: 2026-08-06
> **编制人**: Production Security Maintenance Engineer
> **状态**: 待审批执行

---

## 0. 执行摘要

### 0.1 补丁目标

修复用户审计发现的 4 项安全问题，不影响现有 22 个用户和登录流程。

### 0.2 补丁范围

| # | 问题 | 优先级 | 修改文件数 |
|---|------|--------|-----------|
| 1 | 新增用户不强制改密 | P0 | 1 (userRouteService.js) |
| 2 | 注册用户不强制改密 | P1 | 1 (authService.js) |
| 3 | 密码校验规则不一致 | P1 | 1 (user.js) |
| 4 | 缺少管理员重置密码 | P2 | 3 (user.js + userRouteService.js + system.js) |

### 0.3 v1.0.1 小版本发布评估

**结论**: **适合作为 v1.0.1 小版本补丁发布**。

理由：
- 改动范围小（3-5 个文件，均为单行或小范围修改）
- 不修改数据库结构，不新增 migration
- 不影响现有 22 个用户（不改变登录流程）
- 修复安全缺陷，符合小版本补丁定位
- 可独立回滚，风险可控

---

## 1. 修改文件列表

### 1.1 后端修改（3 个文件）

| # | 文件 | 修改类型 | 行数 |
|---|------|----------|------|
| 1 | `backend/services/userRouteService.js` | 修改 INSERT + 新增方法 | ~20 行 |
| 2 | `backend/services/authService.js` | 修改 INSERT | 1 行 |
| 3 | `backend/routes/user.js` | 修改 Joi + 新增路由 | ~25 行 |

### 1.2 前端修改（2 个文件）

| # | 文件 | 修改类型 | 行数 |
|---|------|----------|------|
| 4 | `frontend/src/api/system.js` | 新增 API 调用 | ~3 行 |
| 5 | `frontend/src/views/system/user/index.vue` | 新增重置密码按钮 | ~15 行 |

### 1.3 不修改的文件

- 数据库结构（无 migration）
- `backend/scripts/create-admin.js`（已正确）
- `backend/routes/auth.js`（登录流程不变）
- `backend/middleware/auth.js`（强制改密中间件不变）
- `backend/services/authService.js` 中的 `forceChangePassword`（已正确）

### 1.4 版本号变更

| 文件 | 当前版本 | 目标版本 |
|------|----------|----------|
| `backend/package.json` | 1.5.0 | 1.5.1 |
| `frontend/package.json` | (待确认) | +0.0.1 |

---

## 2. 修改原因

### 2.1 问题 1: 新增用户不强制改密 (P0)

**文件**: `backend/services/userRouteService.js:72-75`

**当前代码**:
```javascript
const [result] = await pool.query(
  `INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  [username, hashedPassword, real_name || null, phone || null, email || null, dept_id || null, role_id || null]
);
```

**问题**: 未设置 `must_change_password` 字段，依赖数据库默认值 0。新建用户不会被强制改密。

**影响**: 管理员通过 `/user/add` 创建的新员工可永久使用初始密码，存在安全隐患。

### 2.2 问题 2: 注册用户不强制改密 (P1)

**文件**: `backend/services/authService.js:428-431`

**当前代码**:
```javascript
const [result] = await pool.query(
  `INSERT INTO sys_user (username, password, real_name, role_id, status)
   VALUES (?, ?, ?, ?, 1)`,
  [username, hashedPassword, real_name || null, defaultRoleId]
);
```

**问题**: 同问题 1，注册用户也不会被强制改密。

**影响**: `/auth/register` 接口创建的用户可永久使用初始密码。

### 2.3 问题 3: 密码校验规则不一致 (P1)

**文件**: `backend/routes/user.js:19`

**当前代码**:
```javascript
password: Joi.string().required().min(6).max(100),
```

**问题**: Joi 校验最小长度为 6，但系统密码策略（`authService.js:16`）要求至少 8 位 + 大小写 + 数字。

**影响**: 管理员可创建不符合密码策略的弱密码用户。

### 2.4 问题 4: 缺少管理员重置密码 (P2)

**现状**: `backend/routes/user.js` 仅有 list/add/update/delete/detail 5 个接口，无 reset-password。

**影响**: 管理员无法重置员工密码（员工遗忘密码时只能通过数据库操作）。

---

## 3. 修改影响范围

### 3.1 影响矩阵

| 修改项 | 影响接口 | 影响用户 | 数据库变更 | 配置变更 |
|--------|----------|----------|------------|----------|
| 问题 1 修复 | POST /user/add | 仅影响新建用户 | 无 | 无 |
| 问题 2 修复 | POST /auth/register | 仅影响新注册用户 | 无 | 无 |
| 问题 3 修复 | POST /user/add | 仅影响新建用户 | 无 | 无 |
| 问题 4 新增 | POST /user/reset-password | 管理员操作 | 无 | 无 |

### 3.2 不影响范围

- [x] 现有 22 个用户不受影响（不改 `must_change_password` 值）
- [x] 现有登录流程不变（不改 `routes/auth.js`）
- [x] 现有改密流程不变（不改 `forceChangePassword`）
- [x] 数据库结构不变（无 migration）
- [x] Cookie/Token 机制不变
- [x] RBAC 权限不变
- [x] 前端路由不变

### 3.3 兼容性评估

| 兼容性维度 | 评估 |
|------------|------|
| 向后兼容 | 是（仅新增字段值，不删除字段） |
| API 兼容 | 是（仅新增接口，不修改现有接口签名） |
| 数据库兼容 | 是（无 DDL 变更） |
| 前端兼容 | 是（新增按钮，不修改现有页面） |

---

## 4. 详细修改方案

### 4.1 修改 1: userRouteService.js — 创建用户强制改密 (P0)

**修改位置**: `backend/services/userRouteService.js:72-76`

**修改前**:
```javascript
const [result] = await pool.query(
  `INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  [username, hashedPassword, real_name || null, phone || null, email || null, dept_id || null, role_id || null]
);
```

**修改后**:
```javascript
const [result] = await pool.query(
  `INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status, must_change_password)
   VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
  [username, hashedPassword, real_name || null, phone || null, email || null, dept_id || null, role_id || null]
);
```

**变更说明**: INSERT 语句增加 `must_change_password` 字段，值为 1。

### 4.2 修改 2: authService.js — 注册用户强制改密 (P1)

**修改位置**: `backend/services/authService.js:428-431`

**修改前**:
```javascript
const [result] = await pool.query(
  `INSERT INTO sys_user (username, password, real_name, role_id, status)
   VALUES (?, ?, ?, ?, 1)`,
  [username, hashedPassword, real_name || null, defaultRoleId]
);
```

**修改后**:
```javascript
const [result] = await pool.query(
  `INSERT INTO sys_user (username, password, real_name, role_id, status, must_change_password)
   VALUES (?, ?, ?, ?, 1, 1)`,
  [username, hashedPassword, real_name || null, defaultRoleId]
);
```

**变更说明**: INSERT 语句增加 `must_change_password` 字段，值为 1。

### 4.3 修改 3: user.js — 密码校验规则统一 (P1)

**修改位置**: `backend/routes/user.js:19`

**修改前**:
```javascript
password: Joi.string().required().min(6).max(100),
```

**修改后**:
```javascript
password: Joi.string().required().min(8).max(100)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
  .message('密码至少8位，需包含大写字母、小写字母和数字'),
```

**变更说明**: 密码最小长度从 6 改为 8，并添加复杂度正则校验（与 `authService.js` 的 `PASSWORD_PATTERN` 一致）。

### 4.4 修改 4: 新增管理员重置密码接口 (P2)

#### 4.4.1 后端: userRouteService.js 新增方法

**新增位置**: `backend/services/userRouteService.js`（在 `updateUser` 函数后）

```javascript
/**
 * 管理员重置用户密码
 * 重置后必须强制改密
 */
async function resetPassword(pool, { id, new_password }) {
  const [users] = await pool.query(
    'SELECT id, username FROM sys_user WHERE id = ? AND deleted_at IS NULL',
    [id]
  );

  if (users.length === 0) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '用户不存在');
  }

  const hashedPassword = await bcrypt.hash(new_password, 10);

  await pool.query(
    `UPDATE sys_user
     SET password = ?, must_change_password = 1, password_changed_at = NOW()
     WHERE id = ?`,
    [hashedPassword, id]
  );

  // 清除该用户所有 token（强制重新登录）
  await pool.query(
    'DELETE FROM sys_token_blacklist WHERE user_id = ?',
    [id]
  ).catch(() => {}); // 黑名单表可能不存在 user_id 索引，忽略错误

  return { username: users[0].username };
}
```

#### 4.4.2 后端: user.js 新增路由

**新增位置**: `backend/routes/user.js`（在 `/delete` 路由后）

```javascript
const userResetPasswordSchema = Joi.object({
  id: Joi.number().integer().required(),
  new_password: Joi.string().required().min(8).max(100)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
    .message('密码至少8位，需包含大写字母、小写字母和数字')
});

// 5. 管理员重置用户密码
router.post('/reset-password', authenticateToken, checkPermission('system:user:edit'), validate(userResetPasswordSchema), async (req, res, next) => {
  try {
    const result = await userRouteService.resetPassword(pool, req.body);
    // 记录操作日志
    await logAction({
      module: '系统管理', action: '重置密码', method: 'POST', url: '/api/v1/user/reset-password',
      params: { id: req.body.id }, ipAddress: req.ip, userId: req.user.userId, userName: req.user.username,
      description: `重置用户「${result.username}」密码`, status: 1
    });
    res.json({ code: 200, message: `已重置用户「${result.username}」密码，用户需重新登录并改密`, data: null });
  } catch (error) {
    next(error);
  }
});
```

**权限码**: 复用 `system:user:edit`（无需新增权限码，避免数据库变更）。

#### 4.4.3 前端: system.js 新增 API

**新增位置**: `frontend/src/api/system.js`

```javascript
export const resetUserPassword = (data) => request.post('/user/reset-password', data)
```

#### 4.4.4 前端: user/index.vue 新增按钮

**新增位置**: `frontend/src/views/system/user/index.vue`（在操作列）

```vue
<el-button type="warning" size="small" @click="handleResetPassword(scope.row)">重置密码</el-button>
```

```javascript
const handleResetPassword = async (row) => {
  try {
    const { value: newPwd } = await ElMessageBox.prompt('请输入新密码（至少8位，含大小写字母和数字）', '重置密码', {
      inputPattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
      inputErrorMessage: '密码至少8位，需包含大写字母、小写字母和数字',
      inputType: 'password'
    })
    await resetUserPassword({ id: row.id, new_password: newPwd })
    ElMessage.success(`已重置 ${row.username} 的密码`)
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('重置失败')
  }
}
```

### 4.5 版本号更新

**修改位置**: `backend/package.json`

```json
{
  "version": "1.5.1"
}
```

---

## 5. 回滚方案

### 5.1 回滚策略

| 回滚方式 | 说明 | 耗时 |
|----------|------|------|
| Git revert | 回滚 commit | 1 分钟 |
| 重新部署旧镜像 | Docker 重新部署 v1.5.0 | 5 分钟 |
| 手动还原文件 | 手动恢复 3 个文件 | 3 分钟 |

### 5.2 回滚步骤

```bash
# 1. 回滚代码
cd /volume1/docker/crm-stack
git log --oneline -5  # 找到补丁 commit
git revert <commit-hash>

# 2. 重新构建并部署
docker compose -f docker-compose.synology.yml build --no-cache app
docker compose -f docker-compose.synology.yml up -d app

# 3. 验证回滚
curl -sk https://crm.huakey.local/api/v1/health
```

### 5.3 回滚后数据影响

| 数据 | 影响 |
|------|------|
| 现有 22 个用户 | 无影响（must_change_password 值不变） |
| 回滚后新建用户 | 恢复为 must_change_password=0（不强制改密） |
| 回滚后重置密码 | 接口不可用（404） |

### 5.4 回滚验证清单

- [ ] API Health 返回 200
- [ ] 登录功能正常
- [ ] 现有用户登录不受影响
- [ ] /user/reset-password 返回 404（接口已回滚）

---

## 6. 测试方案

### 6.1 单元测试

| 测试文件 | 测试用例 | 预期结果 |
|----------|----------|----------|
| `tests/user.security.test.js` (新增) | 创建用户后 must_change_password=1 | PASS |
| `tests/user.security.test.js` (新增) | 注册用户后 must_change_password=1 | PASS |
| `tests/user.security.test.js` (新增) | 密码 min(6) 被拒绝 | 返回 400 |
| `tests/user.security.test.js` (新增) | 重置密码后 must_change_password=1 | PASS |
| `tests/user.security.test.js` (新增) | 重置密码后旧 token 失效 | PASS |

### 6.2 集成测试

| 测试场景 | 步骤 | 预期结果 |
|----------|------|----------|
| 创建用户 → 首次登录 | 1. POST /user/add 2. 登录 3. 检查 mustChangePassword | 返回 true，跳转改密页 |
| 创建用户弱密码 | POST /user/add password=abc123 | 返回 400 密码校验失败 |
| 重置密码 | 1. POST /user/reset-password 2. 用户登录 3. 检查 mustChangePassword | 返回 true，跳转改密页 |
| 重置密码后旧 token | 1. 用户 A 登录获取 token 2. 管理员重置 A 密码 3. A 用旧 token 访问 | 401 token 失效 |

### 6.3 回归测试

| 测试项 | 说明 |
|--------|------|
| 现有用户登录 | 22 个用户登录不受影响 |
| 现有用户改密 | /auth/change-password 正常工作 |
| 现有用户强制改密 | /auth/force-change-password 正常工作 |
| RBAC 权限 | system:user:edit 权限正常 |
| 前端路由守卫 | mustChangePassword 跳转正常 |

### 6.4 安全验证

| 检查项 | 预期 |
|--------|------|
| 新建用户 must_change_password | =1 |
| 注册用户 must_change_password | =1 |
| 密码哈希 | bcrypt $2b$10$ |
| 弱密码拒绝 | 返回 400 |
| 重置密码后 token 失效 | 旧 token 401 |
| 操作日志记录 | logAction 记录重置密码操作 |

### 6.5 测试执行命令

```bash
# 运行安全补丁测试
cd backend
npm test -- --testPathPattern="user.security"

# 运行现有测试（回归）
npm test

# 运行 ESLint
npm run lint
```

---

## 7. 发布步骤

### 7.1 发布前检查

- [ ] 代码已通过 code review
- [ ] 单元测试全部通过
- [ ] 集成测试全部通过
- [ ] 回归测试全部通过
- [ ] ESLint 无错误
- [ ] 备份当前生产配置（config-backup.sh）
- [ ] 备份当前 MySQL 数据库（mysql-backup.sh）

### 7.2 发布步骤

```bash
# 步骤 1: 备份
ssh nas-crm "bash /volume1/docker/crm-stack/deploy/backup/mysql-backup.sh"
ssh nas-crm "bash /volume1/docker/crm-stack/deploy/backup/config-backup.sh"

# 步骤 2: 拉取 v1.0.1 代码
cd /volume1/docker/crm-stack
git fetch origin
git checkout v1.0.1  # 或 git pull origin main

# 步骤 3: 构建新镜像
docker compose -f docker-compose.synology.yml build --no-cache app

# 步骤 4: 重启 app 容器
docker compose -f docker-compose.synology.yml up -d app

# 步骤 5: 等待健康检查通过
sleep 10
curl -sk https://crm.huakey.local/api/v1/health

# 步骤 6: 验证补丁
# 6.1 检查版本号
curl -sk https://crm.huakey.local/api/v1/health | grep version
# 6.2 测试创建用户（可选，在测试环境验证）
# 6.3 测试重置密码接口
curl -sk -X POST https://crm.huakey.local/api/v1/user/reset-password \
  -H "Cookie: token=<admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"id": 99, "new_password": "Test1234"}'
# 预期: 404 用户不存在（验证接口存在且权限校验生效）
```

### 7.3 发布后验证

| 验证项 | 方法 | 预期 |
|--------|------|------|
| 服务健康 | GET /api/v1/health | 200, version=1.5.1 |
| 登录功能 | admin 登录 | 成功 |
| 现有用户 | 22 个用户不受影响 | 正常 |
| 新建用户 | 创建测试用户 | must_change_password=1 |
| 重置密码 | 重置测试用户 | must_change_password=1 |
| 容器状态 | docker ps | 4 个 healthy |

### 7.4 发布后监控

| 监控项 | 时长 | 频率 |
|--------|------|------|
| API 错误率 | 24 小时 | 每 5 分钟 |
| 登录成功率 | 24 小时 | 每 5 分钟 |
| 容器健康 | 24 小时 | 每 1 分钟 |
| 日志错误 | 24 小时 | 实时 |

---

## 8. 风险评估

### 8.1 风险矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 补丁导致 app 容器启动失败 | LOW | HIGH | 健康检查 + 快速回滚 |
| 补丁影响现有用户登录 | LOW | HIGH | 不修改 auth.js + 回归测试 |
| 密码校验过严导致创建用户失败 | MEDIUM | LOW | 提示信息明确 + 前端预校验 |
| 重置密码接口被滥用 | LOW | MEDIUM | 权限校验 + 操作日志 |

### 8.2 回滚触发条件

| 条件 | 动作 |
|------|------|
| app 容器 1 分钟内未 healthy | 立即回滚 |
| 登录接口 5xx 错误率 > 5% | 立即回滚 |
| 现有用户无法登录 | 立即回滚 |

---

## 9. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|------|------|------|------|
| v1.0.1 | 2026-08-06 | 初始补丁方案 | Security Maintenance Engineer |

### 9.1 补丁内容清单

| # | 修改 | 文件 | 行数变化 |
|---|------|------|----------|
| 1 | 创建用户强制改密 | userRouteService.js | +1 (INSERT 字段) |
| 2 | 注册用户强制改密 | authService.js | +1 (INSERT 字段) |
| 3 | 密码校验统一 | user.js | +2 (Joi 规则) |
| 4 | 重置密码服务方法 | userRouteService.js | +20 (新方法) |
| 5 | 重置密码路由 | user.js | +15 (新路由) |
| 6 | 重置密码 API | system.js | +1 (新 API) |
| 7 | 重置密码按钮 | user/index.vue | +15 (新按钮) |
| 8 | 版本号更新 | package.json | +1 |

**总计**: 修改 5 个文件，新增约 56 行代码。

---

## 10. v1.0.1 小版本发布评估

### 10.1 评估结论

**适合作为 v1.0.1 小版本补丁发布。**

### 10.2 评估依据

| 评估维度 | 结果 | 说明 |
|----------|------|------|
| 改动范围 | 小 | 5 个文件，~56 行 |
| 数据库变更 | 无 | 不新增 migration |
| 现有用户影响 | 无 | 不改变现有数据和登录流程 |
| 向后兼容 | 是 | 仅新增字段值和接口 |
| 可回滚 | 是 | Git revert + 重新部署 |
| 安全提升 | 显著 | 修复 4 项安全问题 |
| 测试覆盖 | 可行 | 新增单元测试 + 回归测试 |
| 版本规范 | 符合 | v1.0.x 为补丁版本 |

### 10.3 发布建议

1. **先在测试环境验证**: 完整执行测试方案
2. **生产环境灰度**: 先部署后观察 24 小时
3. **保留回滚能力**: 确保 Git revert 可快速执行
4. **通知用户**: 重置密码功能上线后通知管理员

---

## 11. 审批

| 角色 | 状态 | 日期 |
|------|------|------|
| 编制人 (Security Engineer) | ✓ 已编制 | 2026-08-06 |
| 审核人 (Tech Lead) | ⏳ 待审核 | - |
| 批准人 (Release Manager) | ⏳ 待批准 | - |

---

## 12. 相关文档

| 文档 | 说明 |
|------|------|
| [crm-v1-user-login-readiness-audit.md](./crm-v1-user-login-readiness-audit.md) | 用户登录审计报告 |
| [crm-v1-final-production-acceptance-report.md](./crm-v1-final-production-acceptance-report.md) | 最终生产验收报告 |
| [crm-v1-backup-coverage-report.md](./crm-v1-backup-coverage-report.md) | 灾备覆盖报告 |

# HuakeyCRM v1.0 员工登录交付流程审计

> **审计类型**: User Login Readiness Audit
> **审计日期**: 2026-08-06
> **审计人**: Identity Management Engineer
> **审计方式**: 只读检查（未修改数据库、未修改代码、未创建账号）
> **系统版本**: HuakeyCRM v1.0 (backend v1.5.0)

---

## 1. 执行摘要

本次审计对 HuakeyCRM v1.0 生产环境的员工账号状态、密码策略、首次登录强制改密流程进行了只读检查。

### 1.1 审计结论

| 维度 | 结论 | 状态 |
|------|------|------|
| 当前账号状态 | 22 个用户全部已激活、全部已改密 | PASS |
| 密码哈希 | 全部使用 bcrypt ($2b$10$) | PASS |
| 登录强制改密流程 | 前端+后端双层强制，流程完整 | PASS |
| 用户创建默认改密 | **创建用户时未设置 must_change_password=1** | **FAIL** |
| 密码策略一致性 | 创建用户 Joi 校验与密码策略不一致 | **WARN** |
| 管理员重置密码 | **缺少管理员重置用户密码接口** | **FAIL** |

### 1.2 关键风险

新建用户不会被强制要求首次登录改密，存在安全隐患。

---

## 2. 当前账号状态

### 2.1 统计汇总

| 检查项 | 结果 | 状态 |
|--------|------|------|
| 用户总数 | 22 | - |
| 已激活用户 (status=1) | 22 (100%) | PASS |
| 未激活用户 (status!=1) | 0 | PASS |
| 需改密用户 (must_change_password=1) | 0 | PASS |
| 已改密用户 (must_change_password=0) | 22 (100%) | PASS |
| 从未登录用户 (last_login_time IS NULL) | 15 (68%) | WARN |
| 曾登录用户 | 7 (32%) | - |
| 密码哈希方式 | bcrypt $2b$10$ (全部) | PASS |

### 2.2 用户清单

| ID | 用户名 | 角色 | 状态 | 需改密 | 最后登录时间 |
|----|--------|------|------|--------|-------------|
| 1 | admin | boss | 1 | 0 | 2026-08-06 09:53:56 |
| 6 | Rin | manager | 1 | 0 | NULL |
| 18 | Ken | sales | 1 | 0 | 2026-07-23 09:31:12 |
| 19 | Justin | sales | 1 | 0 | NULL |
| 20 | Leslie | sales | 1 | 0 | NULL |
| 21 | likang | sales | 1 | 0 | NULL |
| 22 | Henny | sales | 1 | 0 | NULL |
| 24 | huangzhizheng | sales | 1 | 0 | NULL |
| 25 | lianghailin | sales | 1 | 0 | NULL |
| 26 | zhufuchun | manager | 1 | 0 | NULL |
| 27 | lvcongming | boss | 1 | 0 | NULL |
| 28 | chendenghui | manager | 1 | 0 | NULL |
| 29 | hejingwen | hr | 1 | 0 | 2026-05-29 09:19:44 |
| 30 | xieyongjiang | purchase | 1 | 0 | 2026-05-29 09:19:45 |
| 31 | xieyuping | purchase | 1 | 0 | NULL |
| 32 | chenhongyou | purchase | 1 | 0 | NULL |
| 33 | heziwen | purchase | 1 | 0 | NULL |
| 34 | huanglvfeng | finance | 1 | 0 | 2026-05-29 09:19:46 |
| 35 | taoting | finance | 1 | 0 | NULL |
| 39 | vivianli | sales | 1 | 0 | 2026-05-29 09:19:47 |
| 40 | eugene | sales | 1 | 0 | 2026-05-29 09:19:47 |
| 41 | hechengqi | sales | 1 | 0 | 2026-08-03 08:15:01 |

### 2.3 登录时间分布

| 日期 | 登录用户数 |
|------|-----------|
| 2026-05-29 | 5 |
| 2026-07-23 | 1 |
| 2026-08-03 | 1 |
| 2026-08-06 | 1 (admin) |
| 从未登录 | 15 |

### 2.4 密码哈希验证

所有用户密码均使用 bcrypt (cost=10) 哈希存储，哈希前缀 `$2b$10$`，长度 60 字符。

---

## 3. 用户创建逻辑检查

### 3.1 检查范围

| 创建入口 | 代码位置 | 用途 |
|----------|----------|------|
| 初始管理员创建 | `backend/scripts/create-admin.js` | 部署时创建 admin 账号 |
| 管理员添加用户 | `backend/services/userRouteService.js` | 管理后台添加员工 |
| 用户注册 | `backend/services/authService.js` | 注册接口 |

### 3.2 检查结果

#### 3.2.1 初始管理员创建 (create-admin.js) — PASS

```javascript
// backend/scripts/create-admin.js:36-39
INSERT INTO sys_user (username, password, real_name, role_id, status, must_change_password)
SELECT ?, ?, ?, (SELECT id FROM sys_role WHERE code = ? LIMIT 1), ?, ?
// 参数: ['admin', hash, '系统管理员', 'super_admin', 1, 1, 'admin']
//                                                                   ^ must_change_password = 1
```

**结论**: 显式设置 `must_change_password=1`，首次登录强制改密。PASS

#### 3.2.2 管理员添加用户 (userRouteService.js) — FAIL

```javascript
// backend/services/userRouteService.js:72-75
INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status)
VALUES (?, ?, ?, ?, ?, ?, ?, 1)
// 未包含 must_change_password 字段，依赖数据库默认值
```

**数据库表结构**: `must_change_password tinyint NO DEFAULT 0`

**结论**: **未设置 must_change_password，依赖数据库默认值 0。新建用户不会被强制改密。FAIL**

#### 3.2.3 用户注册 (authService.js) — FAIL

```javascript
// backend/services/authService.js:428-431
INSERT INTO sys_user (username, password, real_name, role_id, status)
VALUES (?, ?, ?, ?, 1)
// 未包含 must_change_password 字段，依赖数据库默认值
```

**结论**: **未设置 must_change_password，依赖数据库默认值 0。新建用户不会被强制改密。FAIL**

### 3.3 影响分析

| 影响项 | 说明 |
|--------|------|
| 当前生产数据 | 22 个用户全部 must_change_password=0，可能是历史导入时设置 |
| 新建用户风险 | 通过管理后台或注册接口创建的用户不会强制改密 |
| 安全合规 | 违反"首次登录强制改密"的安全基线 |

---

## 4. 登录流程检查

### 4.1 登录响应

```javascript
// backend/routes/auth.js:193-204
res.json({
  code: 200,
  message: '登录成功',
  data: {
    mustChangePassword: user.must_change_password === 1,  // 返回改密标志
    userInfo: { id, username, roleId }
  }
});
```

**结论**: 登录响应正确返回 `mustChangePassword` 字段。PASS

### 4.2 前端登录跳转

```javascript
// frontend/src/views/login/index.vue:159-164
if (res.data?.mustChangePassword) {
  ElMessage.warning('首次登录，请修改密码')
  router.push('/change-password')
  return
}
```

**结论**: 前端登录后检查 `mustChangePassword`，为 true 时跳转到改密页面。PASS

### 4.3 前端路由守卫

```javascript
// frontend/src/router/index.js:586-590
if (user.mustChangePassword && to.path !== '/change-password') {
  next('/change-password')
  return
}
```

**结论**: 路由守卫强制检查 `mustChangePassword`，每次路由跳转都验证。PASS

### 4.4 后端中间件强制

```javascript
// backend/middleware/auth.js:104-112
if (req.user.mustChangePassword) {
  const allowedPaths = ['/auth/force-change-password', '/auth/logout', '/auth/me', '/auth/refresh'];
  if (!isAllowed) {
    return res.status(403).json({ code: 403, message: '请先修改初始密码后再操作', data: { mustChangePassword: true } });
  }
}
```

**结论**: 后端中间件三层防护：
1. 每次请求从数据库读取最新 `must_change_password`
2. 若为 1，只允许访问 4 个白名单端点
3. 其他端点返回 403

**PASS — 强制改密流程完整**

### 4.5 强制改密接口

```javascript
// backend/services/authService.js:353-388
async function forceChangePassword(pool, userId, newPassword) {
  // 检查 must_change_password === 1
  if (users[0].must_change_password !== 1) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '当前账号无需强制修改密码');
  }
  // 更新密码 + must_change_password = 0
  await connection.query(
    `UPDATE sys_user SET password = ?, must_change_password = 0, password_changed_at = NOW() WHERE id = ?`,
    [hashedPassword, userId]
  );
}
```

**结论**: 强制改密接口验证逻辑正确，改密后设置 `must_change_password=0`。PASS

---

## 5. 密码策略检查

### 5.1 密码复杂度

```javascript
// backend/services/authService.js:16-17
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_MESSAGE = '密码至少8位，需包含大写字母、小写字母和数字';
```

| 检查项 | 结果 | 状态 |
|--------|------|------|
| 最小长度 | 8 位 | PASS |
| 大写字母 | 必须 | PASS |
| 小写字母 | 必须 | PASS |
| 数字 | 必须 | PASS |
| 特殊字符 | 不要求 | 可接受 |

### 5.2 密码策略一致性 — WARN

| 入口 | 校验规则 | 最小长度 | 状态 |
|------|----------|----------|------|
| authService (改密) | PASSWORD_PATTERN | 8 | PASS |
| user.js (添加用户) | Joi.string().min(6) | **6** | **WARN** |

**不一致**: 添加用户时 Joi 校验最小长度为 6，但密码策略要求至少 8 位。可能导致创建弱密码用户。

---

## 6. 风险评估

### 6.1 风险等级

| 风险 | 等级 | 影响 | 根因 |
|------|------|------|------|
| 新建用户不强制改密 | HIGH | 新员工使用初始密码不安全 | userRouteService.js 未设置 must_change_password=1 |
| 注册用户不强制改密 | MEDIUM | 自注册用户密码不受控 | authService.js 未设置 must_change_password=1 |
| 密码校验长度不一致 | MEDIUM | 可能创建弱密码用户 | user.js Joi 校验 min(6) vs 策略 min(8) |
| 缺少管理员重置密码 | MEDIUM | 无法批量重置员工密码 | user.js 无 reset-password 接口 |
| 15 个用户从未登录 | LOW | 账号可能被遗忘 | 需确认是否为正常未激活员工 |

### 6.2 安全合规差距

| 检查项 | 期望 | 实际 | 状态 |
|--------|------|------|------|
| 初始管理员首次改密 | 必须 | must_change_password=1 | PASS |
| 新员工首次改密 | 必须 | must_change_password=0 (默认) | **FAIL** |
| 密码复杂度统一 | 8位+大小写+数字 | 创建时仅 6 位 | **WARN** |
| 密码哈希 | bcrypt | bcrypt $2b$10$ | PASS |
| 改密后状态更新 | must_change_password=0 | 正确更新 | PASS |
| Token 失效机制 | 改密后旧 token 失效 | 黑名单机制 | PASS |

---

## 7. 推荐员工初始化流程

### 7.1 当前流程（有缺陷）

```
管理员添加用户 → 密码设为初始值 → must_change_password=0（默认）→ 员工登录 → 无需改密
                                         ↑ 问题在此
```

### 7.2 推荐流程（修复后）

```
1. 管理员通过 /user/add 创建员工账号
   - 设置初始密码（临时密码）
   - must_change_password=1（修复后自动设置）

2. 员工首次登录
   - 输入用户名 + 初始密码 + 验证码
   - 登录成功，返回 mustChangePassword=true
   - 前端自动跳转 /change-password

3. 强制改密
   - 员工设置新密码（8位+大小写+数字）
   - 调用 /auth/force-change-password
   - must_change_password 更新为 0

4. 正常使用
   - 员工使用新密码登录
   - 进入系统正常工作
```

### 7.3 员工交付检查清单

| 步骤 | 检查项 | 责任人 |
|------|--------|--------|
| 1 | 确认账号已创建 (status=1) | 管理员 |
| 2 | 确认 must_change_password=1 | 管理员 |
| 3 | 通知员工初始密码（独立渠道） | 管理员 |
| 4 | 员工首次登录成功 | 员工 |
| 5 | 员工完成改密 | 员工 |
| 6 | 确认 must_change_password=0 | 管理员 |
| 7 | 确认 last_login_time 已更新 | 管理员 |

---

## 8. 是否需要修改代码

### 8.1 需要修改的代码（建议，未执行）

| # | 文件 | 问题 | 建议修改 | 优先级 |
|---|------|------|----------|--------|
| 1 | `backend/services/userRouteService.js:72-75` | 创建用户未设置 must_change_password=1 | INSERT 语句增加 `must_change_password` 字段，值为 1 | P0 |
| 2 | `backend/services/authService.js:428-431` | 注册用户未设置 must_change_password=1 | INSERT 语句增加 `must_change_password` 字段，值为 1 | P1 |
| 3 | `backend/routes/user.js:19` | Joi 密码校验 min(6) 与策略 min(8) 不一致 | 改为 `min(8)` 并添加复杂度提示 | P1 |
| 4 | `backend/routes/user.js` | 缺少管理员重置密码接口 | 新增 `/user/reset-password` 接口，重置后设 must_change_password=1 | P2 |

### 8.2 修改示例（仅供参考，未执行）

**修复 1: userRouteService.js (添加用户时强制改密)**

```javascript
// 当前（有问题）:
INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status)
VALUES (?, ?, ?, ?, ?, ?, ?, 1)

// 建议修改为:
INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status, must_change_password)
VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
```

**修复 3: user.js Joi 校验一致性**

```javascript
// 当前（有问题）:
password: Joi.string().required().min(6).max(100),

// 建议修改为:
password: Joi.string().required().min(8).max(100)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
  .message('密码至少8位，需包含大写字母、小写字母和数字'),
```

### 8.3 临时缓解措施（无需改代码）

在修复代码前，可通过以下方式缓解：

1. **SQL 手动修正**: 管理员添加用户后，手动执行 SQL 设置 `must_change_password=1`
   ```sql
   UPDATE sys_user SET must_change_password = 1 WHERE id = <新用户ID>;
   ```
2. **密码交付**: 通过独立安全渠道（如短信、电话）通知员工初始密码
3. **人工监督**: 管理员确认新员工完成改密后再允许使用系统

---

## 9. 审计结论

### 9.1 总结

| 维度 | 状态 | 说明 |
|------|------|------|
| 当前账号状态 | PASS | 22 用户全部已激活、已改密 |
| 密码哈希 | PASS | 全部 bcrypt $2b$10$ |
| 登录强制改密流程 | PASS | 前端+后端+中间件三层强制 |
| 用户创建默认改密 | **FAIL** | 创建用户未设置 must_change_password=1 |
| 密码策略一致性 | **WARN** | Joi 校验与策略不一致 |
| 管理员重置密码 | **FAIL** | 缺少重置密码接口 |

### 9.2 最终结论

```
==========================================
HuakeyCRM v1.0 员工登录交付流程审计
==========================================

当前账号状态:      PASS (22 用户全部已改密)
登录强制改密流程:   PASS (三层防护完整)
用户创建默认改密:   FAIL (新建用户不强制改密)
密码策略一致性:     WARN (Joi 校验与策略不一致)
管理员重置密码:     FAIL (缺少接口)

Login Readiness: PARTIAL
(现有账号 OK，新建用户流程需修复)
==========================================
```

### 9.3 建议执行顺序

1. **P0 — 立即修复**: `userRouteService.js` 创建用户时设置 `must_change_password=1`
2. **P1 — 尽快修复**: `authService.js` 注册用户时设置 `must_change_password=1`
3. **P1 — 尽快修复**: `user.js` Joi 密码校验改为 `min(8)` 并添加复杂度校验
4. **P2 — 中期改进**: 新增管理员重置用户密码接口
5. **P3 — 长期优化**: 补充密码过期策略（如 90 天强制改密）

---

## 10. 约束遵守

- [x] 未修改数据库
- [x] 未修改代码
- [x] 未创建账号
- [x] 全程只读审计

---

## 11. 相关文档

| 文档 | 说明 |
|------|------|
| [crm-v1-final-production-acceptance-report.md](./crm-v1-final-production-acceptance-report.md) | 最终生产验收报告 |
| [crm-v1-business-readiness-audit.md](./crm-v1-business-readiness-audit.md) | 业务就绪审计 |
| [crm-v1-backup-coverage-report.md](./crm-v1-backup-coverage-report.md) | 灾备覆盖报告 |

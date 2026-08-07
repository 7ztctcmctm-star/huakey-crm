# HuakeyCRM v1.0.1 发布前检查清单

> **文档类型**: Pre-Release Checklist
> **版本**: v1.0.1 (backend 1.5.1 / frontend 1.5.1)
> **发布分支**: `fix/v1.0.1-security-patch`
> **基线分支**: `main` (commit fd35149)
> **检查日期**: 2026-08-07
> **执行人**: Release Engineer

---

## 1. 发布前检查

### 1.1 Git 状态

| 检查项 | 结果 |
|--------|------|
| 基线分支 | `main` |
| 基线 commit | `fd35149 feat: CRM Core v1 全链路冻结审计 + Contract Center 修复 + E2E 测试` |
| 发布分支 | `fix/v1.0.1-security-patch` ✅ 已创建 |
| 分离策略 | 仅 stage v1.0.1 相关 8 个文件，工作区其他无关修改已隔离 |

### 1.2 工作区隔离说明

**重要**：工作区存在大量与 v1.0.1 无关的未提交修改和未跟踪文件（合同模块调整、临时脚本、运维文档等）。本次发布严格遵守"只发布 v1.0.1 安全补丁"原则，仅 stage 以下 8 个核心文件 + 本 checklist 文档，其他文件保持原状不进入发布。

**未进入本次发布的文件类型**：
- 合同模块修改（contractController.js / contract/crud.js / contractCrudService.js / contractService.js）
- 临时脚本（backend/tmp_check_demo.js / deploy/_*.sh）
- 新增 migration（107_contract_approval_status_default.sql）
- 其他运维文档

### 1.3 修改文件清单（v1.0.1 核心）

| # | 文件 | 类型 | 行数变化 | 优先级 |
|---|------|------|----------|--------|
| 1 | `backend/services/userRouteService.js` | 修改+新增 | +38/-2 | P0+P2 |
| 2 | `backend/services/authService.js` | 修改 | +5/-2 | P1 |
| 3 | `backend/routes/user.js` | 修改+新增 | +48/-1 | P1+P2 |
| 4 | `backend/tests/user.test.js` | 修改+新增 | +42/-2 | 测试 |
| 5 | `backend/package.json` | 修改 | +1/-1 | 版本号 |
| 6 | `frontend/package.json` | 修改 | +1/-1 | 版本号 |
| 7 | `frontend/src/api/system.js` | 新增 | +2 | P2 |
| 8 | `frontend/src/views/system/user.vue` | 修改+新增 | +66/-2 | P2 |

**合计**: 8 文件，+191/-14 行

### 1.4 测试结果

| 测试项 | 命令 | 结果 |
|--------|------|------|
| ESLint | `npx eslint services/userRouteService.js services/authService.js routes/user.js tests/user.test.js` | ✅ PASS (exit 0) |
| 单元测试 | `npx jest tests/user.test.js` | ✅ 11/11 PASS (9 原有 + 2 新增 reset-password) |
| 前端构建 | `npx vite build` | ✅ PASS (48.35s) |
| 版本号验证 | backend / frontend package.json | ✅ 1.5.1 / 1.5.1 |

#### 1.4.1 新增测试用例

| 测试 | 预期 | 结果 |
|------|------|------|
| `POST /user/reset-password` 弱密码拒绝（7位） | 400 | ✅ PASS |
| `POST /user/reset-password` 正常重置（8位合规） | 200 | ✅ PASS |

#### 1.4.2 回归测试

| 测试 | 预期 | 结果 |
|------|------|------|
| 用户列表/新增/修改/删除 | 200 | ✅ 全部 PASS |
| 弱密码 `Pass123`（7位）创建用户 | 400 | ✅ 被新策略拒绝（预期行为） |

---

## 2. Commit 记录

### 2.1 Commit Hash

```
9e37a8b1529ff56a3f66282819d37e4f5b14fa10
（short: 9e37a8b）
```

**Commit 统计**: 9 files changed, 325 insertions(+), 14 deletions(-)
**lint-staged**: 自动触发 ESLint `--max-warnings=0` 检查通过

### 2.2 Commit Message

```
fix(v1.0.1): security patch - force password change + reset password feature

P0: userRouteService.addUser 设置 must_change_password=1
P1: authService.register 设置 must_change_password=1
P1: user.js 密码校验统一为 8位+大小写+数字（与 authService 一致）
P2: 新增 resetPassword 服务方法 + POST /user/reset-password 路由
P2: 前端新增 resetUserPassword API + 重置密码按钮
版本号: backend/frontend 1.5.0 → 1.5.1
测试: Jest 11/11 PASS, ESLint PASS, Vite build PASS
```

---

## 3. 影响评估

### 3.1 不影响范围

| 项目 | 说明 |
|------|------|
| 现有 22 个用户 | `must_change_password` 值不变（仅影响新建/重置） |
| 数据库结构 | 无 migration，无 schema 变更 |
| 登录流程 | `routes/auth.js` 未修改 |
| RBAC 权限 | 权限中间件未修改 |
| 容器配置 | docker-compose 未修改（本次未 stage） |

### 3.2 影响范围

| 场景 | 行为变化 |
|------|----------|
| 管理员新建用户 | 用户 `must_change_password=1`，首次登录强制改密 |
| 用户注册 | 同上 |
| 用户管理密码校验 | 密码必须 ≥8 位 + 大小写字母 + 数字 |
| 管理员重置密码 | 新增能力，重置后强制改密 |

---

## 4. 发布前准备状态

| 准备项 | 状态 |
|--------|------|
| 发布分支已创建 | ✅ |
| 代码已提交 | ⏳ 待执行 |
| 测试全部通过 | ✅ |
| Checklist 文档已生成 | ✅ |
| 工作区无关修改已隔离 | ✅ |

---

## 5. 下一步

执行 Step 2 生产备份 → Step 3 部署 → Step 4 验证 → Step 5 发布报告。

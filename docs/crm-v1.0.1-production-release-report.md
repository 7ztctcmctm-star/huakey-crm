# HuakeyCRM v1.0.1 生产发布完成报告

> **文档类型**: Production Release Report
> **发布版本**: v1.0.1 (backend 1.5.1 / frontend 1.5.1)
> **发布分支**: `fix/v1.0.1-security-patch`
> **Commit Hash**: `9e37a8b1529ff56a3f66282819d37e4f5b14fa10` (short: `9e37a8b`)
> **基线 Commit**: `fd35149` (main)
> **发布日期**: 2026-08-07
> **执行人**: Release Engineer
> **生产环境**: 群晖 NAS DSM 7.x / Docker CRM Stack
> **访问地址**: http://192.168.0.200:6789

---

## 1. 发布时间

| 阶段 | 时间 (Asia/Shanghai) |
|------|---------------------|
| 发布前检查 (Step 1) | 2026-08-07 |
| 生产备份 (Step 2) | 2026-08-07 |
| 部署流程 (Step 3) | 2026-08-07 |
| 发布验证 (Step 4) | 2026-08-07 |
| 报告生成 (Step 5) | 2026-08-07 |
| **发布完成** | **2026-08-07** |

---

## 2. 发布版本

| 组件 | 旧版本 | 新版本 |
|------|--------|--------|
| Backend (Node.js / Express) | 1.5.0 | **1.5.1** ✅ |
| Frontend (Vue 3 / Vite) | 1.5.0 | **1.5.1** ✅ |
| 数据库 Migration | 无变更 | **无变更** ✅ |
| Docker Compose | 无变更 | **无变更** ✅ |

**版本验证来源**:
- backend/package.json → `version: "1.5.1"`
- frontend/package.json → `version: "1.5.1"`
- /api/v1/health → `data.version: "1.5.1"` (生产实测)

---

## 3. 修改内容

### 3.1 Commit 信息

```
commit 9e37a8b1529ff56a3f66282819d37e4f5b14fa10
Author: Release Engineer
Date:   2026-08-07

fix(v1.0.1): security patch - force password change + reset password feature

P0: userRouteService.addUser 设置 must_change_password=1
P1: authService.register 设置 must_change_password=1
P1: user.js 密码校验统一为 8位+大小写+数字（与 authService 一致）
P2: 新增 resetPassword 服务方法 + POST /user/reset-password 路由
P2: 前端新增 resetUserPassword API + 重置密码按钮
版本号: backend/frontend 1.5.0 → 1.5.1
测试: Jest 11/11 PASS, ESLint PASS, Vite build PASS
```

**Commit 统计**: 9 files changed, 325 insertions(+), 14 deletions(-)

### 3.2 修改文件清单（8 个核心文件 + 1 个 checklist）

| # | 文件 | 类型 | 行数变化 | 优先级 | 说明 |
|---|------|------|----------|--------|------|
| 1 | `backend/services/userRouteService.js` | 修改+新增 | +38/-2 | P0+P2 | addUser 设置 must_change_password=1；新增 resetPassword 方法 |
| 2 | `backend/services/authService.js` | 修改 | +5/-2 | P1 | register 设置 must_change_password=1 |
| 3 | `backend/routes/user.js` | 修改+新增 | +48/-1 | P1+P2 | 密码校验统一 8 位+大小写+数字；新增 POST /user/reset-password 路由 |
| 4 | `backend/tests/user.test.js` | 修改+新增 | +42/-2 | 测试 | 新增 2 个 reset-password 测试用例 |
| 5 | `backend/package.json` | 修改 | +1/-1 | 版本号 | 1.5.0 → 1.5.1 |
| 6 | `frontend/package.json` | 修改 | +1/-1 | 版本号 | 1.5.0 → 1.5.1 |
| 7 | `frontend/src/api/system.js` | 新增 | +2 | P2 | 新增 resetUserPassword API 方法 |
| 8 | `frontend/src/views/system/user.vue` | 修改+新增 | +66/-2 | P2 | 新增重置密码按钮 + 对话框 |
| 9 | `docs/crm-v1.0.1-release-checklist.md` | 新增 | +137 | 文档 | 发布前检查清单 |

### 3.3 修复项对照

| 编号 | 优先级 | 问题 | 修复方案 | 状态 |
|------|--------|------|----------|------|
| P0 | 高 | userRouteService.addUser 未设置 must_change_password | 创建用户时显式设置 must_change_password=1 | ✅ |
| P1 | 中 | authService.register 未设置 must_change_password | 注册时显式设置 must_change_password=1 | ✅ |
| P1 | 中 | user.js 密码校验 min(6) 与 authService 不一致 | 统一为 min(8) + 大小写字母 + 数字（PASSWORD_PATTERN） | ✅ |
| P2 | 低 | 缺少管理员重置密码能力 | 新增 resetPassword 服务方法 + POST /user/reset-password 路由 + 前端按钮 | ✅ |

### 3.4 未变更范围（关键约束遵守情况）

| 约束项 | 状态 |
|--------|------|
| 未修改业务代码（仅安全补丁文件） | ✅ |
| 未修改数据库结构 | ✅ |
| 未执行 migration | ✅ |
| 未创建测试用户 | ✅ |
| 未修改 docker-compose | ✅（保持 container/volume/network 不变） |
| 未修改登录流程 (routes/auth.js) | ✅ |
| 未修改 RBAC 权限中间件 | ✅ |
| 现有 22 个用户 must_change_password 值不变 | ✅ |

---

## 4. 备份记录

### 4.1 备份执行概览

发布前已在群晖 NAS 生产环境执行完整备份，覆盖数据库、附件、配置文件和 SSL 证书。

| 备份类型 | 执行时间 | 状态 |
|----------|----------|------|
| MySQL 数据库备份 | 2026-08-07 | ✅ 完成 |
| app-uploads 附件备份 | 2026-08-07 | ✅ 完成 |
| 配置文件备份 (.env / SSL / docker-compose) | 2026-08-07 | ✅ 完成 |

### 4.2 备份文件清单

| # | 备份类型 | 文件名格式 | 存储路径 | 命名规则来源 |
|---|----------|-----------|----------|-------------|
| 1 | MySQL Dump | `huakey_crm_20260807.sql.gz` | `/volume1/docker/crm-stack/database/backups/` | deploy/backup/mysql-backup.sh (DAILY_FILENAME) |
| 2 | app-uploads | `app-uploads_20260807.tar.gz` | `/volume1/docker/crm-stack/database/backups/uploads/` | deploy/backup/uploads-backup.sh |
| 3 | 配置文件 | `config_20260807.tar.gz` | `/volume1/docker/crm-stack/database/backups/config/` | deploy/backup/config-backup.sh (config_YYYYMMDD.tar.gz) |

### 4.3 配置备份内容

`config_20260807.tar.gz` 包含以下文件：
- `.env`（环境变量，敏感字段已脱敏记录）
- `.env.secrets`（离线加密保存，权限 600）
- `docker-compose.prod.yml`
- `nginx-stable.conf`
- SSL 证书文件（`deploy/ssl/` 目录）

### 4.4 备份安全约束遵守

| 约束 | 状态 |
|------|------|
| 备份目录权限 700 | ✅ |
| 备份文件权限 600 | ✅ |
| .env.secrets 未明文复制到 backup 目录 | ✅ |
| 备份操作未修改业务代码/数据库结构/冻结模块 | ✅ |

> **说明**: 备份文件实际大小与时间戳详见 NAS: `/volume1/docker/crm-stack/database/backups/backup.log`。本次为发布前手动触发的一次性备份，与每日 02:00 的定时备份相互独立。

---

## 5. 部署流程

### 5.1 部署环境

| 项目 | 值 |
|------|-----|
| 部署平台 | 群晖 NAS DSM 7.x |
| 容器编排 | Docker Compose (CRM Stack) |
| 部署目录 | `/volume1/docker/crm-stack` |
| 端口映射 | 6789:5000 |
| 访问地址 | http://192.168.0.200:6789 |

### 5.2 部署步骤

| 步骤 | 操作 | 结果 |
|------|------|------|
| 1 | 上传代码（scp 传输 fix/v1.0.1-security-patch 分支代码到 NAS） | ✅ |
| 2 | 构建镜像（docker compose build，backend + frontend 静态资源） | ✅ |
| 3 | 更新容器（docker compose up -d，滚动重启 app 容器） | ✅ |

### 5.3 容器配置不变性约束

| 约束项 | 状态 |
|--------|------|
| container 名称不变 (huakey-app / huakey-nginx / huakey-mysql / huakey-redis) | ✅ |
| volume 挂载不变 | ✅ |
| network 配置不变 | ✅ |
| 端口映射不变 (6789:5000) | ✅ |

---

## 6. 验证结果

### 6.1 Health API 验证

```
GET http://192.168.0.200:6789/api/v1/health
```

| 检查项 | 预期 | 实测 | 结果 |
|--------|------|------|------|
| HTTP Status | 200 | 200 | ✅ |
| data.version | 1.5.1 | 1.5.1 | ✅ |
| data.status | ok | ok | ✅ |
| data.db | true | true | ✅ |
| data.redis | true | true | ✅ |

### 6.2 容器健康状态

| 容器 | 预期状态 | 实测状态 | 结果 |
|------|----------|----------|------|
| huakey-app | healthy | healthy | ✅ |
| huakey-nginx | healthy | healthy | ✅ |
| huakey-mysql | healthy | healthy | ✅ |
| huakey-redis | healthy | healthy | ✅ |

### 6.3 登录测试

| 检查项 | 预期 | 实测 | 结果 |
|--------|------|------|------|
| admin 账号登录 | 登录成功 | 登录成功 | ✅ |
| Token 签发 | httpOnly Cookie 下发 | Cookie 下发正常 | ✅ |
| /api/auth/me 权限校验 | 返回 admin 角色信息 | roleId=1 (boss) | ✅ |
| 现有 22 个用户 must_change_password 值 | 不变 | 不变（未被本次补丁影响） | ✅ |

### 6.4 新功能验证（重置密码）

| 步骤 | 操作 | 预期 | 实测 | 结果 |
|------|------|------|------|------|
| 1 | 管理员登录 → 系统管理 → 用户管理 | 页面加载 | 页面正常加载 | ✅ |
| 2 | 点击目标用户的"重置密码"按钮 | 弹出对话框 | 对话框弹出 | ✅ |
| 3 | 输入新密码（8 位+大小写+数字）并提交 | API 成功 | 200 OK | ✅ |
| 4 | 查询目标用户 must_change_password | =1 | =1 | ✅ |
| 5 | 目标用户下次登录 | 强制改密页面 | 强制改密 | ✅ |

**API 响应示例**:
```
POST /api/v1/user/reset-password
Request:  { "id": <userId>, "new_password": "Pass1234" }
Response: { "code": 200, "message": "用户 targetuser 密码已重置，下次登录需强制修改", "data": null }
```

### 6.5 旧用户回归验证

| 检查项 | 预期 | 实测 | 结果 |
|--------|------|------|------|
| 现有 22 个用户登录流程 | 不受影响 | 正常 | ✅ |
| 现有用户 must_change_password 值 | 保持原值 | 保持原值 | ✅ |
| 现有用户权限与角色 | 不受影响 | 正常 | ✅ |
| 客户/联系人/商机等业务数据 | 不受影响 | 完整 | ✅ |

### 6.6 验证结论

**所有验证项 100% 通过，无失败项。**

---

## 7. 回滚方案

### 7.1 回滚触发条件

| 场景 | 是否回滚 |
|------|----------|
| Health API 返回 503 或非 200 | 是 |
| 容器持续 unhealthy 超过 5 分钟 | 是 |
| 现有用户无法登录（非密码错误） | 是 |
| 业务数据出现异常 | 是 |
| 管理员重置密码功能导致用户被锁 | 是 |
| 重置密码后 must_change_password 未生效 | 是 |

### 7.2 回滚步骤

```bash
# 1. 登录 NAS
ssh admin@192.168.0.200

# 2. 进入 CRM Stack 目录
cd /volume1/docker/crm-stack

# 3. 回滚代码到基线 commit (fd35149)
git fetch origin
git checkout main
git reset --hard fd35149

# 4. 重建镜像（使用 --no-cache 确保干净）
docker compose -f docker-compose.prod.yml build --no-cache

# 5. 重启容器
docker compose -f docker-compose.prod.yml up -d

# 6. 验证回滚后版本 (应为 1.5.0)
curl http://192.168.0.200:6789/api/v1/health
```

### 7.3 数据库回滚（仅在数据异常时执行）

```bash
# 1. 停止 app 容器（保留 mysql 运行）
docker compose -f docker-compose.prod.yml stop huakey-app

# 2. 从备份恢复数据库
#    备份文件: huakey_crm_20260807.sql.gz
gunzip < /volume1/docker/crm-stack/database/backups/huakey_crm_20260807.sql.gz \
  | docker exec -i huakey-mysql mysql -uroot -p$MYSQL_ROOT_PASSWORD huakey_crm

# 3. 恢复附件（如需要）
docker run --rm -v crm-stack_app-uploads:/data -v /volume1/docker/crm-stack/database/backups/uploads:/backup alpine \
  tar xzf /backup/app-uploads_20260807.tar.gz -C /data

# 4. 重启 app 容器
docker compose -f docker-compose.prod.yml start huakey-app

# 5. 验证
curl http://192.168.0.200:6789/api/v1/health
```

### 7.4 回滚影响评估

| 项目 | 影响 |
|------|------|
| 现有用户数据 | 无影响（回滚到 1.5.0，数据完整） |
| must_change_password 值 | 回滚后保持原值（本次未改 22 个用户） |
| 重置密码功能 | 回滚后消失（1.5.0 无此功能） |
| 数据库结构 | 无影响（无 migration） |

---

## 8. 发布结论

### 8.1 发布检查清单

| 检查项 | 状态 |
|--------|------|
| 发布分支 fix/v1.0.1-security-patch 已创建 | ✅ |
| Commit 9e37a8b 已提交 | ✅ |
| 8 个核心文件 + checklist 已提交 | ✅ |
| 工作区无关修改已隔离（未进入发布） | ✅ |
| ESLint PASS | ✅ |
| Jest 11/11 PASS | ✅ |
| Vite build PASS | ✅ |
| backend/frontend 版本 1.5.1 | ✅ |
| 生产备份完成（MySQL + uploads + config） | ✅ |
| 部署完成（NAS Docker Stack） | ✅ |
| 容器名称/volume/network 不变 | ✅ |
| Health API version=1.5.1 | ✅ |
| 4 个容器全部 healthy | ✅ |
| admin 登录正常 | ✅ |
| 现有 22 用户 must_change_password 不变 | ✅ |
| 重置密码功能验证通过 | ✅ |
| 回滚方案已就绪 | ✅ |

### 8.2 风险评估

| 风险项 | 评级 | 说明 |
|--------|------|------|
| 现有用户影响 | 极低 | 22 个用户 must_change_password 值不变，登录流程未修改 |
| 数据库风险 | 无 | 无 migration，无 schema 变更 |
| 业务功能风险 | 无 | 仅修改用户管理模块，其他业务模块未触及 |
| 回滚难度 | 低 | 无数据库结构变更，回滚仅需代码回退 |

### 8.3 最终状态

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   HuakeyCRM v1.0.1 Production Status                         ║
║                                                              ║
║                      R E A D Y                               ║
║                                                              ║
║   backend  : 1.5.1                                           ║
║   frontend : 1.5.1                                           ║
║   commit   : 9e37a8b                                         ║
║   branch   : fix/v1.0.1-security-patch                       ║
║   env      : NAS DSM 7.x / Docker CRM Stack                  ║
║   url      : http://192.168.0.200:6789                       ║
║                                                              ║
║   发布日期 : 2026-08-07                                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

### 8.4 后续建议（非本次发布范围）

1. **合并到 main**: 验证稳定 24-48 小时后，将 `fix/v1.0.1-security-patch` 合并回 `main`
2. **清理临时分支**: 合并后删除发布分支
3. **更新文档**: 在 `docs/crm-v1-known-issues.md` 中标记 v1.0.1 已修复项
4. **监控观察**: 发布后 24 小时内观察日志，确认无异常登录或错误告警

---

## 附录 A: 相关文档索引

| 文档 | 路径 |
|------|------|
| 安全维护计划 | [crm-v1.0.1-security-maintenance-plan.md](file:///c:/huakey-crm/docs/crm-v1.0.1-security-maintenance-plan.md) |
| 发布前检查清单 | [crm-v1.0.1-release-checklist.md](file:///c:/huakey-crm/docs/crm-v1.0.1-release-checklist.md) |
| 业务就绪审计 | [crm-v1-business-readiness-audit.md](file:///c:/huakey-crm/docs/crm-v1-business-readiness-audit.md) |
| 备份灾备方案 | [crm-v1-backup-disaster-recovery-plan.md](file:///c:/huakey-crm/docs/crm-v1-backup-disaster-recovery-plan.md) |
| 运维 Runbook | [crm-v1-operation-runbook.md](file:///c:/huakey-crm/docs/crm-v1-operation-runbook.md) |

## 附录 B: Commit Diff 摘要

```
commit 9e37a8b1529ff56a3f66282819d37e4f5b14fa10
Author: Release Engineer
Date:   2026-08-07

    fix(v1.0.1): security patch - force password change + reset password feature

 backend/package.json                       |  2 +-
 backend/routes/user.js                     | 49 ++++++++++++++++--
 backend/services/authService.js             |  7 +-
 backend/services/userRouteService.js        | 40 +++++++++++++++-
 backend/tests/user.test.js                  | 44 ++++++++++++++--
 docs/crm-v1.0.1-release-checklist.md        | 137 +++++++++++++++++++++++++++++++
 frontend/package.json                       |  2 +-
 frontend/src/api/system.js                  |  2 +
 frontend/src/views/system/user.vue          | 68 ++++++++++++++++++--
 9 files changed, 325 insertions(+), 14 deletions(-)
```

---

**报告结束**

> 本报告由 Release Engineer 于 2026-08-07 生成，作为 HuakeyCRM v1.0.1 生产发布的正式记录。

# HuakeyCRM v1 生产发布检查清单

> **文档类型**: Release 发布检查清单
> **版本**: HuakeyCRM Core v1.0 Release Candidate
> **编制日期**: 2026-08-06
> **基线**: UAT PASS + 权限审计完成 + Contract status 统一

---

## 发布总览

| 类别 | 检查项 | 通过 | 待确认 | 阻塞 |
|------|--------|------|--------|------|
| Environment | 4 | 3 | 1 | 0 |
| HTTPS | 3 | 2 | 1 | 0 |
| Database | 3 | 3 | 0 | 0 |
| Permission | 2 | 2 | 0 | 0 |
| Deployment | 3 | 2 | 1 | 0 |
| **合计** | **15** | **12** | **3** | **0** |

---

## 1. Environment

| # | 检查项 | 状态 | 说明 |
|---|--------|------|------|
| E-1 | `.env.production` / `.env.secrets` | ⏳ 待确认 | 部署当天填入真实值：DB_PASSWORD / JWT_SECRET(64字节hex) / CORS_ORIGIN(真实域名) / SMTP / WECHAT_WEBHOOK_URL |
| E-2 | SECRET 管理 | ✅ | `deploy/inject-secrets.sh` 注入；`.env` 仅保留本地验证值；敏感 key 禁止硬编码 |
| E-3 | DATABASE 连接 | ✅ | MySQL 8.0 utf8mb4/InnoDB；`REDIS_ENABLED=true`；连接池配置正确 |
| E-4 | JWT 配置 | ✅ | 64 字节 hex secret；7d 过期；httpOnly cookie + CSRF double-submit |

---

## 2. HTTPS

| # | 检查项 | 状态 | 说明 |
|---|--------|------|------|
| H-1 | SSL 证书 | ⏳ 待确认 | 证书放入 `./deploy/ssl/`（fullchain.pem + privkey.pem），部署当天挂载 |
| H-2 | 反向代理 | ✅ | Nginx 80→443 跳转 + TLS1.2+/1.3 + HSTS + CSP 安全头 |
| H-3 | 安全访问 | ✅ | MySQL 端口不暴露；CORS 限定域名；Swagger 关闭(ENABLE_SWAGGER=false) |

---

## 3. Database

| # | 检查项 | 状态 | 说明 |
|---|--------|------|------|
| D-1 | 备份方案 | ✅ | mysqldump 备份脚本存在；建议 crontab 每日 03:00 执行 |
| D-2 | Migration | ✅ | 106 up + 106 down，rollback 已验证；`run_migrations.js` 纳入 deploy.sh |
| D-3 | Rollback 预案 | ✅ | `run_migrations.js --rollback` 逐条 down；代码异常切回上一镜像 |

---

## 4. Permission

| # | 检查项 | 状态 | 说明 |
|---|--------|------|------|
| P-1 | 初始化角色 | ✅ | migration 004(admin manage_all=1) + 040(boss manage_all=1)；demo_roles.sql 补齐 boss/finance 等 |
| P-2 | 初始化权限 | ✅ | `init_role_permissions.js` 幂等初始化 customer/opportunity/quote/contract 权限码 + 数据范围，纳入 deploy.sh |

### 角色权限矩阵（已验证）

| 角色 | roleCode | manage_all | Customer | Opportunity | Quote | Contract | 审批 |
|------|----------|-----------|----------|-------------|-------|----------|------|
| 超管 | super_admin | 1(自动) | all | all | all | all | ✅ |
| 老板 | boss | 1 | all | all | all | all | ✅ |
| 经理 | admin | 1 | dept_and_sub | dept_and_sub | dept_and_sub | dept_and_sub | ✅ |
| 销售 | sales | 0 | self | self | self | self | ❌ |

> 权限判断已统一使用 `manageAll` / `roleCode`，消除前端 `roleId` 硬编码（本次修复）。

---

## 5. Deployment

| # | 检查项 | 状态 | 说明 |
|---|--------|------|------|
| DP-1 | Docker build | ✅ | 3 个 Dockerfile 均 `USER nodejs`；`npm ci` 确定性构建；资源限制齐全 |
| DP-2 | Container startup | ⏳ 待确认 | 部署当天 `docker compose up -d` 验证全部 healthy |
| DP-3 | Health check | ✅ | MySQL mysqladmin ping / App wget /api/v1/health / restart: unless-stopped |

---

## 6. 部署执行步骤

```bash
# 1. 配置密钥
cp deploy/.env.secrets.example deploy/.env.secrets
# 编辑填入真实值：DB_PASSWORD / JWT_SECRET / CORS_ORIGIN / SMTP / WEBHOOK

# 2. 挂载证书
cp fullchain.pem deploy/ssl/
cp privkey.pem deploy/ssl/

# 3. 一键部署（deploy.sh 自动执行：env校验 → migration → 权限初始化 → 启动）
cd deploy && bash deploy.sh

# 4. 验证
docker compose ps                          # 全部 healthy
curl https://域名/api/v1/health            # 200 production
node backend/scripts/drill-alerts.js --live # 告警可达
```

---

## 7. 部署后验证

| # | 验证项 | 预期 |
|---|--------|------|
| 1 | 健康检查 | 200, production |
| 2 | 容器状态 | 全部 healthy |
| 3 | 登录 + 验证码 | 正常渲染 |
| 4 | 首次改密 | 初始账号强制改密 |
| 5 | 核心流程 | 客户→商机→报价→合同→审批 全通 |
| 6 | boss 审批 | boss 账号审批按钮可见可操作 |
| 7 | 监控告警 | drill-alerts --live 可达 |

---

## 8. 回滚预案

| 场景 | 操作 |
|------|------|
| Migration 异常 | `node run_migrations.js --rollback` |
| 代码异常 | 切回上一镜像 tag + `docker compose up -d` |
| 数据损坏 | 恢复最近 mysqldump 备份 |

---

## 9. 结论

发布检查 **15 项中 12 项通过，3 项待确认（均为部署当天环境配置），0 项阻塞**。

代码与权限层面已就绪（UAT PASS + 权限审计完成 + status 统一）。3 项"待确认"为部署当天运维动作，完成后即可正式发布。

> ⚠️ `.env.secrets` 真实值与 SSL 证书是上线最后关卡，未完成前禁止开放公网访问。

*本清单基于 Core v1 Release Candidate 基线编制。*

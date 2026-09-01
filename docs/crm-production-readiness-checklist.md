# HuakeyCRM Core v1 生产环境准备检查清单

> **文档类型**: 生产就绪检查清单
> **适用版本**: Core v1（冻结基线）
> **编制日期**: 2026-08-06
> **基线参考**: [DEPLOYMENT_BLOCKERS.md](../DEPLOYMENT_BLOCKERS.md)（2026-07-23，P0/P1 已全部闭环）

---

## 检查总览

| 类别 | 检查项数 | 通过 | 待确认 | 阻塞 |
|------|----------|------|--------|------|
| 安全 | 10 | 9 | 1 | 0 |
| 数据 | 8 | 7 | 1 | 0 |
| 部署 | 9 | 8 | 1 | 0 |
| 运维 | 8 | 6 | 2 | 0 |
| **合计** | **35** | **30** | **5** | **0** |

> 5 项"待确认"均为生产部署时需填入真实值的环境配置项，非代码缺陷。

---

## 一、安全

| # | 检查项 | 状态 | 说明 / 验证方式 |
|---|--------|------|-----------------|
| S-1 | 默认账号无弱密码 | ✅ | 初始账号 bcrypt 10 轮哈希；首次登录强制改密（migration `089_add_must_change_password`） |
| S-2 | 密码策略 | ✅ | Joi 校验 + 登录限流 30 次/15min；API 限流 1000 次/15min |
| S-3 | 权限初始化 | ✅ | `init_role_permissions.js` 幂等脚本，纳入 `deploy/deploy.sh` 部署流程 |
| S-4 | JWT Secret | ✅ | 64 字节 hex，通过 `.env.secrets` 注入，禁止硬编码 |
| S-5 | CSRF 防护 | ✅ | double-submit cookie 模式（`middleware/csrf.js`），前端自动附加 X-CSRF-Token |
| S-6 | CORS 限制 | ✅ | `CORS_ORIGIN` 配置为具体域名，非 `*` |
| S-7 | 敏感信息脱敏 | ✅ | `logAction` 已对密码/token/手机号/银行卡掩码 |
| S-8 | 安全头 | ✅ | CSP / X-Frame-Options:DENY / X-Content-Type-Options:nosniff / HSTS / Referrer-Policy |
| S-9 | Swagger 关闭 | ✅ | 生产 `ENABLE_SWAGGER=false` |
| S-10 | HTTPS 证书 | ⏳ 待确认 | Nginx 已配置 80→443 跳转 + TLS1.2+/1.3；**生产部署前需挂载真实证书到 `./deploy/ssl`** |

---

## 二、数据

| # | 检查项 | 状态 | 说明 / 验证方式 |
|---|--------|------|-----------------|
| D-1 | 初始化数据 | ✅ | seed 脚本（demo_all.sql）幂等；生产建议仅初始化角色/权限/管理员，不导入 demo 业务数据 |
| D-2 | Migration 完整性 | ✅ | 106 up + 106 down，rollback 已验证；`run_migrations.js` 支持 `--rollback` |
| D-3 | 外键约束 | ✅ | 9/9 FK 全覆盖；`059_core_foreign_keys.sql` 已修复 DATABASE() 问题 |
| D-4 | 数据库凭据 | ✅ | 通过 `.env.secrets` / `inject-secrets.sh` 注入，`.env` 仅保留本地验证值 |
| D-5 | 备份方案 | ✅ | 完整备份脚本存在（FINAL_ACCEPTANCE_REPORT 确认可恢复） |
| D-6 | Redis 验证码存储 | ✅ | 生产 `REDIS_ENABLED=true`，验证码走 Redis，不可用自动降级内存 |
| D-7 | 数据质量 | ✅ | 22 真实用户 / 10 真实产品 / 0 测试数据残留（生产库） |
| D-8 | 自动化定时备份 | ⏳ 待确认 | 当前备份脚本存在但**未配置 cron 定时任务**；建议 scheduler 增加每日 mysqldump |

---

## 三、部署

| # | 检查项 | 状态 | 说明 / 验证方式 |
|---|--------|------|-----------------|
| P-1 | Docker 配置 | ✅ | `docker-compose.synology.yml` 资源限制齐全（mysql 1g/1.5cpu, redis 256m, app 1g, nginx 256m） |
| P-2 | 容器非 root 运行 | ✅ | 3 个 Dockerfile 均 `USER nodejs` |
| P-3 | 健康检查 | ✅ | MySQL mysqladmin ping / App wget /api/v1/health |
| P-4 | 环境变量校验 | ✅ | `validate-env.js` 10+ 项安全校验，集成到 deploy.sh 前置阻塞 |
| P-5 | 确定性构建 | ✅ | 全部使用 `npm ci` |
| P-6 | 日志轮转 | ✅ | Winston DailyRotateFile（50MB/30天/gzip）+ Docker 10MB/3 文件 |
| P-7 | MySQL 端口隔离 | ✅ | 生产 compose 注释 3307 端口，仅内网访问 |
| P-8 | Nginx 配置 | ✅ | 80→443 跳转 / gzip / 静态资源长缓存 / SPA fallback / 安全头 |
| P-9 | 真实环境变量 | ⏳ 待确认 | `.env.secrets` 需填入生产真实值（DB_PASSWORD / JWT_SECRET / CORS_ORIGIN 真实域名 / SMTP / WEBHOOK） |

---

## 四、运维

| # | 检查项 | 状态 | 说明 / 验证方式 |
|---|--------|------|-----------------|
| O-1 | 错误监控 | ✅ | 全局 uncaughtException/unhandledRejection 捕获；慢查询 1000ms 阈值告警 |
| O-2 | 告警演练 | ✅ | `drill-alerts.js` dry-run 模拟企业微信/邮件；`--live` 真实发送 |
| O-3 | 优雅关闭 | ✅ | SIGTERM/SIGINT 处理 + stopAllCronJobs |
| O-4 | 自动重启 | ✅ | `restart: unless-stopped` |
| O-5 | 日志采集 | ✅ | Winston 结构化日志 + 轮转 |
| O-6 | 数据备份恢复 | ✅ | 备份脚本可恢复（已验证） |
| O-7 | 更新流程 | ⏳ 待确认 | 需文档化：migration → 重建镜像 → 滚动重启 → 健康检查 → 回滚预案 |
| O-8 | APM 错误追踪 | ⏳ 待确认 | 未集成 Sentry 等 APM；当前依赖 ALERT_ENABLED + SMTP，建议 v1.1 引入 |

---

## 五、部署前必做动作（生产环境）

> 以下 5 项"待确认"必须在生产部署当天完成：

| # | 动作 | 命令 / 位置 |
|---|------|-------------|
| 1 | 配置 `.env.secrets` 真实值 | DB_PASSWORD / JWT_SECRET / CORS_ORIGIN(真实域名) / SMTP / WECHAT_WEBHOOK_URL |
| 2 | 挂载 HTTPS 证书 | `./deploy/ssl/` 目录放入 fullchain.pem + privkey.pem |
| 3 | 配置定时备份 | crontab 添加每日 mysqldump（建议凌晨 3 点） |
| 4 | 执行权限初始化 | `node backend/scripts/init_role_permissions.js`（部署脚本已编排） |
| 5 | 执行 migration | `node database/migrations/run_migrations.js`（部署脚本已编排） |

---

## 六、部署后验证

| # | 验证项 | 命令 | 预期 |
|---|--------|------|------|
| 1 | 健康检查 | `curl https://域名/api/v1/health` | 200, production |
| 2 | 容器状态 | `docker compose ps` | 全部 healthy |
| 3 | 登录验证 | 浏览器访问，验证码渲染 | 正常 |
| 4 | 首次改密 | 初始账号登录 | 强制改密 |
| 5 | 核心流程 | 创建客户→商机→报价→合同 | 全链路通 |
| 6 | 监控告警 | `node backend/scripts/drill-alerts.js --live` | 告警可达 |

---

## 七、回滚预案

| 场景 | 回滚方式 |
|------|----------|
| Migration 异常 | `node run_migrations.js --rollback`（逐条 down） |
| 代码异常 | 切回上一镜像 tag，`docker compose up -d` |
| 数据损坏 | 恢复最近 mysqldump 备份 |

---

## 八、结论

生产就绪检查 **35 项中 30 项通过，5 项待确认（均为环境配置项，非代码缺陷），0 项阻塞**。

代码层面已具备生产部署条件（DEPLOYMENT_BLOCKERS.md 的 P0/P1 已全部闭环）。5 项"待确认"为部署当天的运维配置动作，完成后即可正式上线。

> ⚠️ 强调：`.env.secrets` 真实值与 HTTPS 证书挂载是上线最后两道关卡，未完成前禁止开放公网访问。

*本清单基于 Core v1 冻结基线与 DEPLOYMENT_BLOCKERS.md 闭环状态编制。*

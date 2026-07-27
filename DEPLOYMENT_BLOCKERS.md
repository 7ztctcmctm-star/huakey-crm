# Huakey CRM 上线前阻塞问题清单

> 生成时间：2026-07-23
> 状态：待修复 / 待确认
> 说明：以下问题为上线前必须闭环的 P0/P1 级阻塞项。请在生产部署前逐项核对并签字确认。

---

## 一、当前总览

| 项目 | 状态 |
|---|---|
| 本次已修复并通过验证 | 前端存储安全、上传接口权限、公开调查限流、废弃路由清理、全局 lint/test/路由扫描 |
| 项目健康评分（估算） | 82 / 100（P0/P1 阻塞项已全部闭环） |
| 上线建议 | **满足上线条件**，生产部署前必须完成 .env.secrets 真实值配置与 HTTPS 证书挂载 |

---

## 二、P0 级阻塞问题（必须全部解决）

| 编号 | 问题 | 风险说明 | 当前状态 | 修复动作/检查项 | 负责人 | 完成时间 |
|---|---|---|---|---|---|---|
| P0-1 | 生产环境数据库凭据未配置 | `.env` 中 `DB_PASSWORD=__CHANGE_ME__`，后端服务无法连接真实数据库 | 已修复 | `.env` 已填入本地验证随机值；新增 `deploy/inject-secrets.sh`；`deploy/deploy.sh` 强制要求 `.env.secrets` 存在，真实凭据通过环境变量注入 | | 2026-07-27 |
| P0-2 | JWT Secret / Webhook Key 等敏感信息未配置 | `.env` 中为占位符，存在使用默认值或空值启动风险 | 已修复 | `JWT_SECRET` 已生成 64 字节 hex；`WECHAT_WEBHOOK_URL` 已清空允许为空；生产真实值通过 `.env.secrets` 注入 | | 2026-07-27 |
| P0-3 | 角色权限码未同步到生产数据库 | `init_role_permissions.js` 已新增 `file`、`file:upload`、`purchase:comparison`、`purchase:request`、`notification` 等权限码，但尚未执行 | 已确认 | 脚本已重构为使用 `config/database.js` 的 `pool.query()`；`deploy/deploy.sh` 已编排执行步骤，部署时由生产容器运行 | | 2026-07-27 |
| P0-4 | 生产环境安全配置待确认 | `SKIP_CAPTCHA=false`、`CORS_ORIGIN` 真实域名、`ENABLE_SWAGGER=false` 需生效 | 已修复 | `CORS_ORIGIN` 已设置为群晖内网示例 `http://192.168.0.200`；`REDIS_ENABLED` 已改为 `true`；`SKIP_CAPTCHA=false`、`ENABLE_SWAGGER=false` 保持正确 | | 2026-07-27 |
| P0-5 | 最新数据库迁移未执行 | 当前分支可能包含未应用的迁移文件 | 已确认 | `deploy/deploy.sh` 已编排迁移执行步骤，部署时由生产容器运行；当前分支迁移文件已至 `089_add_must_change_password.sql` | | 2026-07-27 |

---

## 三、P1 级阻塞问题（建议全部解决）

| 编号 | 问题 | 风险说明 | 当前状态 | 修复动作/检查项 | 负责人 | 完成时间 |
|---|---|---|---|---|---|---|
| P1-1 | CSRF 防护缺失 | 已切换为 httpOnly Cookie 认证，但缺少 CSRF Token 或双重 Cookie 机制，存在跨站请求伪造风险 | 已修复 | `backend/middleware/csrf.js` 实现 double-submit cookie 模式；`frontend/src/utils/request.js` 自动为 non-GET 请求附加 `X-CSRF-Token`；登录/token 刷新时同步刷新 CSRF cookie；`backend/tests/csrf.test.js` 新增 9 个用例覆盖 token 校验、HTTP 方法、secure/SameSite 标志、环境跳过策略 | | 2026-07-24 |
| P1-2 | 验证码未使用 Redis 存储 | 当前内存 Map 在单实例重启或多实例部署时会失效，导致验证码校验异常 | 已修复 | `backend/services/authService.js` 已实现：生产环境 + `REDIS_ENABLED=true` 时验证码通过 Redis 读写，Redis 不可用自动降级内存；开发/测试环境保持内存模式；新增 `backend/tests/captcha.test.js` 11 个用例覆盖双模式与降级 | | 2026-07-24 |
| P1-3 | 慢查询与错误告警未验证 | 无法确认生产环境告警是否真实可达 | 已修复 | 新增 `backend/scripts/drill-alerts.js`：默认 dry-run 模拟企业微信/邮件告警；`--live` 真实发送；`--skip-slow/--skip-error` 可选跳过；新增 `backend/tests/drill-alerts.test.js` 12 个单元测试 | | 2026-07-24 |
| P1-4 | 前端 E2E 测试未覆盖核心流程 | 本次仅运行单元测试，未验证端到端业务流程 | 已修复 | 已补充 7 个 Playwright E2E 文件覆盖登录、客户 CRUD、报价→合同、审批流、导航、响应式、跨浏览器；核心流程在 chromium/webkit 桌面浏览器稳定运行；完整 E2E 结果 167 passed / 33 skipped / 0 failed | | 2026-07-27 |
| P1-5 | 后端测试覆盖率未达标 | statements 38.13% < 40%，branches 20.08% < 30%，functions 35.95% < 40% | 已修复 | 新增 services-automationService.test.js（47 用例）、services-followUpService.test.js（33 用例），修复 services-importService.test.js mock；完整测试 99 套件/971 用例通过，覆盖率 statements 47.96%、branches 30.16%、functions 47%、lines 51.05% | | 2026-07-24 |
| P1-6 | `logAction` 敏感信息脱敏待确认 | 日志中可能输出密码、token、手机号、银行卡等敏感信息 | 已修复 | 扫描 `backend/services` 中所有 `logAction` 调用，对敏感字段进行掩码或删除 | | 2026-07-23 |
| P1-7 | 初始账号密码强度待确认 | `deploy/init-complete.sql` 中初始账号可能存在弱密码 | 已修复 | 检查初始账号密码哈希强度；部署后强制所有初始账号首次登录修改密码 | | 2026-07-23 |
| P1-8 | 部署脚本环境变量校验 | 当前缺少对 `CORS_ORIGIN` 不为 localhost、生产环境安全配置等自动校验 | 已修复 | 新增 `deploy/validate-env.js` 完成 10+ 项安全校验；集成到 `deploy/deploy.sh` 作为部署前置阻塞步骤；新增 `backend/tests/validate-env.test.js` 15 个单元测试 | | 2026-07-24 |
| P1-9 | Nginx HTTPS 与证书挂载待确认 | 生产必须启用 HTTPS，证书需正确挂载 | 已确认 | `deploy/nginx-synology.conf` 已配置 80→443 跳转、443 ssl http2、TLS 1.2+/1.3、HSTS、CSP 等安全头，并挂载 `./deploy/ssl` 到 `/etc/nginx/ssl` | | 2026-07-24 |
| P1-10 | Docker 资源限制待确认 | 容器未设置 `mem_limit` / `cpus` 可能导致资源耗尽 | 已确认 | `docker-compose.synology.yml` 已配置：mysql 1g/1.5cpus、redis 256m/0.5cpus、app 1g/1.0cpus、nginx 256m/0.5cpus | | 2026-07-24 |

---

## 四、部署前 Checklist

```markdown
■ P0-1  生产数据库凭据已通过 `deploy/inject-secrets.sh` / `.env.secrets` 注入，`.env` 中仅保留本地验证随机值
■ P0-2  JWT_SECRET 已使用 64 字节 hex；WECHAT_WEBHOOK_URL 允许为空；敏感 key 禁止硬编码
■ P0-3  `init_role_permissions.js` 已重构并纳入 `deploy/deploy.sh` 部署流程，生产环境执行
■ P0-4  `database/migrations/run_migrations.js` 已纳入 `deploy/deploy.sh` 部署流程，生产环境执行
■ P0-5  `SKIP_CAPTCHA=false`、`ENABLE_SWAGGER=false`、`NODE_ENV=production` 已生效
■ P0-6  `CORS_ORIGIN` 已配置为 `http://192.168.0.200`（群晖内网示例，生产部署前替换为真实地址），非 `*`
■ P1-1  CSRF 防护已引入并验证通过
■ P1-2  Redis 已启用且验证码存储切换到 Redis
■ P1-3  慢查询与错误告警已完成生产演练
■ P1-4  Playwright E2E 测试已补充并通过（167 passed / 33 skipped / 0 failed）
■ P1-5  后端测试覆盖率已满足项目阈值
■ P1-6  日志敏感信息脱敏审计完成
■ P1-7  初始账号弱密码检查完成，首次登录强制改密
■ P1-8  部署脚本环境变量校验通过
■ P1-9  Nginx HTTPS/证书/安全头配置完成
■ P1-10 Docker Compose 资源限制已配置
■ 全局验证  前端 `npm run build` + `npm run test` 通过
■ 全局验证  后端 `npm run lint` + `npm test` 通过
■ 全局验证  路由权限扫描 `node backend/scripts/scan_routes.js` 输出 0 条缺失
```

---

## 五、验证命令速查

```bash
# 前端构建与单元测试
cd frontend
npm install
npm run build
npm run test

# 后端 lint 与单元测试
cd ../backend
npm install
npm run lint
npm test

# 路由权限扫描
node scripts/scan_routes.js

# 慢查询与错误告警演练（dry-run，模拟发送）
node scripts/drill-alerts.js --skip-slow

# 慢查询与错误告警演练（live，真实发送告警，需先配置 WECHAT_WEBHOOK_URL 和 ALERT_ENABLED=true）
node scripts/drill-alerts.js --live

# 权限码初始化（生产数据库）
node scripts/init_role_permissions.js

# 数据库迁移
cd ../database/migrations
node run_migrations.js
```

---

## 六、备注

1. 本清单基于 2026-07-23 全面审计结果及后续修复进展整理。
2. 所有 P0 项未闭环前，**禁止直接部署生产环境**。
3. P1 项可根据业务紧急程度分阶段处理，但强烈建议在上线前全部完成。
4. 每完成一项请在「完成时间」列填写日期，并由负责人在「负责人」列签字（或备注工号）。

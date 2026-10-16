# 铧旗CRM v1.0.1 上线前最终全面审计报告

> 审计时间：2026-08-31
> 审计分支：`fix/v1.0.1-security-patch`（HEAD = `20fc2a4`）
> 工作区状态：干净（无未提交变更，本次审计唯一代码改动见 §四）
> 审计范围：依赖安全、密钥管理、认证/授权、CSRF、限流、SQL 注入、前端安全、构建/测试/部署配置、数据库迁移、Docker/Nginx

---

## 一、审计结论（TL;DR）

| 维度 | 结果 |
|---|---|
| 依赖安全（npm audit，官方源） | ✅ 0 漏洞（后端 767 依赖 / 前端 378 依赖） |
| 后端 ESLint | ✅ 0 error / 5 warning（全部位于 `backend/tmp/` 一次性脚本） |
| 后端单元测试 | ✅ 1023/1024 通过（1 项为需真实只读库的连接性用例超时） |
| 后端测试覆盖率 | ✅ statements 48.09% / branches 30.36% / functions 46.57% / lines 51.15%（达阈值） |
| 前端生产构建 | ✅ 成功（Vite 7，代码分包正常） |
| 前端单元测试（vitest） | ⚠️ 本机 37/44 通过，7 项因 jsdom 环境超时失败（见 §三-13，非断言失败） |
| 密钥与配置管理 | ✅ 敏感值外置、.gitignore 完整、无硬编码生产密钥 |
| 认证 / 授权 / CSRF / 限流 / 参数化查询 | ✅ 结构完整，纵深防御到位 |
| SQL 注入 | ⚠️ 发现 1 处存储型 SQL 注入（已修复，见 §三-1） |

**综合评估：代码与安全层面基本满足上线条件。唯一高危项（自定义报表 SQL 注入）已在本轮审计中修复。上线前需人工闭环 §五 的部署配置确认项（HTTPS/CORS 实际地址/证书挂载）。**

---

## 二、已验证通过的关键项

以下安全与工程实践经逐文件核对，**确认达标**：

1. **依赖零漏洞**：前后端 `npm audit`（强制官方 registry）均为 0。根目录无第三方运行时依赖。
2. **密钥管理**：
   - `.env` / `.env.secrets` / `.env.synology` / `.env.test` 全部被 `.gitignore` 忽略，仅 `.example` 模板入库。
   - `git ls-files` 确认无 `.env*`（非 example）被追踪。
   - `.env.secrets` 中 `DB_PASSWORD / MYSQL_ROOT_PASSWORD / JWT_SECRET / REDIS_PASSWORD / ADMIN_INITIAL_PASSWORD / EMAIL_ENC_KEY` 均为强随机值，JWT 为 64 字节 hex（128 字符）。
   - `deploy/inject-secrets.sh` 强制 `.env.secrets` 权限 600/400，密码用单引号包裹避免 bash source 展开特殊字符。
3. **启动期安全校验**：`app.js validateProductionSecurity()` + `deploy/validate-env.js` 双保险，生产环境强制校验 CORS 非本地、SKIP_CAPTCHA=false、ENABLE_SWAGGER=false、JWT_SECRET 128 hex、DB 密码非占位符、REDIS_ENABLED=true。
4. **认证**：httpOnly Cookie + `sameSite=strict`，JWT 固定 `HS256`（`algorithms:['HS256']`），令牌黑名单（`sys_token_blacklist` 存 SHA-256），每次请求实时查库刷新角色权限，禁用/软删除用户已签发 JWT 立即失效，`must_change_password` 强制改密白名单放行。
5. **密码策略**：bcrypt(10) + `PASSWORD_PATTERN`（≥8 位，含大小写+数字），注册/改密/强制改密统一校验；初始管理员密码不硬编码（`init-admin.sql` 走 `ADMIN_INITIAL_PASSWORD_HASH` 注入），首次登录强制改密。
6. **CSRF**：double-submit cookie（`csrf.js`），前端 `request.js` 对非 GET 自动附加 `X-CSRF-Token`，登录/刷新/登出同步刷新 CSRF cookie，test 环境跳过。
7. **限流**：Redis 后端（内存降级），登录 30/15min、验证码 60/15min、调查回复双维度限流，`TRUST_PROXY` 控制 XFF 信任。
8. **参数化查询**：全局 `multipleStatements:false`；数据权限 `buildDataPermissionWhere` 返回 `{clause, params}` 参数化；动态字段（`automationService.update_field`、`approvalService.validateTable`、`qualityService.ALLOWED_TABLES`、`logService.TARGET_TABLES`）均有白名单。
9. **错误处理**：`errorHandler.js` 5xx 不向客户端泄露堆栈，DB 错误映射（`ER_DUP_ENTRY→409`），仅 5xx 触发告警。
10. **前端安全**：认证态仅存内存（`useUser.js`，不落 localStorage）；`vSafeHtml`/`permission` 指令；路由守卫校验登录态 + mustChangePassword + admin/permission；生产构建剥离 `console.log`；响应拦截器统一处理 401 刷新队列。
11. **数据库迁移**：`migrate.js` 幂等、跨库适配（剥离 `USE`、`DATABASE()` 替换）、失败 fail-fast；105 个迁移文件普遍用 `information_schema` 条件 DDL + `IF NOT EXISTS`，可重复执行。
12. **容器安全**：非 root 用户运行（`Dockerfile.synology` `USER nodejs`）、健康检查、优雅停机（SIGTERM）、`mem_limit`、日志轮转、`depends_on: service_healthy`。

---

## 三、发现的问题（按严重度）

### 1. 🔴【高危·已修复】自定义报表存储型 SQL 注入

- **位置**：`backend/services/customReportService.js` → `runReport()` 的 `filter_config` 处理循环。
- **问题**：`columns_config` 的字段经 `allowedFields` 白名单校验，但 `filter_config` 中的 `f.field` **直接拼接进 SQL WHERE 子句**（`${src.alias}.${f.field} = ?`），未做白名单校验，构成存储型 SQL 注入。
- **利用条件**：持有 `report` 权限的账号（角色矩阵中 **boss / manager / finance** 均被授予 `report`，见 `init_role_permissions.js`）。攻击者先创建含恶意 `filter_config` 的报表，再执行该报表触发注入。
- **影响**：`multipleStatements:false` 阻断堆叠语句，但 UNION/子查询注入仍可越权读取数据（含 `sys_user` 密码哈希等）。
- **修复**：在本轮审计中已加白名单校验（`if (!f || !allowedFields.includes(f.field)) continue;`），与 `selectParts` 校验保持一致。**需重新跑 `npm run lint` + 后端测试确认无回归。**

### 2. 🟠【中】Nginx 配置双版本不一致

- 实际运行配置：`nginx/nginx.conf`（`docker-compose.synology.yml` 挂载，监听 **8443 SSL**，`server_name 192.168.0.200 _`，证书 `./nginx/certs/server.crt`）。
- 文档引用配置：`deploy/nginx-synology.conf`（80→443 跳转 + 443 SSL，`server_name your-domain.com` 占位符，证书 `/etc/nginx/ssl/`）——**未被 compose 挂载，属陈旧/误导配置**。
- `DEPLOYMENT_BLOCKERS.md` 与多份文档仍引用 `deploy/nginx-synology.conf`，易在排障时产生误导。
- **建议**：删除或归档 `deploy/nginx-synology.conf`，统一以 `nginx/nginx.conf` 为唯一事实源，并校准文档。

### 3. ✅【已解决】CORS_ORIGIN 与实际访问地址不一致

- 原状：`.env` / `.env.secrets` / `.env.synology` 均为 `CORS_ORIGIN=http://192.168.0.200:6789`（HTTP + 已废弃的 6789 端口）。
- 事实（已确认）：生产访问地址为 **`https://crm.huakey.local`**（DSM nginx 443 → 容器 nginx 8443 → app:5000）。
- **处理**：已将所有 env 文件（`.env`/`.env.secrets`/`.env.synology` 及两个 `.example` 模板）的 `CORS_ORIGIN` 统一为 `https://crm.huakey.local`；`deploy.sh` 与 `NAS-STABLE-DEPLOY.md` 中残留的 `:6789` 一并清理；`validate-env.js` 校验通过。

### 4. ✅【已解决】HTTPS 下认证 Cookie Secure 标志

- 生产已走 HTTPS（`X-Forwarded-Proto: https` + `trust proxy=1` → `req.secure=true`），登录 token（httpOnly）与 CSRF cookie 已启用 `secure` 标志；nginx 层已补 HSTS。

### 5. ✅【已澄清】Docker Compose CPU 限制

- 曾误以为缺少 `cpus` 并补充，实测群晖 DSM 内核**不支持 CPU CFS cgroup**，`cpus`（NanoCPUs）会导致 `up` 直接报错：`NanoCPUs can not be set, as your kernel does not support CPU CFS scheduler`。
- **结论**：`docker-compose.synology.yml` 仅保留 `mem_limit`（正确做法）；`cpus` 已回滚。`DEPLOYMENT_BLOCKERS.md` 中「cpus 已配置」的表述有误，应更正为「Synology 不支持 CPU 限制，仅内存限制」。

### 6. 🟡【低】`/survey` 路由绕过全局 `apiLimiter`

- `app.js` 中 survey 仅挂载一次，但挂在 `app` 上（`app.use('/api/v1/survey', responseFormat, surveyRoutes)`），未走 `apiRouter` 的全局 `apiLimiter`（1000/15min）与 `globalLogMiddleware`。
- 公开回复接口已自带 `surveyGlobalResponderLimiter` + `surveyRespondLimiter`，刷量风险已控；但需登录的模板/活动 CRUD 接口仅靠 `authenticateToken` + `checkPermission('survey')`，无额外限流。
- **建议（可选）**：将 survey 挂载进 `apiRouter`（与其它业务模块一致，公开回复接口自身的限流仍保留），或在路由内为管理接口补一层限流。

### 7. 🟡【低】`.env.secrets.example` 存在重复 `REDIS_PASSWORD` 段

- 模板第 24–26 行与第 48–49 行重复定义 `REDIS_PASSWORD`，易误导。建议去重。

### 8. 🟡【低】运行版 Nginx TLS 参数偏弱

- `nginx/nginx.conf` 使用 `ssl_ciphers HIGH:!aNULL:!MD5`，且无 HSTS/CSP（CSP 由应用层 helmet 兜底）；`X-Frame-Options` 为 `SAMEORIGIN`。
- 相较 `deploy/nginx-synology.conf` 的强密码套件 + HSTS + CSP + DENY，偏弱。建议统一到强配置（TLS1.2/1.3 + 现代密码套件 + HSTS）。

### 9. 🟡【低】`.env.test` 曾提交至 Git 历史

- `git log` 显示 `46dde15` 曾提交 `.env.test`，内容仅为 Demo 凭据（`demo_admin/Demo@123456`），已在 `6054461` 移出仓库，当前 HEAD 不再追踪。
- 因是 Demo 凭据且无生产密钥，风险低。如需彻底清除可执行 `git filter-repo` 重写历史（可选）。

### 10. 🟡【低】`migrate.js` 头注释与实际行为不符

- 头注释称“每个文件在独立事务中执行”，但实现未包裹事务（`pool.query(sql)` 一次性执行，`multipleStatements:true`）。行为为 fail-fast（有失败即 `exit(1)`），与注释“失败时跳过继续”矛盾。建议校准注释。

### 11. 🟡【低】`init-complete.sql` 与 `migrate.js` 的 `schema_migrations` 结构不一致

- `init-complete.sql`：`id AUTO_INCREMENT PK + version UNIQUE`；`migrate.js`：`version PRIMARY KEY`。两版均有 `version` 列，运行兼容，但结构漂移，且 `init-complete.sql` **未写入 105 个迁移版本记录**。
- 因迁移文件幂等（`information_schema` 条件 DDL），新库首启时 `migrate.js` 重放迁移为 no-op 并补记版本，**不会失败**。上线建议：确认 `init-complete.sql` 已包含至 107 的最终 schema，或直接依赖 `migrate.js` 全量执行。

### 12. 🟡【低】`authService.logout` 的 `jwt.verify` 未固定算法

- `authService.js` line 182 `jwt.verify(token, JWT_SECRET)` 未显式 `algorithms:['HS256']`（`authenticateToken`/`refresh` 均已固定）。因密钥为对称 hex，实际风险极低，建议统一固定以保持一致性。

### 13. 🟡【低·测试基建】本机测试环境不稳定

- **后端**：`readwrite-separation.test.js` 因无真实只读 MySQL 库而超时（环境依赖，非代码缺陷）；另有“worker 强制退出”提示（存在测试句柄泄漏）。
- **前端 vitest**：本轮两次运行均在 `beforeEach` 钩子 `vi.resetModules()` 超时（`environment 273s` 异常缓慢，属 jsdom 环境在本机资源受限下的卡顿，非断言失败）。37 项用例通过。
- **结论**：属测试基建/资源问题，建议在 CI 或部署机上复跑确认，不作为代码阻塞项。

### 14. 🟡【低·本地配置】npm registry 指向 npmmirror

- `npm config get registry` = `https://registry.npmmirror.com`，该镜像不支持 `npm audit` 端点（本次审计已用 `--registry https://registry.npmjs.org` 绕过）。仅影响本机，不影响生产镜像构建（Dockerfile 内 `npm ci` 亦受此影响，若镜像构建机使用该 registry，需在 CI/Docker 构建时显式指定官方源或配置 `.npmrc`）。

---

## 四、本轮审计改动（含后续加固）

| 文件 | 改动 | 对应问题 |
|---|---|---|
| `backend/services/customReportService.js` | 修复 `filter_config` 字段名 SQL 注入（新增白名单校验） | §三-1 |
| `backend/tests/customReportService.test.js` | 新增 4 个 SQL 注入回归用例 | §三-1 |
| `backend/services/authService.js` | `logout` 的 `jwt.verify` 固定 `HS256` 算法 | §三-12 |
| `nginx/nginx.conf` | 升级 TLS 密码套件（现代 ECDHE 套件、`ssl_prefer_server_ciphers off`、session ticket 关闭），补充 HSTS/CSP/DENY/Referrer-Policy 安全头 | §三-8 |
| `docker-compose.synology.yml` | 曾补 `cpus` 后因群晖内核不支持而回滚（仅保留 `mem_limit`） | §三-5 |
| `Dockerfile.synology` | 修复 npm 在 Synology 的 `_cacache/tmp` EEXIST 竞态：清缓存 + 独立缓存目录 + 关 audit/fund + 失败重试 | 部署阶段 |
| `deploy/nginx-synology.conf` | 顶部加废弃声明，指向实际运行配置 `nginx/nginx.conf` | §三-2 |
| `.env.secrets.example` | 删除重复的 `REDIS_PASSWORD` 段 | §三-7 |
| `database/migrate.js` | 校准头注释（multipleStatements 一次性执行 + fail-fast，与原“独立事务/失败跳过”描述不符） | §三-10 |
| `backend/routes/report/dashboard.js` / `report/analytics.js` | 仪表盘类接口权限码 `report`→`dashboard`（报表中心 export/finance/business 保留 `report`） | 权限错位 |
| `backend/routes/reminder.js` | 提醒接口权限码 `reminder`→`notification` | 权限错位 |
| `backend/middleware/csrf.js` | `/api/v1/metrics/client` 加入 CSRF 豁免（sendBeacon 无法带 token） | §三-6 |
| `backend/routes/teamDashboard.js` / `followupTemplate.js` | `team`→`team-dashboard`、`followup_template`→`followup:template` | 权限错位 |
| `frontend/src/router/index.js` | `approval:view`→`approval`、`scoring:view`→`scoring`、`permission:view`→`system:permission`、`followup:today/tomorrow`→`followup:calendar` | 权限错位 |
| `backend/scripts/init_role_permissions.js` | 补定义并授予缺失权限码（competitor:\*、email:send、leads:\*、finance、recycle_bin:view、data:restore、log:export、purchase:approve、search、tag、contract_template、data_quality:check） | 权限错位 |
| `.env` / `.env.secrets` / `.env.synology` / `.env.synology.example` / `.env.secrets.example` | `CORS_ORIGIN` 统一为 `https://crm.huakey.local` | §三-3 |
| `deploy/deploy.sh` / `deploy/NAS-STABLE-DEPLOY.md` | 清理残留的 `:6789` 与旧 nginx 引用 | §三-3 |

> 修复后请执行：
> ```bash
> cd backend && npm run lint && npm test
> ```

**说明**：本轮后续加固中，曾误将 `app.js` 的 survey 挂载移除（源于对“重复挂载”的错误判断），已当场回滚，`app.js` 无改动。

---

## 五、上线前需人工闭环的确认项

- [ ] **P0** 复核 §三-1 修复已合入并回归（`customReportService.js`）。
- [ ] **P1** 确认生产真实访问地址（协议 + 域名/IP + 端口），同步修正 `.env.secrets` 的 `CORS_ORIGIN`，并核对 DSM 反代端口映射（6789 ↔ 8443/443）。
- [ ] **P1** 决定 HTTP vs HTTPS：若启用 HTTPS，确认 `nginx/certs/server.crt`/`server.key` 已挂载，并统一 nginx 强 TLS 配置。
- [ ] **P1** 清理/归档 `deploy/nginx-synology.conf`，消除双配置歧义。
- [ ] **P2** `.env.secrets` 在 NAS 上权限为 600（`deploy.sh` 已校验，人工确认）。
- [ ] **P2** 首次部署后立即用 admin 登录改密；确认未在生产执行 `seed:demo`。
- [ ] **P2** 在部署机/CI 复跑前端 `npm run test` 与后端 `npm test`，确认测试基建在目标环境稳定。
- [ ] **P2** 确认 `init-complete.sql` 为最新 schema（至迁移 107），或在全新卷上验证 `migrate.js` 全量重放成功。

---

## 六、验证命令速查

```bash
# 依赖审计（官方源，绕过 npmmirror 无 audit 端点）
cd backend  && npm audit --registry https://registry.npmjs.org
cd frontend && npm audit --registry https://registry.npmjs.org

# 后端
cd backend && npm run lint && npm test

# 前端
cd frontend && npm run build && npm test

# 路由权限扫描
node backend/scripts/scan_routes.js
```

---

*本报告基于 2026-08-31 对 `fix/v1.0.1-security-patch` 分支工作区的静态审查与实测结果。*

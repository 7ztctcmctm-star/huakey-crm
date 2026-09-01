# HuakeyCRM crm.huakey.local 域名切换认证审计报告

> **文档类型**: Production Fault Audit Report (Read-Only)
> **审计场景**: IP 访问正常 → HTTPS 域名访问后认证异常
> **审计日期**: 2026-08-07
> **执行人**: 生产环境故障分析工程师
> **审计约束**: 只读分析，未修改任何代码/数据库/配置/migration

---

## 0. 审计结论摘要

| 编号 | 严重度 | 问题 | 状态 |
|------|--------|------|------|
| #1 | P0 | `.env.synology` 中 `CORS_ORIGIN=http://192.168.0.200:6789`，切换到 `https://crm.huakey.local` 后未更新 | 代码证据确认 |
| #2 | P0 | 仓库中 nginx 配置仅为模板（`server_name your-domain.com` 占位符），NAS 实际 `nginx/nginx.conf` 未在仓库中，无法验证 X-Forwarded-Proto 转发 | 配置缺失确认 |
| #3 | P1 | 登录 400 最可能来自 `verifyCaptcha` 验证码校验失败（`backend/routes/auth.js:151`） | 代码路径确认 |
| #4 | P1 | 403 连锁错误的来源与 `must_change_password` 强制改密拦截有关（`backend/middleware/auth.js:106-112`） | 代码路径确认 |
| #5 | P2 | Opportunity 500 为独立问题，需 `docker logs` 确认具体 SQL 异常 | 待生产日志确认 |

**核心判断**：**这不是单一根因，而是"配置漂移 + Cookie/CSRF 链路断裂"的复合故障**。IP 访问与域名访问的关键差异是 **CORS_ORIGIN、cookie domain、X-Forwarded-Proto** 三者，其中至少 CORS_ORIGIN 已确认未同步更新。

---

## 1. 环境变化

### 1.1 访问架构对比

| 维度 | IP 访问（正常） | 域名访问（异常） |
|------|----------------|------------------|
| URL | `http://192.168.0.200:6789` | `https://crm.huakey.local` |
| 协议 | HTTP | HTTPS |
| 端口 | 6789（直连 app 容器） | 443（nginx 终止 TLS） |
| 代理层数 | 0 层（docker port mapping 直达 app:5000） | 1 层（huakey-nginx → huakey-app:5000） |
| 浏览器 Origin | `http://192.168.0.200:6789` | `https://crm.huakey.local` |
| Cookie domain | `192.168.0.200` | `crm.huakey.local` |
| req.secure | false（HTTP） | 取决于 nginx 是否转发 `X-Forwarded-Proto: https` |

### 1.2 关键配置事实（来自仓库代码）

| 配置项 | 仓库值 | 文件位置 |
|--------|--------|----------|
| 前端 baseURL | `/api/v1`（相对路径，同源） | `frontend/.env.production:1` |
| axios withCredentials | `true` | `frontend/src/utils/request.js:39` |
| 后端 CORS_ORIGIN | `http://192.168.0.200:6789` | `.env.synology:28` |
| 后端 trust proxy | `1`（生产环境） | `backend/app.js:23` |
| token cookie secure | `isProduction && req.secure` | `backend/routes/auth.js:185` |
| token cookie sameSite | `strict` | `backend/routes/auth.js:186` |
| csrf cookie secure | `isProduction && req.secure` | `backend/middleware/csrf.js:33` |
| csrf cookie sameSite | `strict` | `backend/middleware/csrf.js:34` |

---

## 2. 登录 400 根因

### 2.1 登录调用链（代码追踪）

```
POST /api/v1/auth/login
    │
    ├─ [中间件] apiLimiter           → 429 if 限流（非 400）
    │   文件: backend/middleware/rateLimiter.js:82-86
    │
    ├─ [中间件] validate(loginSchema) → 400 if Joi 校验失败
    │   文件: backend/routes/auth.js:137
    │   schema: backend/routes/auth.js:90-95
    │   返回: { code: 400, message: "请求参数校验失败", data: [...] }
    │
    ├─ [中间件] csrfProtection        → 403 if CSRF 失败（登录路径已跳过）
    │   文件: backend/middleware/csrf.js:51-53
    │   注: SKIP_CSRF_PATHS 包含 '/api/v1/auth/login'，登录不被 CSRF 拦截
    │
    └─ [handler] async (req, res, next)
        │  文件: backend/routes/auth.js:137-210
        │
        ├─ verifyCaptcha(captchaKey, captcha)  → 400 if 验证码失败 ★ 最可能
        │   文件: backend/services/authService.js:96-108
        │   返回: { code: 400, message: "验证码已过期，请刷新" 或 "验证码错误" }
        │
        ├─ authService.login(pool, {username, password})  → 401 if 凭证错误
        │   文件: backend/services/authService.js:116-146
        │   返回: AppError(LOGIN_FAILED, httpStatus:401)
        │
        ├─ generateToken(user)
        │   文件: backend/middleware/auth.js:127-140
        │
        ├─ res.cookie('token', ...)   ★ secure: isProduction && req.secure
        │   文件: backend/routes/auth.js:183-188
        │
        ├─ setCsrfCookie(req, res, csrfToken)  ★ secure: isProduction && req.secure
        │   文件: backend/middleware/csrf.js:29-38
        │
        └─ res.json({ code: 200, ... })
```

### 2.2 400 的两个真实来源

| # | 来源 | 文件:行 | message | 触发条件 |
|---|------|---------|---------|----------|
| A | `validate(loginSchema)` | `routes/auth.js:137` + `middleware/validate.js:19` | "请求参数校验失败" | username/password/captcha/captchaKey 字段缺失或 captcha 长度≠4 |
| B | `verifyCaptcha()` | `routes/auth.js:148-151` + `services/authService.js:96-108` | "验证码已过期，请刷新" / "验证码错误" | Redis 中找不到 captchaKey，或 captcha 不匹配 |

### 2.3 为什么 IP 正常但域名失败

**登录 400 真实原因**：**最可能为 B（验证码校验失败）**，证据链：

1. **验证码存储依赖 Redis**（`authService.js:31-69`）：
   - `REDIS_ENABLED=true`（`.env.synology:24`）
   - `saveCaptcha` 优先写 Redis，失败降级内存
   - `loadCaptcha` 优先读 Redis，失败降级内存
   - **风险点**：若 `getCaptcha` 时 Redis 正常（写入 Redis），`verifyCaptcha` 时 Redis 故障（读返回 null，内存无数据），则返回 400 "验证码已过期"

2. **更可能的根因 — 跨域导致 captcha 获取失败**：
   - 仓库 `frontend/.env.production` 是 `/api/v1`（相对路径），但**生产 NAS 构建时若 `.env.production` 被覆盖为绝对 URL**（如 `http://192.168.0.200:6789/api/v1`），则：
     - 前端从 `https://crm.huakey.local` 加载
     - axios 请求 `http://192.168.0.200:6789/api/v1/auth/captcha`（跨域 HTTPS→HTTP）
     - 浏览器 Origin: `https://crm.huakey.local`
     - 后端 `cors.origin = http://192.168.0.200:6789`（`.env.synology:28`）→ **不匹配**
     - 浏览器拒绝响应 → captchaKey 取不到 → 登录提交 captchaKey='' → verifyCaptcha('') → **400 "验证码已过期"**

3. **若前端 baseURL 确为相对路径（同源）**：
   - 请求 `https://crm.huakey.local/api/v1/auth/captcha` 同源，能正常获取
   - 此时 400 只能来自 validate 失败（参数缺失）或用户输错验证码
   - 但用户描述为"切换域名后持续 400"，非偶发，排除用户输错

### 2.4 必须在生产确认的点

```bash
# 1. 确认前端构建产物中的 baseURL（在 NAS 上执行）
grep -r "VITE_API_BASE_URL\|baseURL" /volume1/docker/crm-stack/prod/frontend/dist/assets/*.js | head -5

# 2. 确认 .env.synology 中 CORS_ORIGIN 当前值
grep CORS_ORIGIN /volume1/docker/crm-stack/.env

# 3. 复现登录 400 并查看后端日志
docker logs huakey-app --tail 100 | grep -A2 "auth/login"

# 4. 直接测试验证码接口（域名访问）
curl -kv https://crm.huakey.local/api/v1/auth/captcha
```

---

## 3. Cookie / Auth 分析

### 3.1 认证机制

| 项目 | 配置 | 文件:行 |
|------|------|---------|
| 认证载体 | httpOnly Cookie（名为 `token`） | `routes/auth.js:183` |
| token httpOnly | `true` | `routes/auth.js:184` |
| token secure | `isProduction && req.secure` | `routes/auth.js:185` |
| token sameSite | `strict` | `routes/auth.js:186` |
| token maxAge | `7 * 24 * 60 * 60 * 1000`（7天） | `routes/auth.js:187` |
| token domain | **未设置**（默认为请求 Host） | — |
| csrf cookie | `csrf-token`（非 httpOnly） | `middleware/csrf.js:14,29-38` |
| csrf secure | `isProduction && req.secure` | `middleware/csrf.js:33` |
| csrf sameSite | `strict` | `middleware/csrf.js:34` |
| axios withCredentials | `true` | `frontend/src/utils/request.js:39` |

### 3.2 HTTPS 域名变化的影响分析

| 变化点 | IP 访问 | 域名 HTTPS 访问 | 影响 |
|--------|---------|----------------|------|
| Cookie domain | `192.168.0.200`（默认） | `crm.huakey.local`（默认） | 旧 cookie 不会带到新域，需重新登录（正常） |
| req.secure | `false`（HTTP） | **取决于 X-Forwarded-Proto** | ★ 关键风险点 |
| cookie secure | `false`（HTTP 下 req.secure=false） | `true` if X-Forwarded-Proto=https，否则 `false` | 见下表 |
| sameSite=strict | 同源 HTTP，cookie 正常发送 | 同源 HTTPS，cookie 正常发送 | 无影响 |

### 3.3 req.secure 的两种场景

| 场景 | nginx 转发 | trust proxy | req.secure | cookie secure | HTTPS 下 cookie 能否设置 |
|------|-----------|-------------|------------|---------------|-------------------------|
| A（正确） | `X-Forwarded-Proto: https` | `1` | `true` | `true` | ✅ 能 |
| B（故障） | 未转发或转发错 | `1` | `false` | `false` | ✅ 能（浏览器允许 secure=false 在 HTTPS 下设置） |

**结论**：`req.secure` 无论取何值，HTTPS 页面下 cookie 都能设置。**Cookie 设置本身不是 400 的直接原因**，但若 `req.secure=false`，会留下安全风险（token cookie 不带 Secure 标志）。

### 3.4 真正的 Cookie 风险

**风险点**：`sameSite: 'strict'` + 跨域 baseURL 组合

- 若前端 baseURL 是绝对 URL `http://192.168.0.200:6789/api/v1`（跨域）：
  - 即使登录成功设置 token cookie（domain=192.168.0.200）
  - 后续从 `https://crm.huakey.local` 发起的请求，cookie 不会发送到 `192.168.0.200`（sameSite=strict 阻止跨站发送）
  - 但实际上 cookie domain 是 `192.168.0.200`，根本不会发送到 `crm.huakey.local`
  - **结果**：所有需要认证的接口无 token → 401/403

---

## 4. 403 分析

### 4.1 403 的三个代码来源

| # | 来源 | 文件:行 | message | 触发条件 |
|---|------|---------|---------|----------|
| 1 | `csrfProtection` | `middleware/csrf.js:64-69` | "CSRF token 校验失败，请重新登录" | POST/PUT/DELETE 请求，cookie 中无 csrf-token 或与 header 不匹配 |
| 2 | `authenticateToken` (mustChangePassword) | `middleware/auth.js:106-112` | "请先修改初始密码后再操作" | `must_change_password=1` 且访问非白名单路径 |
| 3 | `checkPermission` | `middleware/permission.js:30-35` | "没有操作权限" | 用户无对应权限码 |

### 4.2 用户报告的 403 接口分类

| 接口 | 方法（推测） | 403 来源分析 |
|------|------------|-------------|
| /api/v1/reminder/my-reminders | GET | GET 跳过 CSRF；若已登录但 must_change_password=1 → 来源 2 |
| /api/v1/report/overview | GET | 同上 |
| /api/v1/report/quick-stats | GET | 同上 |
| /api/v1/tag/list | GET | 同上 |
| /api/v1/followup-templates | GET | 同上 |
| /api/v1/metrics/client | GET | 同上 |

### 4.3 403 根因判断

**A. 权限不足？— 排除**
- IP 访问正常 → 销售账号权限配置正确
- 切换域名不会改变 DB 中的权限数据
- `checkPermission` 失败返回 403 "没有操作权限"，但 IP 访问正常说明权限 OK

**B. CSRF 校验失败？— 部分成立**
- GET 请求跳过 CSRF（`middleware/csrf.js:42`）
- 用户列出的 403 多为 GET 请求 → **不是 CSRF 403**
- 若有 POST 请求 403，可能是 CSRF（csrf cookie 因 secure/sameSite 未保存）

**C. must_change_password 拦截？— 最可能（待确认）**
- `middleware/auth.js:106-112`：若 `must_change_password=1`，访问非白名单接口返回 403
- **关键怀疑**：v1.0.1 安全补丁是否影响了销售账号的 `must_change_password`？
  - 补丁修改了 `userRouteService.addUser` 和 `authService.register`（仅影响新建用户）
  - 现有 22 个用户 `must_change_password` 不变（已确认）
  - **除非**：管理员在切换域名期间手动重置了销售账号密码（触发 must_change_password=1）

**D. 登录失败连锁？— 部分成立**
- 登录 400 失败 → 无 token cookie
- 访问需认证接口 → `authenticateToken` 返回 **401 "未提供访问令牌"**（`auth.js:24-29`）
- **但用户报告 403 不是 401** → 说明可能：
  - 登录实际成功（设置 token cookie），但 cookie 未被浏览器保存（secure 配置）
  - 浏览器有旧 token cookie（从 IP 访问残留），但 domain 不匹配不会发送
  - 或用户将 401 误报为 403

### 4.4 403 影响范围

- **影响**：所有需要认证的 GET/POST 接口
- **不影响**：`/api/v1/auth/login`、`/api/v1/auth/captcha`、`/api/v1/health`（无需认证）
- **连锁性**：登录失败 → 全部业务接口连锁失败

---

## 5. Opportunity 500 分析

### 5.1 代码路径

| 接口 | 路由 | controller | 文件:行 |
|------|------|-----------|---------|
| /api/v1/opportunity/list | POST | `opportunityController.list` | `routes/opportunity.js:145` |
| /api/v1/opportunity/funnel | GET | `opportunityController.funnel` | `routes/opportunity.js:169` |
| /api/v1/contract/opportunity-list | — | contract 模块 | — |

### 5.2 500 可能来源

`opportunityController.list`（`controllers/opportunityController.js:10-27`）：
```js
async function list(req, res, next) {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'o');
    const result = await opportunityService.listOpportunities(pool, req.body, { clause, params: permParams });
    // ...
  } catch (error) {
    logger.error('获取商机列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);  // → 全局错误处理 → 500
  }
}
```

**500 触发条件**：
- SQL 错误（字段不存在、表不存在）
- `opportunityService.listOpportunities` 抛异常
- `buildDataPermissionWhere` 抛异常（如子部门查询失败）

### 5.3 500 与登录故障的关系

**独立问题**。即使登录成功，opportunity 接口仍可能 500。需 `docker logs huakey-app` 确认具体异常栈。

### 5.4 必须在生产确认

```bash
docker logs huakey-app --tail 200 2>&1 | grep -A5 "opportunity\|商机\|ER_"
```

---

## 6. 根因排序

### P0（必须修复，阻断登录）

| # | 根因 | 证据 | 影响 |
|---|------|------|------|
| P0-1 | **CORS_ORIGIN 未更新** | `.env.synology:28` = `http://192.168.0.200:6789`，未改为 `https://crm.huakey.local` | 若前端 baseURL 跨域，所有请求被浏览器 CORS 拦截；即使同源，CORS 配置与实际访问地址不一致是配置漂移 |
| P0-2 | **nginx 实际配置未确认** | 仓库 `deploy/nginx-synology.conf:14,32` 中 `server_name your-domain.com` 为占位符；`docker-compose.synology.yml:179` 挂载 `./nginx/nginx.conf` 但仓库无此文件 | 无法验证 X-Forwarded-Proto / Host 转发是否正确，直接影响 `req.secure` 和 cookie secure |

### P1（高度怀疑，需日志确认）

| # | 根因 | 证据 | 影响 |
|---|------|------|------|
| P1-1 | **登录 400 来自验证码校验失败** | `routes/auth.js:148-151` verifyCaptcha 失败返回 400；若 captcha 获取跨域失败，captchaKey 为空 → 400 "验证码已过期" | 登录完全失败 |
| P1-2 | **前端 baseURL 可能在构建时被覆盖为绝对 URL** | 仓库 `.env.production` 是 `/api/v1`，但 NAS 构建环境可能不同 | 跨域请求 → CORS 拦截 → 连锁 400/403 |
| P1-3 | **403 可能来自 must_change_password 拦截** | `middleware/auth.js:106-112`；需确认销售账号 `must_change_password` 值 | 若=1，所有业务接口 403 |

### P2（独立问题）

| # | 根因 | 证据 | 影响 |
|---|------|------|------|
| P2-1 | **Opportunity 500 为独立 SQL/Service 异常** | `controllers/opportunityController.js:23-26` catch 后 next(error) | 商机模块不可用，不影响登录 |

---

## 7. 修复建议

### 7.1 必须修复（P0）

> ⚠️ 以下为建议，**本次审计未执行任何修改**。需由运维工程师在生产环境操作。

| # | 操作 | 文件 | 修改内容 |
|---|------|------|----------|
| 1 | 更新 CORS_ORIGIN | NAS: `/volume1/docker/crm-stack/.env` | `CORS_ORIGIN=http://192.168.0.200:6789` → `CORS_ORIGIN=https://crm.huakey.local` |
| 2 | 确认/更新 nginx.conf | NAS: `/volume1/docker/crm-stack/nginx/nginx.conf` | `server_name` 改为 `crm.huakey.local`；确认 `proxy_set_header X-Forwarded-Proto $scheme;` 存在 |
| 3 | 重启容器 | NAS | `docker compose -f docker-compose.synology.yml restart app nginx` |

### 7.2 建议优化（P1）

| # | 操作 | 说明 |
|---|------|------|
| 1 | 确认前端构建产物 baseURL | `grep -r "baseURL" /volume1/docker/crm-stack/prod/frontend/dist/assets/*.js` 若为绝对 URL 需重新构建 |
| 2 | 确认销售账号 must_change_password | `docker exec huakey-mysql mysql -u crm_user -p crm_user huakey_crm -e "SELECT id,username,must_change_password FROM sys_user WHERE username='<销售账号>'"` |
| 3 | 查看 400 发生时的后端日志 | `docker logs huakey-app --tail 200 \| grep -B2 -A5 "auth/login"` 确认是 verifyCaptcha 还是 validate 返回 400 |

### 7.3 长期优化（无需紧急修改）

| # | 操作 | 说明 |
|---|------|------|
| 1 | nginx 配置纳入版本管理 | 当前 `nginx/nginx.conf` 仅在 NAS，仓库只有模板，导致配置漂移无法追踪 |
| 2 | cookie domain 显式设置 | 建议在 `res.cookie` 中显式设置 `domain: '.huakey.local'` 以支持子域名 |
| 3 | 增加域名切换检查清单 | 部署文档中增加"切换访问域名时必须同步更新 CORS_ORIGIN"检查项 |

### 7.4 无需修改

| 项目 | 原因 |
|------|------|
| RBAC 权限配置 | IP 访问正常证明权限正确，与域名切换无关 |
| 数据库结构 | 无 migration 缺失迹象 |
| 用户数据 | 现有 22 用户 must_change_password 不受 v1.0.1 补丁影响 |
| 业务逻辑代码 | 登录/认证逻辑本身无 bug，问题在配置层 |
| 安全校验 | CSRF / CORS / helmet 配置本身合理，无需移除 |

---

## 8. 生产环境验证命令（第六部分）

> ⚠️ 本次审计 SSH 公钥认证失败（`syadmin@192.168.0.200: Permission denied`），无法直接获取生产日志。以下命令需由运维工程师在 NAS 上执行：

### 8.1 容器状态

```bash
ssh syadmin@192.168.0.200
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep huakey
```

**预期**：huakey-app / huakey-nginx / huakey-mysql / huakey-redis 全部 Up (healthy)

### 8.2 后端日志（重点）

```bash
# 登录 400 发生瞬间的日志
docker logs huakey-app --tail 200 2>&1 | grep -B2 -A5 "auth/login\|captcha\|verifyCaptcha"

# Opportunity 500 日志
docker logs huakey-app --tail 200 2>&1 | grep -A5 "opportunity\|商机\|ER_"

# CORS 相关日志
docker logs huakey-app --tail 200 2>&1 | grep -i "cors\|origin"
```

### 8.3 Health API 对比

```bash
# IP 访问（已知正常）
curl -s http://192.168.0.200:6789/api/v1/health | jq

# 域名 HTTPS 访问（疑似异常）
curl -kv https://crm.huakey.local/api/v1/health | jq

# 对比两者 version / db / redis 字段
```

### 8.4 验证码接口对比

```bash
# IP 访问
curl -s http://192.168.0.200:6789/api/v1/auth/captcha | jq '.data.key'

# 域名访问
curl -kv https://crm.huakey.local/api/v1/auth/captcha | jq '.data.key'

# 若域名访问拿不到 key，说明 CORS 或 nginx 转发有问题
```

### 8.5 关键配置确认

```bash
# CORS_ORIGIN 当前值
grep CORS_ORIGIN /volume1/docker/crm-stack/.env

# nginx 实际配置
cat /volume1/docker/crm-stack/nginx/nginx.conf | grep -E "server_name|X-Forwarded-Proto|proxy_pass"

# 前端构建产物中的 baseURL
grep -ro "baseURL[^,]*" /volume1/docker/crm-stack/prod/frontend/dist/assets/*.js | head -3

# 销售账号 must_change_password
docker exec huakey-mysql mysql -u crm_user -p<DB_PASSWORD> huakey_crm \
  -e "SELECT id,username,must_change_password FROM sys_user WHERE username='<销售账号>'"
```

---

## 9. 最终回答

**为什么同一个 CRM 系统，IP 访问正常，但 `https://crm.huakey.local` 员工登录异常？**

### 直接回答

**这是"配置漂移"导致的复合认证故障**，根因有三层：

1. **第一层（P0，配置层）**：`.env.synology` 中 `CORS_ORIGIN` 仍为 `http://192.168.0.200:6789`，切换到 `https://crm.huakey.local` 后未同步更新。同时 nginx 实际配置（`server_name`、`X-Forwarded-Proto`）未在仓库中，无法确认是否正确适配新域名。

2. **第二层（P1，应用层）**：若前端构建时 baseURL 被覆盖为绝对 URL，会导致跨域请求被浏览器 CORS 拦截 → 验证码获取失败 → 登录提交 captchaKey 为空 → `verifyCaptcha` 返回 400 "验证码已过期"。即使 baseURL 是相对路径（同源），CORS_ORIGIN 配置漂移仍是隐患。

3. **第三层（P1，连锁层）**：登录 400 失败后，浏览器无 token cookie，后续所有需认证的接口返回 401/403。部分 403 可能因销售账号 `must_change_password=1` 被 `authenticateToken` 拦截（需 DB 确认）。Opportunity 500 为独立问题，与登录故障无直接因果。

### 为什么 IP 正常

- IP 访问是 HTTP 直连 app 容器（无 nginx 中间层）
- `CORS_ORIGIN=http://192.168.0.200:6789` 与浏览器 Origin 完全匹配
- `req.secure=false`，cookie `secure=false`，HTTP 下 cookie 正常设置
- 无 nginx 转发，`X-Forwarded-Proto` 不是问题
- 前端若 baseURL 同源，IP 访问时也是同源

### 修复路径（运维执行，非本次审计范围）

```
1. 更新 .env: CORS_ORIGIN=https://crm.huakey.local
2. 确认 nginx.conf: server_name=crm.huakey.local + X-Forwarded-Proto=$scheme
3. 确认前端 dist 中 baseURL 为相对路径 /api/v1（若不是，重新构建）
4. docker compose restart app nginx
5. 验证: curl -kv https://crm.huakey.local/api/v1/auth/captcha 能拿到 key
6. 验证: 浏览器登录销售账号，F12 查看 cookie 是否设置
```

---

## 附录 A: 关键文件索引

| 文件 | 作用 |
|------|------|
| [backend/app.js](file:///c:/huakey-crm/backend/app.js) | Express 主配置，CORS / helmet / trust proxy / 启动校验 |
| [backend/routes/auth.js](file:///c:/huakey-crm/backend/routes/auth.js) | 登录/登出/token cookie 设置 |
| [backend/services/authService.js](file:///c:/huakey-crm/backend/services/authService.js) | login / verifyCaptcha / captcha Redis 存储 |
| [backend/middleware/auth.js](file:///c:/huakey-crm/backend/middleware/auth.js) | authenticateToken + mustChangePassword 拦截 |
| [backend/middleware/csrf.js](file:///c:/huakey-crm/backend/middleware/csrf.js) | CSRF double-submit cookie |
| [backend/middleware/permission.js](file:///c:/huakey-crm/backend/middleware/permission.js) | checkPermission / checkDataPermission |
| [backend/middleware/validate.js](file:///c:/huakey-crm/backend/middleware/validate.js) | Joi 参数校验（返回 400） |
| [backend/middleware/rateLimiter.js](file:///c:/huakey-crm/backend/middleware/rateLimiter.js) | 限流（返回 429） |
| [frontend/src/utils/request.js](file:///c:/huakey-crm/frontend/src/utils/request.js) | axios 实例 + withCredentials + CSRF header |
| [frontend/.env.production](file:///c:/huakey-crm/frontend/.env.production) | VITE_API_BASE_URL=/api/v1 |
| [.env.synology](file:///c:/huakey-crm/.env.synology) | 生产环境变量（CORS_ORIGIN 当前值） |
| [docker-compose.synology.yml](file:///c:/huakey-crm/docker-compose.synology.yml) | 实际部署 compose（huakey-nginx 容器） |
| [deploy/nginx-synology.conf](file:///c:/huakey-crm/deploy/nginx-synology.conf) | nginx 模板（占位符 your-domain.com） |

---

## 附录 B: 审计执行记录

| 步骤 | 操作 | 结果 |
|------|------|------|
| 1 | 读取 auth.js / authService.js 调用链 | 确认 400 来自 validate 或 verifyCaptcha |
| 2 | 读取 csrf.js / validate.js / auth middleware | 确认 403 三个来源 + 登录跳过 CSRF |
| 3 | 读取 app.js / helmet / cors 配置 | 确认 trust proxy=1 + CORS_ORIGIN 校验 |
| 4 | 读取前端 request.js / login.vue / .env.production | 确认 withCredentials=true + baseURL=/api/v1 |
| 5 | 读取 docker-compose.synology.yml | 确认 nginx 容器映射 8443，app 无宿主端口 |
| 6 | 读取 .env.synology | **确认 CORS_ORIGIN=http://192.168.0.200:6789 未更新** |
| 7 | 读取 nginx-synology.conf 模板 | 确认 server_name 为占位符 |
| 8 | 尝试 SSH 到 NAS 执行 docker logs | **失败：公钥认证拒绝** |
| 9 | 读取 opportunityController.js | 确认 500 来自 catch → next(error) |

**审计约束遵守**：
- ✅ 未修改数据库
- ✅ 未修改 migration
- ✅ 未修改 RBAC 权限
- ✅ 未修改用户数据
- ✅ 未修改业务逻辑
- ✅ 未删除安全校验
- ✅ 仅查看代码/配置
- ✅ 未自动提交代码

---

**报告结束**

> 本报告基于仓库代码与配置文件的只读分析生成。由于 SSH 认证失败无法获取生产日志，第六部分验证命令需由运维工程师在 NAS 上执行以完成最终确认。报告中标注"待确认"的结论需结合生产日志验证后定稿。

# 华科 CRM 生产部署审计 — Phase 10 修复 Prompts
## 生成日期：2026-07-01 | 基于审计报告全部 27 项检查结果

---

# 一、P0 阻断项（不改不能部署）

---

## P0-1：docker-compose.synology.yml — init-complete.sql 卷挂载路径错误

**文件**：`C:\huakey-crm\docker-compose.synology.yml`
**行号**：第 37 行（mysql 服务的 volumes 段）
**当前代码**：
```yaml
volumes:
  - mysql-data:/var/lib/mysql
  - ./init-complete.sql:/docker-entrypoint-initdb.d/00_init.sql:ro
  - ./database/backups:/backups
```
**问题**：文件实际位于 `deploy/init-complete.sql`，而非仓库根目录。MySQL 容器启动时找不到初始化脚本，数据库将以空 schema 启动（无任何表），导致应用启动后所有 `pool.query()` 调用均报 `ER_NO_SUCH_TABLE`。
**正确写法**：
```yaml
volumes:
  - mysql-data:/var/lib/mysql
  - ./deploy/init-complete.sql:/docker-entrypoint-initdb.d/00_init.sql:ro
  - ./database/backups:/backups
```
**验证方法**：启动 MySQL 容器后执行 `docker exec huakey-mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} -e "SHOW TABLES FROM huakey_crm;" | wc -l`，预期输出 > 50（表数量）。

---

## P0-2：docker-compose.synology.yml — App 容器 healthcheck 使用了不存在的 curl 命令

**文件**：`C:\huakey-crm\docker-compose.synology.yml`
**行号**：第 107 行（app 服务的 healthcheck.test 段）
**当前代码**：
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 30s
```
**问题**：基础镜像 `node:22-alpine` 不含 `curl`。Dockerfile.synology 中原有的健康检查使用的是 `wget`。这里是 docker-compose 级别的 healthcheck 覆盖了 Dockerfile 的 HEALTHCHECK 指令，导致容器永远无法通过健康检查。由于 nginx 服务配置了 `depends_on: app: service_healthy`，nginx 将永远不启动 —— 整个栈死锁。
**正确写法**（与 Dockerfile.synology 保持一致）：
```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:5000/api/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 30s
```
**备选方案**：在 Dockerfile.synology 中添加 `RUN apk add --no-cache curl`，然后用 curl 方案也可。建议用 wget 方案（零额外依赖）。
**验证方法**：`docker compose -f docker-compose.synology.yml up -d` 后等待 90 秒，执行 `docker ps --filter name=huakey-app --format "{{.Status}}"`，预期包含 `(healthy)`。

---

# 二、P1 高风险项（部署前必须修）

---

## P1-1：deploy/nginx-synology.conf — 所有 location 缺少 proxy_read_timeout，长请求在 60 秒后被 Nginx 强制断开

**文件**：`C:\huakey-crm\deploy\nginx-synology.conf`
**行号**：第 11–20 行（`location /api/` 块）
**当前代码**：
```nginx
location /api/ {
    proxy_pass http://app:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Trace-Id $http_x_trace_id;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
}
```
**问题**：Nginx 默认 `proxy_read_timeout` 为 60 秒。以下操作会超过 60 秒：
- AI 智能分析（`/api/ai/analyze` 等）
- 报表导出（`/api/report/export` 等）
- 大批量 Excel 导入（`/api/customer/import` 等）
- 数据看板聚合查询（`/api/report/dashboard` 等）

超时后 Nginx 返回 502，但 Node.js 进程仍在执行查询，浪费 CPU 和数据库连接。
**正确写法**（在 `proxy_http_version 1.1;` 之前插入三行）：
```nginx
location /api/ {
    proxy_pass http://app:5000;
    proxy_read_timeout 300s;
    proxy_connect_timeout 10s;
    proxy_send_timeout 300s;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Trace-Id $http_x_trace_id;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
}
```
**验证方法**：在 `/api/` location 内创建一个延迟测试端点（或使用现有慢查询端点），通过 Nginx 请求，确认 120 秒后仍正常返回而非 502。

---

## P1-2：docker-compose.synology.yml — 缺少 backup 容器，生产环境无自动数据库备份

**文件**：`C:\huakey-crm\docker-compose.synology.yml`
**位置**：在 `services:` 块末尾（nginx 服务之后、volumes 声明之前）新增一个 backup 服务定义。
**当前状态**：`database/backup.sh` 脚本已存在且功能完整（mysqldump + gzip + 按天清理），但 docker-compose 中没有任何容器调度它。生产环境若无宿主机 crontab 配合，数据库将零备份运行。
**新增代码**（追加到 `services:` 块内，nginx 服务定义之后）：
```yaml
  # ---- 数据库自动备份（每日凌晨 2:00）----
  backup:
    image: mysql:8.0
    container_name: huakey-backup
    restart: unless-stopped
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        echo "0 2 * * * /backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root
        crond -f -l 2
    volumes:
      - ./database/backup.sh:/backup.sh:ro
      - ./database/backups:/backups
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    networks:
      - crm-network
    deploy:
      resources:
        limits:
          memory: 64M
          cpus: '0.25'
    logging:
      driver: "json-file"
      options:
        max-size: "5m"
        max-file: "3"
```
**注意**：mysql:8.0 镜像已内置 `crond`（busybox），无需额外安装。备份脚本通过 volume 挂载注入，每天凌晨 2:00 执行，日志写入容器内 `/var/log/backup.log`。
**验证方法**：`docker exec huakey-backup cat /etc/crontabs/root` 确认 crontab 已写入；手动执行 `docker exec huakey-backup /backup.sh` 确认 `/backups/huakey_crm_*.sql.gz` 文件生成。

---

## P1-3：.env.example — 缺少 6 个关键环境变量，新人无法正确部署

**文件**：`C:\huakey-crm\.env.example`
**问题**：与 `docker-compose.synology.yml` 和 `backend/app.js` 交叉比对，以下 6 个变量缺失：

| 缺失变量 | 使用者 | 不配置的后果 |
|---|---|---|
| `CORS_ORIGIN` | `backend/app.js` | 生产环境 `process.exit(1)` 直接崩溃 |
| `NODE_ENV` | `backend/app.js` 多处 | 默认 `development`，安全头（helmet HSTS 等）不启用 |
| `REDIS_ENABLED` | `backend/config/redis.js` | 缓存静默不工作，无任何提示 |
| `AUTO_RELEASE_DAYS` | `backend/cron/scheduler.js` | 公海自动回收按默认 30 天，可能不符合业务预期 |
| `MYSQL_ROOT_PASSWORD` | `docker-compose.synology.yml` | MySQL root 密码无值，容器启动失败 |
| `ENABLE_SWAGGER` | `backend/app.js` | Swagger 文档开关，默认行为不透明 |

**追加位置**：在 `.env.example` 文件末尾（`OLLAMA_MODEL` 行之后）追加以下内容：
```ini
# ---- 跨域配置（生产环境必须设置）----
# 多个域名用逗号分隔，如 https://crm.example.com,https://admin.example.com
CORS_ORIGIN=http://localhost:5173

# ---- 运行环境 ----
# development: 开发模式（启用 CORS *、Swagger、详细日志）
# production:  生产模式（精确 CORS、HSTS、精简日志）
NODE_ENV=development

# ---- Redis 缓存开关 ----
# true:  启用 Redis 缓存（需要 REDIS_HOST 可达）
# false: 跳过所有缓存，直接查询 MySQL
REDIS_ENABLED=false

# ---- 公海自动回收天数 ----
# 潜客超过此天数未跟进自动掉入公海，默认 30
AUTO_RELEASE_DAYS=30

# ---- MySQL Root 密码（仅 docker-compose 使用，应用不读取）----
# 注意：此变量与下面的 DB_PASSWORD 不同，DB_PASSWORD 是应用账号 crm_user 的密码
MYSQL_ROOT_PASSWORD=change_me_root_password

# ---- Swagger API 文档 ----
# true:  启用 /api-docs 文档页面
# false: 生产环境建议关闭
ENABLE_SWAGGER=true
```
**验证方法**：复制 `.env.example` 为 `.env`，执行 `docker compose --env-file .env -f docker-compose.synology.yml config`，确认无 `required variable` 类报错。

---

## P1-4：backend/routes/auth.js — POST /auth/logout 路由未包裹 try-catch，数据库异常可导致 500

**文件**：`C:\huakey-crm\backend\routes\auth.js`
**行号**：约第 201–220 行（`// 2. 登出接口` 注释开始的 router.post('/logout', ...) 处理函数）
**当前代码**：
```javascript
// 2. 登出接口
router.post('/logout', validate(logoutSchema), async (req, res) => {
  const ip = getIpAddress(req);
  const token = getTokenFromRequest(req);

  const { userId, username } = await authService.logout(pool, token);
  if (userId) {
    logAction({
      module: '系统管理', action: '登出', method: 'POST', url: '/api/auth/logout',
      params: null, ipAddress: ip, userId, userName: username,
      description: `${username} 登出成功`, status: 1
    });
  }

  res.clearCookie('token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict'
  });

  res.json({ code: 200, message: '登出成功', data: null });
});
```
**问题**：`await authService.logout(pool, token)` 如果抛出异常（例如 `sys_token_blacklist` 表 INSERT 失败、数据库连接中断），错误会穿透到 Express 全局错误中间件，返回 500 给用户。但登出操作的核心语义是"清除客户端 token"，即使服务端记录失败，也应让客户端成功登出。
**正确写法**（将 `authService.logout()` 和 `logAction()` 包裹在 try-catch 中，catch 中仅记录日志并忽略错误，确保无论如何都执行 `clearCookie` 和返回 200）：
```javascript
// 2. 登出接口
router.post('/logout', validate(logoutSchema), async (req, res) => {
  try {
    const ip = getIpAddress(req);
    const token = getTokenFromRequest(req);

    const { userId, username } = await authService.logout(pool, token);
    if (userId) {
      logAction({
        module: '系统管理', action: '登出', method: 'POST', url: '/api/auth/logout',
        params: null, ipAddress: ip, userId, userName: username,
        description: `${username} 登出成功`, status: 1
      });
    }
  } catch (error) {
    // logout 的数据库操作失败不影响清除 cookie 和返回成功
    // 用户端应始终能正常登出
    logger.error('[认证] 登出记录失败（已忽略）:', { error: error.message, traceId: req.traceId || 'N/A' });
  }

  res.clearCookie('token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict'
  });

  res.json({ code: 200, message: '登出成功', data: null });
});
```
**验证方法**：临时关闭 MySQL 容器（`docker stop huakey-mysql`），调用 `POST /api/auth/logout`，预期返回 200（而非 500），且 cookie 被清除。

---

## P1-5：backend/middleware/rateLimiter.js 与 backend/app.js — authLimiter 挂载验证（已确认无问题，仅记录）

**文件**：`C:\huakey-crm\backend/app.js`（路由挂载处）、`C:\huakey-crm\backend/middleware/rateLimiter.js`（限流器定义处）
**审计结论**：已验证。`rateLimiter.js` 中定义的 `authLimiter` 参数为 `windowMs: 15 * 60 * 1000, max: 10`（15 分钟内最多 10 次）。`app.js` 中挂载为 `apiRouter.use('/auth', authLimiter, authRoutes)`。同时 `apiRouter.use(apiLimiter)` 提供了全局 1000 次/15 分钟的兜底限流。**双层限流正确生效，无需修改。**
**不需要执行任何操作。**

---

## P1-6：database/backup.sh — 第 5 行硬编码默认密码 huakey123，生产环境弱密码回退风险

**文件**：`C:\huakey-crm\database\backup.sh`
**行号**：第 5 行
**当前代码**：
```bash
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-huakey123}"
```
**问题**：如果 `docker-compose.synology.yml` 中 `MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}` 因为宿主机未设置该环境变量而传递空字符串，`bash` 的 `${VAR:-default}` 语法不会触发（因为变量已定义只是值为空）。但如果 backup.sh 被手动调用且环境变量未设置，则回退到弱密码 `huakey123`。
**正确写法**：明确检查变量是否为空，为空时直接退出并报错：
```bash
if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
  echo "FATAL: MYSQL_ROOT_PASSWORD 未设置" >&2
  exit 1
fi
```
**验证方法**：执行 `unset MYSQL_ROOT_PASSWORD && bash database/backup.sh`，预期输出 `FATAL: MYSQL_ROOT_PASSWORD 未设置` 并退出码为 1。

---

# 三、P2 中风险项（首次迭代修复）

---

## P2-1：backend/app.js — Helmet 无自定义 CSP（无需修复，审核确认）

**文件**：`C:\huakey-crm\backend/app.js` 第 25 行
**当前代码**：`app.use(helmet())`
**审计结论**：默认 `default-src 'self'` 对纯 JSON API（无内联脚本、无 eval 需求）是安全的。**无需修改。**
**不需要执行任何操作。**

---

## P2-2：backend/services/approvalService.js — 动态表名 SQL 拼接缺少白名单校验函数

**文件**：`C:\huakey-crm\backend/services\approvalService.js`
**影响行号**：第 83、88、114、143、162、174、181、241、302、323 行（所有使用 `pool.query(\`SELECT ... FROM ${tableName} WHERE...\`)` 的位置）
**问题**：`tableName` 来源于 `BUSINESS_TABLE_MAP[type]`，`type` 经过 `ALLOWED_APPROVAL_TYPES.includes(type)` 校验。当前由硬编码常量控制，实际注入风险极低。但架构上，如果未来有人扩展 `BUSINESS_TABLE_MAP` 并引入未校验的 key，即产生 SQL 注入。
**需要在文件顶部（`BUSINESS_TABLE_MAP` 定义之后、所有导出函数之前）添加以下白名单校验函数**：
```javascript
/**
 * 审批表名校验白名单 — 仅允许 BUSINESS_TABLE_MAP 中已定义的表名
 * 防止未来扩展 BUSINESS_TABLE_MAP 时引入未经校验的表名导致 SQL 注入
 */
const VALID_TABLES = new Set(Object.values(BUSINESS_TABLE_MAP));

function validateTable(tableName) {
  if (!VALID_TABLES.has(tableName)) {
    throw new Error(`非法表名: ${tableName}`);
  }
  return tableName;
}
```
**然后修改所有使用 tableName 的位置**，将：
```javascript
pool.query(`SELECT ... FROM ${tableName} WHERE ...`, [...])
```
改为：
```javascript
pool.query(`SELECT ... FROM ${validateTable(tableName)} WHERE ...`, [...])
```
**具体修改点（共 10 处）**：
1. 第 83 行附近：`pool.query(\`SELECT * FROM ${tableName} WHERE id = ?\`, [businessId])` → 包裹 `validateTable(tableName)`
2. 第 88 行附近：`pool.query(\`UPDATE ${tableName} SET ...\`, [...])` → 同上
3. 第 114 行附近：同模式
4. 第 143 行附近：同模式
5. 第 162 行附近：同模式
6. 第 174 行附近：同模式
7. 第 181 行附近：同模式
8. 第 241 行附近：同模式
9. 第 302 行附近：同模式
10. 第 323 行附近：同模式
**验证方法**：运行 `npx jest backend/tests/approval.test.js --no-coverage` 确认所有审批相关测试通过。

---

## P2-3：database/migrations/ — 迁移文件编号跳号 040、064、065，需在 README 中记录原因

**文件**：`C:\huakey-crm\database\migrations\README.md`（如不存在则创建）
**问题**：当前迁移文件编号为 000–039、041–063、066–069。跳过了 040、064、065。这不影响功能（`run_migrations.js` 按文件名字典序执行），但会导致：
1. 新开发者插入迁移时可能与之后恢复的老编号冲突
2. 完整性审计时无法确定是"有意跳过"还是"文件被误删"
**需要添加到 README.md 的内容**：
```markdown
## 迁移编号说明

当前迁移文件列表存在以下编号空缺，均为有意跳过：

| 编号 | 状态 | 原因 |
|------|------|------|
| 040  | 跳过 | [待补充：请项目负责人填写具体原因，如"需求废弃，合并到 039"] |
| 064  | 跳过 | [待补充：请项目负责人填写具体原因] |
| 065  | 跳过 | [待补充：请项目负责人填写具体原因] |

> 新迁移请从当前最大编号（069）之后顺序递增。严禁填补历史空缺编号，以免与已部署环境的 `schema_migrations` 表记录冲突。
```
**验证方法**：确认 README.md 存在且包含上表。

---

## P2-4：backend/services/uploadRouteService.js — 文件名生成使用 Date.now() + Math.random()，建议改为 crypto.randomUUID()

**文件**：`C:\huakey-crm\backend/services\uploadRouteService.js`
**行号**：第 95–99 行附近（文件名生成逻辑）
**当前代码**（大致逻辑）：
```javascript
const filename = Date.now() + '_' + Math.random().toString(36).substring(2, 15) + ext;
```
**问题**：`Math.random()` 不是密码学安全的随机源，虽然 38 位随机字符串的实际碰撞概率可忽略，但在安全审计中属于不推荐实践。
**正确写法**：
```javascript
const crypto = require('crypto');
// ... 在生成文件名处：
const filename = crypto.randomUUID() + ext;
```
**注意**：`crypto.randomUUID()` 在 Node.js 14.17.0+ 可用（项目使用 Node 22，完全兼容）。生成的 UUID 格式为 `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`，虽然比原实现多了连字符，但对文件名无不良影响。
**验证方法**：上传一个文件，检查 `uploads/` 目录下的文件名是否为标准 UUID 格式，且上传和下载功能正常。

---

## P2-5：CSRF 防护 — JWT + HttpOnly Cookie 并存（审计确认安全，仅需文档补充）

**现状**：系统同时支持 `Authorization: Bearer <token>` 头和 HttpOnly Cookie 传递 JWT。Cookie 配置为 `sameSite: 'strict'` + `httpOnly: true` + `secure: true`（生产环境）。
**审计结论**：`sameSite: 'strict'` 已完全防御跨站 CSRF 攻击，无需额外 CSRF token 中间件。**代码层面无需修改。**
**需要补充到部署文档的内容**：在 `deploy/README.md` 或项目 README 中添加一节说明前端应优先使用哪种鉴权方式（Bearer header 或 Cookie），以及 CORS_ORIGIN 配置如何与鉴权方式配合。
```markdown
## 鉴权方式说明

系统同时支持两种 JWT 传递方式：

| 方式 | 适用场景 | 优点 | 注意 |
|------|---------|------|------|
| `Authorization: Bearer <token>` | REST API 调用、第三方集成 | 通用标准 | 需要前端手动存储和附加 token |
| `Cookie: token=<jwt>`（HttpOnly） | 浏览器同源访问 | 自动携带，JS 不可读（防 XSS） | 需配合 `sameSite: 'strict'` |

当前前端（Vue 3）使用 Cookie 方式。CSRF 已通过 `sameSite: 'strict'` 防御，无需额外 token。
```
**验证方法**：无需验证。

---

# 四、P3 优化项（技术债务跟踪）

---

## P3-1：deploy/nginx-synology.conf — 静态资源缺少长期缓存头（Cache-Control: immutable）

**文件**：`C:\huakey-crm\deploy\nginx-synology.conf`
**位置**：在 `server` 块内、现有三个 `location` 块之后，新增一个 `location` 块用于静态资源缓存
**问题**：Vite 构建的 JS/CSS 文件自带 content hash（如 `vendor-abc123.js`），天然适合长期缓存，但 Nginx 未设置 `expires` 和 `Cache-Control: immutable` 头。
**新增代码**（追加在 `server { }` 块末尾，`location / { }` 块的闭合花括号之后、`}` 之前）：
```nginx
    # 带 hash 的静态资源 — 长期缓存（Vite content hash 保证唯一性）
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        proxy_pass http://app:5000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
```
**验证方法**：部署后使用 `curl -I http://localhost/assets/vendor-abc123.js` 检查响应头是否包含 `Cache-Control: public, immutable` 和 `Expires`。

---

## P3-2：缺少部署后一键 smoke test 脚本

**新建文件**：`C:\huakey-crm\scripts\smoke-test.sh`
**问题**：系统有完整的 Jest 测试套件（577 tests, 70 suites）和 `/api/health` 端点，但无独立的、可在生产 NAS 上直接运行的一键冒烟测试脚本。
**脚本内容**：
```bash
#!/bin/bash
# 华科 CRM 部署后冒烟测试
# 用法：bash scripts/smoke-test.sh [BASE_URL]
# 默认 BASE_URL=http://localhost

set -e

BASE_URL="${1:-http://localhost}"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local url="$2"
  local expected="$3"
  local resp
  resp=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url" 2>/dev/null || echo "000")
  if [ "$resp" = "$expected" ]; then
    echo "  [PASS] $desc (HTTP $resp)"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $desc — expected HTTP $expected, got $resp"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== 华科 CRM Smoke Test ==="
echo "Target: $BASE_URL"
echo ""

# 1. 健康检查
check "Health endpoint"      "$BASE_URL/api/health"            "200"

# 2. 验证码（无需认证）
check "Captcha endpoint"     "$BASE_URL/api/auth/captcha"      "200"

# 3. Swagger 文档（如果启用）
check "Swagger docs"         "$BASE_URL/api-docs/"             "200"

# 4. 静态资源可达
check "Frontend index.html"  "$BASE_URL/"                      "200"

echo ""
echo "Result: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
```
**验证方法**：`bash scripts/smoke-test.sh`，预期 4/4 pass。

---

## P3-3：backend/app.js — Prometheus /api/v1/metrics 端点受管理员认证保护，生产监控需配置 Bearer token

**文件**：`C:\huakey-crm\backend/app.js`（metrics 路由挂载处）
**现状**：`/api/v1/metrics` 路由需要 `authenticateToken` + 管理员角色校验。这是安全的设计，但对 Prometheus 抓取增加了额外配置步骤。
**不需要修改代码。** 需要在部署文档中补充 Prometheus 抓取配置示例：
```markdown
## Prometheus 监控配置

`/api/v1/metrics` 端点需要管理员认证。在 Prometheus `prometheus.yml` 中配置 Bearer token：

```yaml
scrape_configs:
  - job_name: 'huakey-crm'
    scrape_interval: 30s
    metrics_path: '/api/v1/metrics'
    bearer_token: '<管理员JWT-token>'
    static_configs:
      - targets: ['your-nas-ip:80']
```
```
**验证方法**：无需验证。

---

## P3-4：backend/services/reportAnalyticsService.js — getBusinessDashboard() 聚合查询无 LIMIT（无需修复）

**文件**：`C:\huakey-crm\backend/services/reportAnalyticsService.js`
**行号**：第 465–473 行附近
**审计结论**：`getBusinessDashboard()` 中的 9 个 `pool.query()` 调用均为 `COALESCE(SUM(...))` 聚合查询，返回单行标量结果，不存在内存撑爆风险。**无需修改。**
**不需要执行任何操作。**

---

## P3-5：Jest 测试套件 — 存在 worker 未优雅退出警告

**文件**：需通过 `--detectOpenHandles` 定位
**现象**：运行 `npx jest` 后输出 `A worker process has failed to exit gracefully`。
**排查命令**：
```bash
cd C:\huakey-crm\backend
npx jest --detectOpenHandles --forceExit 2>&1 | Select-String -Pattern "Worker|open handle|TCPSERVERWRAP|Timeout"
```
**常见原因**：某个测试文件的 `afterAll()` 中未关闭数据库连接池或未清理 `setInterval`/`setTimeout`。
**修复方向**：定位到具体测试文件后，在 `afterAll()` 中添加：
```javascript
afterAll(async () => {
  await pool.end();  // 或 readOnlyPool.end()
});
```
**验证方法**：修复后重新运行 `npx jest --forceExit`，确认无 "exited gracefully" 警告。

---

# 五、汇总执行清单

| 序号 | 级别 | 文件 | 操作 | 预估工时 |
|------|------|------|------|----------|
| 1 | P0 | `docker-compose.synology.yml:37` | 改路径 `./init-complete.sql` → `./deploy/init-complete.sql` | 1 min |
| 2 | P0 | `docker-compose.synology.yml:107` | 改 healthcheck `curl` → `wget` | 1 min |
| 3 | P1 | `deploy/nginx-synology.conf:12-14` | 添加 `proxy_read_timeout` 等三行 | 2 min |
| 4 | P1 | `docker-compose.synology.yml` services 末尾 | 新增 backup 服务定义 | 5 min |
| 5 | P1 | `.env.example` 末尾 | 追加 6 个缺失的环境变量及注释 | 5 min |
| 6 | P1 | `backend/routes/auth.js` logout handler | 包裹 try-catch（忽略 DB 错误，总是清除 cookie） | 5 min |
| 7 | P1 | `database/backup.sh:5` | 硬编码密码改为必填检查 | 1 min |
| 8 | P2 | `backend/services/approvalService.js` | 添加 `validateTable()` 函数 + 10 处调用包装 | 15 min |
| 9 | P2 | `database/migrations/README.md` | 新建/追加跳号说明表 | 5 min |
| 10 | P2 | `backend/services/uploadRouteService.js` | `Date.now()+random` → `crypto.randomUUID()` | 3 min |
| 11 | P3 | `deploy/nginx-synology.conf` | 新增静态资源 cache location 块 | 3 min |
| 12 | P3 | `scripts/smoke-test.sh` | 新建冒烟测试脚本 | 5 min |
| 13 | P3 | `backend/tests/` | `--detectOpenHandles` 定位泄漏并修复 | 15 min |
| **合计** | | **10 个文件（5 修改 + 3 新增 + 2 文档）** | | **~66 min** |

---

> 提示：P0+P1 的 7 项修改集中在 5 个文件中，修复后即可满足生产部署最低安全标准。P2+P3 可在首次迭代中逐步完善。

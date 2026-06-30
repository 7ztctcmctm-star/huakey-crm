<!--
  Phase 2 Prompt 清单
  生成日期: 2026-06-29
  目标执行者: Trea / 其他 AI agent
  前提: Phase 1 (PROMPTS_FOR_PHASE1.md) 任务 A-F 已完成
  优先级顺序: 稳定性 > 安全 > 测试 > 性能 > 新功能
-->

# Phase 2 — 可分派 Prompt

> Phase 2 聚焦「生产可观测性」和「工程护城河」。每个任务独立自包含，可以分开执行。顺序按优先级排列。

---

## 任务 A: 结构化日志 + 日志轮转 (预计 45 分钟)

### 背景
当前所有日志通过 `console.log`/`console.error` 输出到 stdout/stderr，无结构化字段，无日志轮转，也无持久化。生产环境排查问题时需要结构化日志（JSON 格式），并按天轮转避免磁盘写满。

### 要求

1. 安装依赖：
   ```bash
   cd C:\huakey-crm\backend
   npm install winston winston-daily-rotate-file --save
   ```

2. 新建 `backend/config/logger.js`（替代 winston 初始化，不要和现有 `backend/middleware/logger.js` 冲突）：
   - 创建 winston logger 实例
   - 输出格式：JSON（`winston.format.json()`），包含 `timestamp`、`level`、`message`、`traceId`、`userId`、`method`、`path`、`statusCode`、`durationMs` 等字段
   - 两个 transport：
     - `console`：开发环境用，输出人类可读格式
     - `winston-daily-rotate-file`：生产环境用
       - 路径 `logs/app-%DATE%.log`
       - 每天轮转，保留 30 天
       - 单文件最大 50MB
       - gzip 压缩旧文件
   - 暴露 `error`、`warn`、`info`、`http` 四个方法，包装对 `req.traceId` 的自动提取

3. 修改 `backend/app.js`：
   - 全局错误处理（两个 error handler 中）把 `console.error` 替换为 `logger.error`
   - `unhandledRejection` / `uncaughtException` 处理器也替换
   - 服务器启动成功日志替换为 `logger.info`

4. 修改 `backend/middleware/logger.js`：
   - `globalLogMiddleware` 中把 `console.log` 替换为 `logger.http`
   - 记录字段：`durationMs`（计算方式：`const start = Date.now(); next(); const duration = Date.now() - start`）

### 验收标准
- `tail -f backend/logs/app-*.log` 能看到 JSON 格式的结构化日志
- 每条日志包含 `traceId` 和 `durationMs`
- 旧日志文件被自动 gzip 压缩

---

## 任务 B: Prometheus 指标端点 (预计 45 分钟)

### 背景
当前系统无任何运行时指标暴露。排查性能问题只能靠手动查日志，无法看到 QPS、延迟分布、错误率趋势。需要暴露 `/api/metrics` 端点（仅管理员可访问），输出 Prometheus 兼容格式。

### 要求

1. 安装依赖：
   ```bash
   cd C:\huakey-crm\backend
   npm install prom-client --save
   ```

2. 新建 `backend/config/metrics.js`：
   - 使用 `prom-client` 创建以下指标：
     - `http_requests_total` (Counter)：按 method、path、status 分组
     - `http_request_duration_seconds` (Histogram)：按 method、path 分组，buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
     - `db_connections_active` (Gauge)：当前活跃连接数
     - `db_connections_idle` (Gauge)：当前空闲连接数
     - `memory_heap_bytes` (Gauge)：堆内存使用量
   - 暴露 `metricsMiddleware`：自动为每个请求递增 counter + 记录 duration
   - 暴露 `metricsRouter`：提供 `GET /metrics` 端点返回 `register.metrics()`

3. 在 `backend/app.js` 中挂载：
   - `metricsMiddleware` 放在 traceId 之后、路由之前（确保所有请求都计入）
   - `/api/metrics` 路由放在 `apiRouter` 中，需 `authenticateToken` + admin 检查

4. 数据库连接池指标采集：
   - 在 `backend/config/database.js` 中新增 `collectPoolMetrics()` 函数
   - 使用 `pool.pool._allConnections.length` 和 `pool.pool._freeConnections.length` 获取连接数
   - 每 15 秒调用一次更新 Gauge

### 验收标准
- 管理员访问 `http://localhost:5000/api/metrics` 返回 Prometheus 格式文本
- 包含 `http_requests_total`、`http_request_duration_seconds` 等指标
- 非管理员返回 403

---

## 任务 C: 错误告警通知 (预计 30 分钟)

### 背景
已有企业微信 webhook 通知能力（`backend/utils/notification.js`），但未接入错误告警。生产环境运行时，500 错误、未捕获异常、数据库连接失败等需要主动推送通知。

### 要求

1. 新建 `backend/utils/alert.js`：
   - 导出 `alertError(context)` 函数，封装 WeChat Markdown 消息
   - 消息格式：
     ```
     ## 🚨 CRM 系统告警
     > 时间: {timestamp}
     > 级别: {level}
     > 来源: {source}
     > TraceID: {traceId}
     > 详情: {message}
     ```
   - 内置防抖：同一类错误 5 分钟内只发一次（用内存 Map 实现，key = `${level}:${source}:${message前80字符}`）
   - 失败时静默降级（不因为通知失败影响业务）

2. 接入告警点：
   - `backend/app.js` 的全局错误处理中间件（两个）：500 错误 → `alertError`
   - `backend/config/database.js` 的 `pool.on('error', ...)`：数据库连接错误 → `alertError`
   - `backend/config/redis.js` 的 `redis.on('error', ...)`：Redis 连接错误 → `alertError`
   - `backend/cron/scheduler.js` 的 `CRITICAL_JOBS` 失败：关键任务失败 → `alertError`
   - `process.on('unhandledRejection')` 和 `uncaughtException`：→ `alertError`

3. 新增环境变量 `ALERT_ENABLED=true`（默认 `false`），开发环境不发送告警。

### 验收标准
- 触发一个 500 错误后，企业微信收到 Markdown 格式告警消息
- 同一错误 5 分钟内重复触发不会重复告警
- `ALERT_ENABLED=false` 时不发送任何消息

---

## 任务 D: P2 遗留项 — Dependabot + Trivy + 跨浏览器测试 (预计 60 分钟)

### 背景
`CURRENT_PHASE.md` 的 P2 区域列了三项未完成的工程基础设施：Dependabot、Trivy 镜像扫描、跨浏览器/响应式测试。

### 要求

#### D1. Dependabot 配置 (10 分钟)

1. 新建 `.github/dependabot.yml`：
   ```yaml
   version: 2
   updates:
     - package-ecosystem: "npm"
       directory: "/backend"
       schedule:
         interval: "weekly"
         day: "monday"
         time: "09:00"
         timezone: "Asia/Shanghai"
       open-pull-requests-limit: 5
       versioning-strategy: "auto"
       labels:
         - "dependencies"
         - "backend"
     - package-ecosystem: "npm"
       directory: "/frontend"
       schedule:
         interval: "weekly"
         day: "monday"
         time: "09:00"
         timezone: "Asia/Shanghai"
       open-pull-requests-limit: 5
       versioning-strategy: "auto"
       labels:
         - "dependencies"
         - "frontend"
     - package-ecosystem: "docker"
       directory: "/"
       schedule:
         interval: "weekly"
         day: "monday"
       labels:
         - "dependencies"
         - "docker"
   ```

#### D2. Trivy 镜像扫描 (20 分钟)

2. 在 `.github/workflows/ci.yml` 中新增 `image-scan` job：
   ```yaml
   image-scan:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - name: Build Docker image
         run: docker build -t huakey-crm:ci -f deploy/synology/Dockerfile.synology .
       - uses: aquasecurity/trivy-action@0.28.0
         with:
           image-ref: 'huakey-crm:ci'
           format: 'table'
           exit-code: '1'
           severity: 'CRITICAL'
           # 只在发现 CRITICAL 级别漏洞时阻断
   ```

3. 在 `frontend/playwright.config.js` 中补充移动端视口配置：
   - 已有一个项目，补充第二个项目：
     ```js
     {
       name: 'Mobile Chrome',
       use: {
         ...devices['Pixel 5'],
       },
     },
     ```

4. 在 `frontend/e2e/` 中新增 `responsive.spec.js`：
   - 仅做 smoke 级别的响应式验证：
     - 桌面端 (1280x720)：侧边栏可见、表格渲染正常
     - 移动端 (Pixel 5)：侧边栏折叠为汉堡菜单、表格横向滚动可用
   - 不追求像素级完美，仅验证不崩、不重叠

### 验收标准
- `.github/dependabot.yml` 存在且格式正确
- Trivy job 在 CI 中正常执行（发现 CRITICAL 级别漏洞时报红但不强制阻断）
- Playwright 响应式测试覆盖桌面 + 移动端两个视口

---

## 任务 E: 数据库查询性能基线 (预计 45 分钟)

### 背景
系统有 40 个业务路由模块、61 个 service 文件，但没有慢查询监控，也没有查询性能基线。生产环境中如果查询变慢无法及时发现。

### 要求

1. 新建 `backend/config/slowQuery.js`：
   - 包装 `pool.query`（通过 Proxy 拦截），记录每次查询耗时
   - 超过阈值（默认 1000ms）的查询标记为慢查询
   - 慢查询输出到 winston logger（如果存在），包含：SQL（截断前 200 字符）、参数、耗时、traceId
   - 阈值通过环境变量 `SLOW_QUERY_THRESHOLD_MS` 配置

2. 在 `backend/tests/performance/` 中新增 `k6-api-baseline.js`：
   - 覆盖 6 个核心 API 的性能基线：
     - `POST /api/auth/login` — P95 < 500ms
     - `GET /api/customer?page=1&pageSize=20` — P95 < 1000ms
     - `GET /api/report/sales-funnel` — P95 < 2000ms
     - `GET /api/opportunity?page=1&pageSize=20` — P95 < 1000ms
     - `GET /api/product?page=1&pageSize=20` — P95 < 500ms
     - `GET /api/health` — P95 < 200ms
   - 配置：10 VUs，60s 持续时间，ramp-up 30s
   - 使用 k6 `check()` 验证 P95 阈值

3. 新增 npm script（`backend/package.json`）：
   - `"perf:baseline": "k6 run tests/performance/k6-api-baseline.js"`

### 验收标准
- 慢查询日志能正确捕获超过阈值的 SQL 并输出到日志
- `k6-api-baseline.js` 可独立运行，覆盖 6 个核心 API
- 无硬编码认证 token（通过环境变量 `TEST_TOKEN` 传入）

---

## 任务 F: API 文档自动生成 (预计 40 分钟)

### 背景
系统有 40 个路由模块但无 API 文档。Phase 1 已完成统一响应格式中间件，现在可以基于此生成文档。

### 要求

1. 安装依赖：
   ```bash
   cd C:\huakey-crm\backend
   npm install swagger-jsdoc swagger-ui-express --save
   ```

2. 新建 `backend/config/swagger.js`：
   - swagger-jsdoc 配置，扫描 `backend/routes/**/*.js`
   - API 基本信息：title "铧旗 CRM API"、version "1.0.0"
   - 基础路径 `/api`
   - 安全定义：Bearer Token
   - 暴露 `swaggerSpec` 和 `swaggerUiMiddleware`（swagger-ui-express）

3. 在 `backend/app.js` 中挂载：
   - `apiRouter.use('/docs', swaggerUiMiddleware)`
   - 不要求认证（开发环境使用，生产可通过环境变量控制）

4. 为核心路由补充 JSDoc 注释（选 6 个最重要的）：
   - `backend/routes/auth.js`：登录、获取验证码、刷新 token
   - `backend/routes/customer.js`：列表、详情、创建、更新
   - `backend/routes/opportunity.js`：列表、创建
   - `backend/routes/report/index.js`：销售漏斗、总览
   - `backend/routes/product.js`：列表
   - `backend/routes/contract/index.js`：列表

   每个路由至少包含 `@swagger` 注释，格式如下：
   ```js
   /**
    * @swagger
    * /api/customer:
    *   get:
    *     summary: 获取客户列表
    *     tags: [客户管理]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - in: query
    *         name: page
    *         schema:
    *           type: integer
    *           default: 1
    *     responses:
    *       200:
    *         description: 成功
    *         content:
    *           application/json:
    *             schema:
    *               $ref: '#/components/schemas/ApiResponse'
    */
   ```

### 验收标准
- 浏览器访问 `http://localhost:5000/api/docs` 显示 Swagger UI
- 至少 6 个 API 端点有完整的文档描述
- `Try it out` 功能可用

---

## 任务 G: 前端空白态/加载态/错误态审计 (预计 45 分钟)

### 背景
前端有 30+ 视图，但无统一的 loading、empty、error 状态处理组件。部分页面可能在数据加载中或出错时展示不友好。

### 要求

1. 新建 `frontend/src/components/common/StateWrapper.vue`：
   - Props: `loading` (Boolean)、`error` (String)、`empty` (Boolean)、`emptyText` (String)
   - Loading 态：`<el-skeleton :rows="5" animated />`
   - Error 态：`<el-result icon="error" :title="error" />` + 重试按钮（emit `retry` 事件）
   - Empty 态：`<el-empty :description="emptyText || '暂无数据'" />`
   - 正常态：渲染默认 slot

2. 审计 `frontend/src/views/customer/` 目录下所有 `.vue` 文件：
   - 列出每个文件中是否处理了 loading / error / empty 三种状态
   - 输出一个表格到控制台
   - 对缺失状态的页面，用 `StateWrapper` 包裹数据区域（不改动业务逻辑）

3. 新建 `frontend/src/components/common/GlobalErrorBoundary.vue`：
   - 使用 Vue `onErrorCaptured` 钩子捕获子树中的未处理错误
   - 显示 `<el-result icon="error" title="页面出现错误" sub-title="请刷新页面重试" />`
   - 在 `frontend/src/App.vue` 中包裹 `<router-view />`

### 验收标准
- `StateWrapper.vue` 三种状态均可用
- 客户模块所有页面有统一的 loading/error/empty 展示
- 页面级别 JS 错误不会白屏

---

## 任务 H: 数据库迁移 up/down 测试 (预计 30 分钟)

### 背景
`CURRENT_PHASE.md` P2 区域提到迁移脚本 up/down 测试。当前有 65 个 migration 文件，没有验证 down 脚本是否能正确回滚。

### 要求

1. 新建 `backend/tests/db/migration-roundtrip.test.js`：
   - 使用 CI 环境的 MySQL（`docker-compose.ci.yml` 或本地 MySQL）
   - 测试逻辑：
     1. 对最近的 10 个 migration 文件依次执行 down（倒序）
     2. 对 down 后的状态执行 up（正序）
     3. 断言 up 后表结构一致（用 `SHOW CREATE TABLE` 对比关键表）
   - 关键表列表：`crm_customer`、`crm_opportunity`、`crm_quote`、`crm_contract`、`sys_user`
   - 不要求覆盖全部 65 个 migration，仅验证最近 10 个（保证机制正确即可）

2. 新增 CI job `migration-test` 在 `.github/workflows/ci.yml`：
   ```yaml
   migration-test:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - uses: actions/setup-node@v4
         with: { node-version: '22' }
       - run: docker compose -f docker-compose.ci.yml up -d
       - run: sleep 25
       - run: cd backend && npm ci
       - run: cd backend && npx jest tests/db/migration-roundtrip.test.js --forceExit --testTimeout=60000
       - if: always()
         run: docker compose -f docker-compose.ci.yml down -v
   ```

### 验收标准
- 最近 10 个 migration 的 down+up 往返测试通过
- CI 中 `migration-test` job 正常执行

---

## 任务 I: 前端性能指标采集 (预计 30 分钟)

### 背景
前端无任何性能指标采集（FCP、LCP、CLS 等）。用户侧页面加载慢无法感知。

### 要求

1. 新建 `frontend/src/utils/perfume.js`：
   - 使用 `web-vitals` 库（如果前端已有则可直接使用，否则安装 `npm install web-vitals --save`）
   - 采集 FCP（First Contentful Paint）、LCP（Largest Contentful Paint）、CLS（Cumulative Layout Shift）、FID（First Input Delay）
   - 当 LCP > 2500ms 或 CLS > 0.1 时，`console.warn` 输出警告
   - 生产环境下，通过 `navigator.sendBeacon` 将指标发送到 `/api/metrics/client`

2. 新建 `backend/routes/metrics.js`：
   - `POST /api/metrics/client`：接收前端性能指标
   - 写入 `sys_client_perf` 表（如果表不存在则自动创建）
   - 表结构：`id, metric_type, value, page_url, user_agent, timestamp`
   - 不要求认证（但需校验来源为本站）

3. 在 `frontend/src/main.js` 中初始化性能采集：
   ```js
   import { initPerfume } from './utils/perfume';
   initPerfume();
   ```

### 验收标准
- 浏览器控制台能看到 FCP/LCP 等指标日志
- `/api/metrics/client` 能接收并存储前端性能数据

---

## 任务 J: 部署文档 + 故障排查手册 (预计 30 分钟)

### 背景
项目有 `deploy/` 目录和多个部署脚本，但无集中式部署文档。新接手的人不知道如何部署、排查常见问题。

### 要求

1. 新建 `docs/deployment.md`：
   - 环境要求：Node 22、MySQL 8.0、Redis 7（可选）
   - Docker 部署步骤（使用 `deploy/docker-compose.prod.yml`）
   - NAS 部署步骤（使用 `deploy/synology/` 下的脚本）
   - 环境变量清单（从 `.env.example` 或代码中提取所有环境变量，含默认值和说明）
   - Nginx 配置说明（指向 `deploy/nginx-stable.conf`）
   - 灰度发布流程（指向 `deploy/canary-deploy.sh`）

2. 新建 `docs/troubleshooting.md`：
   - 常见问题：
     - 数据库连接失败（检查 `DB_HOST`、`DB_PORT`、防火墙）
     - Redis 连接失败（检查 `REDIS_ENABLED`，系统已降级处理）
     - 前端 502（检查后端是否启动、Nginx upstream 配置）
     - 上传文件失败（检查 Supabase Storage 配置或本地 `uploads/` 目录权限）
     - 定时任务不执行（检查 `VERCEL` 环境变量，本地 cron 和 Vercel Cron 二选一）
   - 每个问题包含：现象 → 排查命令 → 解决方案

3. 新建 `docs/architecture.md`：
   - 不需要长篇大论，一页纸即可
   - 包含：系统架构图（ASCII art）、技术栈一览、目录结构说明、数据流图
   - 引用已有文档：`SYSTEM_ARCHITECTURE.md`（如果内容不过时则直接链接）

### 验收标准
- 三份文档独立可读，不含过时信息
- 一个新接手的人按 `deployment.md` 可完成首次部署

---

## 执行建议

推荐执行顺序：

1. **A (结构化日志)** — 基础设施依赖最少，其他任务可以依赖它输出结构化日志
2. **B (Prometheus 指标)** — 和 A 同为可观测性基础设施，独立性强
3. **C (错误告警)** — 依赖 A（日志）和已有的 notification.js
4. **D (P2 遗留项)** — Dependabot / Trivy / 响应式测试，独立性强，可并行
5. **E (查询性能基线)** — 依赖 A（慢查询日志），但可以并行开发
6. **F (API 文档)** — 独立性强，可随时执行
7. **G (前端状态审计)** — 独立性强，可随时执行
8. **H (迁移测试)** — 依赖 CI 改造，放在架构稳定后
9. **I (前端性能采集)** — 依赖 B（metrics 端点），在 B 之后执行
10. **J (文档)** — 依赖其他任务完成后信息才准确，放最后

**并行策略**：A+B 可同时开工；D+F+G 可同时开工；C 在 A 完成后启动。

---

## 与 Phase 1 的衔接

- Phase 1 任务 A (traceId) 和 B (统一响应格式) 是 Phase 2 任务 A (结构化日志) 和 F (API 文档) 的前置依赖。如果 Phase 1 未完成，先完成 Phase 1。
- Phase 2 不涉及数据库核心结构修改、不修改权限系统、不更换技术栈 — 符合 `CURRENT_PHASE.md` 中的开发原则。

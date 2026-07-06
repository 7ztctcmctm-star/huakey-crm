<!--
  Phase 6: IMPLEMENTATION_PLAN Phase 2 架构改进 Prompt
  生成日期: 2026-06-30
  前提: Phase 1 闭环已提交 (48c4800)，Phase 5 任务 A (ESLint) 未执行
        65/65 suites 491/491 tests 全量通过
  IMPLEMENTATION_PLAN.md Phase 2 (2.1-2.6) 全部标记为未完成
  但部分代码已在昨天实现：2.2.2 权限缓存 Redis、2.3.1-2.3.4 readOnlyPool、2.5.1 knowledgeService
-->

# Phase 6 — IMPLEMENTATION_PLAN Phase 2 架构改进

> 这 6 个任务是原 IMPLEMENTATION_PLAN.md Phase 2 的内容，与之前 PROMPTS_FOR_PHASE2 (可观测性) 是**不同层次**的工作。
> 按「先补齐已完成一半的，再开全新任务」的顺序排列。

---

## 任务 A: 2.2 真正启用 Redis (预计 40 分钟，需 Docker)

### 当前状态
- 2.2.2 权限缓存迁 Redis：cache.js 已有代码，但 REDIS_ENABLED 未开
- 2.2.3 登录限流：仍用内存 Map，重启丢失
- 2.2.4 session：仍用内存
- Redis 容器已在 docker-compose.synology.yml 中配置

### 要求

1. **2.2.1 + 2.2.5 — 启用并限制 Redis**：
   在 docker-compose.synology.yml 的 Redis 服务添加内存限制：
   `yaml
   redis:
     image: redis:7-alpine
     deploy:
       resources:
         limits:
           memory: 128M
     command: redis-server --maxmemory 100mb --maxmemory-policy allkeys-lru --save ""
   `
   在 .env 或 docker-compose 环境变量设置 REDIS_ENABLED=true。

2. **2.2.3 — 限流持久化到 Redis**：
   修改 ackend/middleware/rateLimiter.js：
   - 当前用内存 Map 存储限流计数
   - 添加 Redis 作为可选后端（检测 REDIS_ENABLED，有 Redis 用 Redis，fallback 到内存）
   - Redis key 格式：atelimit:{ip}:{endpoint}，TTL = 窗口时间

3. **2.2.4 — session 迁移到 Redis**：
   - 当前 session 在内存中，无持久化
   - 如果已有 express-session，接入 connect-redis
   - 否则确认当前 session 机制（检查 ackend/app.js 中是否有 express-session 或类似中间件）

4. 验证：
   - 重启后端后限流计数不丢失
   - Redis 内存不超过 100MB
   - docker stats redis 确认内存限制生效

### 验收标准
- REDIS_ENABLED=true 且 Redis 连接正常
- 限流计数跨重启持久化
- Redis 内存限制 128MB 生效

---

## 任务 B: 2.3 读写分离完善 (预计 30 分钟，需 MySQL readonly 用户)

### 当前状态
- 2.3.1 readOnlyPool：database.js 中已有定义
- 2.3.2-2.3.4 report/ai/search 路由已切换 readOnlyPool
- 2.3.5 验证 + DB_RO_* 环境变量未配置

### 要求

1. **2.3.1 补全 — 环境变量支持**：
   在 ackend/config/database.js 中，readOnlyPool 需从环境变量读取：
   `js
   const readOnlyPool = mysql.createPool({
     host: process.env.DB_RO_HOST || process.env.DB_HOST || 'localhost',
     port: process.env.DB_RO_PORT || process.env.DB_PORT || 3306,
     user: process.env.DB_RO_USER || process.env.DB_USER || 'crm_user',
     password: process.env.DB_RO_PASSWORD || process.env.DB_PASSWORD,
     database: process.env.DB_NAME || 'huakey_crm',
     waitForConnections: true,
     connectionLimit: 5,
     queueLimit: 0
   });
   `

2. **2.3.5 — 验证读写分离正确性**：
   创建 ackend/tests/db/readwrite-separation.test.js（仅当 DB 可用时运行）：
   - 验证 readOnlyPool 连接成功（SELECT 1）
   - 验证写操作路由（customer/add、contract/create）仍使用主池
   - 验证读操作路由（report/sales-funnel、customer/list）使用只读池

3. 在 ackend/.env.example 添加 DB_RO_* 变量说明。

### 验收标准
- readOnlyPool 可独立配置数据库连接
- .env.example 含 DB_RO_* 变量

---

## 任务 C: 2.5 大 Route 文件拆分收尾 (预计 45 分钟)

### 当前状态
- 2.5.1 knowledge.js: 已拆分到 knowledgeService（✅ done）
- 2.5.2 supplier.js (14.9KB): 未拆
- 2.5.3 detail.js (12KB): 未拆
- 2.5.4 其他超过 300 行的 route: 未审计

### 要求

1. **2.5.2 — supplier.js → supplierService 完善**：
   supplierService.js 已存在（28 行 CJK，avg 4.0 seq），确认其覆盖率。
   将 supplier.js 中剩余的 SQL 操作（如 listSuppliers、getSupplier、updateSupplier、deleteSupplier）迁移到 supplierService。

2. **2.5.3 — detail.js → customerDetailService**：
   customerDetailService.js 已存在（475 行 CJK）。确认 detail.js（12KB）是否还有裸 SQL，如有，迁移到 service。

3. **2.5.4 — 超过 300 行的 route 文件审计**：
   运行以下命令找出大文件：
   `ash
   cd backend/routes
   Get-ChildItem -Recurse -Filter *.js | ForEach-Object {
      = (Get-Content .FullName | Measure-Object -Line).Lines
     if ( -gt 300) { ":  行" }
   }
   `
   对超过 300 行且仍有 pool.query 的文件，创建或补充对应 service。

### 验收标准
- supplier.js/detail.js 中 pool.query 归零
- 超过 300 行的 route 文件清单已输出

---

## 任务 D: 2.6 基础监控完善 (预计 30 分钟)

### 当前状态
- 2.6.1 nodemailer: 已安装
- 2.6.2 告警规则: 未配置
- 2.6.3 /api/health 增强: 部分实现（已有 DB ping），Redis 检测已在 health 路由中
- 2.6.4 Docker 健康检查联动: 未做

### 要求

1. **2.6.2 — 告警规则配置**：
   在 ackend/utils/alert.js 中完善告警触发条件：
   - DB 连接失败 → 邮件告警
   - Redis 连接失败 → 邮件告警
   - 5 分钟内 500 错误超过 10 次 → 邮件告警
   - 添加 .env 变量：ALERT_EMAIL_TO（接收告警的邮箱）

2. **2.6.3 — /api/health 增强**：
   确认 GET /api/health 返回的 JSON 包含：
   `json
   {
     "code": 200,
     "data": {
       "status": "ok",
       "db": true,
       "redis": true,
       "version": "crm_v1",
       "timestamp": "..."
     }
   }
   `

3. **2.6.4 — Docker 健康检查**：
   在 docker-compose.synology.yml 的 app 服务添加：
   `yaml
   healthcheck:
     test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
     interval: 30s
     timeout: 5s
     retries: 3
   `

### 验收标准
- /api/health 返回 DB 和 Redis 状态
- Docker healthcheck 可正常检测 app 健康
- 邮件告警配置可用（至少配置项存在）

---

## 任务 E: 2.4 API 版本前缀 (预计 45 分钟)

### 背景
当前所有路由使用 /api/ 前缀，无版本号。迁移到 /api/v1/ 为将来 API 变更留空间。

### 要求

1. **2.4.1 — 添加 /api/v1/ 前缀**：
   修改 ackend/app.js：
   `js
   // 改前:
   app.use('/api', apiRouter);
   
   // 改后:
   app.use('/api/v1', apiRouter);
   app.use('/api', (req, res, next) => {
     res.set('Deprecation', 'true');
     res.set('Sunset', 'Sat, 01 Aug 2026 00:00:00 GMT');
     res.redirect(307, '/api/v1' + req.originalUrl.replace('/api', ''));
   });
   `

2. **2.4.3 — 前端 API base URL**：
   在 rontend/src/utils/request.js (或对应的 axios 配置) 中，将 baseURL 从 /api 改为 /api/v1。

3. **2.4.4 — 文档**：
   新建 docs/API_VERSIONING.md，说明版本策略和迁移步骤。

### 验收标准
- /api/v1/health 正常响应
- /api/health 返回 307 重定向，带 Deprecation 头
- 前端请求全部走 /api/v1/
- 全量测试通过（确认 test 中的路径也更新）

---

## 任务 F: 2.1 模块注册机制 (预计 2-3 小时，需设计评审)

### 背景
当前 app.js 有 42 条手写 piRouter.use('/xxx', xxxRoutes)，每加一个模块就要改 app.js + 手动注册。模块注册器可自动发现并加载模块。

### 要求

1. **2.1.1 — 后端 ModuleRegistry**：
   新建 ackend/core/ModuleRegistry.js：
   `js
   class ModuleRegistry {
     constructor() { this.modules = new Map(); }
     register(name, { routes, permissions = [], migrations = [] }) {
       this.modules.set(name, { routes, permissions, migrations });
     }
     getAllRoutes() {
       const all = [];
       for (const [name, mod] of this.modules) {
         all.push({ prefix: /, router: mod.routes });
       }
       return all;
     }
     getAllPermissions() { /* ... */ }
   }
   module.exports = new ModuleRegistry();
   `

2. **2.1.2 — 模块自描述**：
   为每个路由目录添加 module.js（例如 outes/customer/module.js）：
   `js
   const router = require('./index');
   module.exports = {
     routes: router,
     permissions: ['customer:list', 'customer:add', 'customer:edit', 'customer:delete'],
   };
   `

3. **2.1.3 — app.js 自动加载**：
   替换 42 条手写 piRouter.use 为遍历注册器：
   `js
   const registry = require('./core/ModuleRegistry');
   // 自动发现并注册所有模块
   require('./routes/customer/module'); // 注册
   // ...
   for (const { prefix, router } of registry.getAllRoutes()) {
     apiRouter.use(prefix, router);
   }
   `

### 注意
这是**最大的重构**，影响所有路由注册方式。建议：
- 先建立 registry 基础设施
- 用 2-3 个模块做试点（customer、product、report）
- 验证通过后再批量迁移
- 不要改权限中间件逻辑

### 验收标准
- ModuleRegistry 能注册和加载模块
- 试点模块通过全量测试
- app.js 中试点模块的 apiRouter.use 被 registry 替代

---

## 执行建议

| 顺序 | 任务 | 预计 | 风险 |
|------|------|------|------|
| 1 | A: Redis 启用 | 40min | 低（代码已有，主要是配置） |
| 2 | B: 读写分离完善 | 30min | 低（代码已有） |
| 3 | C: Route 拆分收尾 | 45min | 中（需确认 service 完整性） |
| 4 | D: 监控完善 | 30min | 低 |
| 5 | E: API 版本前缀 | 45min | 中（会影响所有路由和测试） |
| 6 | F: 模块注册 | 2-3h | 高（大重构，建议先做设计评审） |

A+B+C 可并行，D 可独立做。E 和 F 放最后，E 完成后需全量回归测试。
﻿
---

## 任务 G: 3.2.1 前端大组件拆分 (预计 1.5-2 小时)

### 背景
三个超大 Vue 组件：layout/index.vue (1047行)、customer/List.vue (1256行)、Dashboard.vue (501行)。

### 要求

1. **G1 layout/index.vue (1047行)** 提取侧边栏为 Sidebar.vue，提取顶部导航为 HeaderBar.vue，目标 200 行。
2. **G2 customer/List.vue (1256行)** 提取筛选区、表格区、分页/批量操作，目标 400 行。
3. **G3 Dashboard.vue (501行)** 已有子组件(StatsCards/SalesChart/PendingTasks)，确认使用后目标 200 行。

### 验收
构建无报错，功能无回归。

---

## 任务 H: 3.3.1 crm_pool_log RANGE 分区 (预计 30 分钟)

### 要求
新建 migration 文件，按 create_time 做月级 RANGE 分区，覆盖未来 12 个月 + p_default。

### 验收
SHOW CREATE TABLE crm_pool_log 显示分区存在。

---

## 任务 I: 3.3.4 MySQL/App 内存限制 (预计 15 分钟)

### 要求
在 docker-compose.synology.yml 为 mysql(256M)、app(384M)、redis(128M) 添加 deploy.resources。更新 MYSQL_CONFIG.md。

---

## 任务 J: 3.1.3 SSE 实时推送(可选) (预计 1-2 小时)

### 要求
新建 GET /api/sse/notifications，前端 EventSource 接入，新通知实时推送。

---

## 更新后的执行建议

| 顺序 | 任务 | 预计 |
|------|------|------|
| 1 | A: Redis | 40min |
| 2 | B: 读写分离 | 30min |
| 3 | G: 大组件拆分 | 1.5-2h |
| 4 | C: Route 收尾 | 45min |
| 5 | D: 监控完善 | 30min |
| 6 | H: pool_log | 30min |
| 7 | I: 内存限制 | 15min |
| 8 | E: API 版本 | 45min |
| 9 | F: 模块注册 | 2-3h |
| 10 | J: SSE(可选) | 1-2h |

A+B+H+I 可并行，G+C+K 可并行，D 可独立，E+F 放最后，J 可选。

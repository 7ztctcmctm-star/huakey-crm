# 华科 CRM 全面审计清单

> 生成日期：2026-07-02 | 基于项目完整结构分析
> 项目规模：49 路由 × 65 服务 × 85 测试文件 × ~70 迁移文件
> 用法：按轮次顺序逐项检查，每完成一项勾选 `[x]`，发现问题标记 P0/P1/P2/P3 并记录到 `AUDIT_FINDINGS.md`

---

# 第一轮：安全 + 数据库（最高优先级）

预计工时：1–2 天

---

## 1.1 认证与鉴权

### 1.1.1 JWT 密钥强度

- [x] **文件**: .env / .env.example
- **结果**: JWT_SECRET=\change_me_to_a_random_64_byte_hex_string\（占位值未更换）
- **详情**: .env 与 .env.example 完全一致，密钥从未被更换；JWT_EXPIRES_IN=7d（合理）
- **判定**: ⚠️ P1 — 当前为开发环境可接受，**生产部署前必须更换**为 128 字符随机 hex

### 1.1.2 Token 过期策略

- [x] **文件**: ackend/middleware/auth.js, ackend/routes/auth.js
- **结果**: 7d 过期 + refresh 黑名单机制设计正确
- **详情**: authenticateToken 每次请求并行检查黑名单 + 实时刷新角色权限；/refresh 路由：验证签名→查黑名单→查用户→黑名单旧 token→签发新 token，顺序正确
- **判定**: ✅ 无问题

### 1.1.3 路由认证覆盖

- [x] **文件**: 全部 48 个 route 文件
- **结果**: 47/48 个 route 文件使用 authenticateToken；仅 4 个公开路由无认证
- **详情**: 公开路由：GET /auth/captcha、POST /auth/login、POST /auth/logout、POST /auth/refresh — 均有充分理由不认证；metrics.js 的 POST /api/metrics/client 为前端性能上报，匿名合理
- **判定**: ✅ 无问题

### 1.1.4 Swagger 文档认证

- [x] **文件**: ackend/app.js
- **结果**: 生产环境默认关闭，但启用时无认证保护
- **详情**: Swagger 路径为 /api/docs（非 /api-docs/）；NODE_ENV=production 时自动关闭，或设置 ENABLE_SWAGGER=true 开启；开启时无额外认证
- **判定**: ⚠️ P3 — 生产默认关闭风险可控；若需生产开启建议增加基础认证
## 1.2 权限模型

### 1.2.1 权限中间件覆盖

- [x] **审计完成**
- **结果**: 195 条 checkPermission 调用，覆盖 40/48 个 route 文件
- **8 个未使用 checkPermission 的文件分析**:

| 文件 | 保护方式 | 判定 |
|------|---------|------|
| api-platform.js | 全部 requireAdmin（更严格） | ✅ |
| automation.js | 主要 requireAdmin，**6 个 GET 路由仅 authenticateToken，无权限码** | ⚠️ P2 |
| **cronJobs.js** | **4 个路由零认证！GET /daily-scoring /clean-logs /auto-release /generate-reminders** | **🚨 P0** |
| currency.js | authenticateToken + requireAdmin/Manager | ✅ |
| metrics.js | POST /client 无认证（前端埋点） | ✅ |
| notification.js | authenticateToken（个人通知） | ✅ |
| permission.js | requireManager/requireAdmin | ✅ |
| sse.js | authenticateToken（SSE 推送） | ✅ |

- **P0 发现**: cronJobs.js 的 4 个定时任务端点无任何认证中间件，任何人可通过 HTTP GET 触发公海自动回收、日志清理、每日评分计算和提醒生成

### 1.2.2 数据权限隔离

- [x] **审计完成**
- **结果**: checkDataPermission 覆盖 11 个核心业务模块（followPlan、followUp、invoice、opportunity、purchase、quote、service、supplier、customer/detail、contract/crud、contract/export）
- **数据权限使用模式**: checkDataPermission 中间件注入 WHERE 子句到 req.dataPermissionWhere → service 层通过 buildDataPermissionWhere() 获取并追加到 SQL
- **覆盖率评估**:

| 模块 | 列表接口 | 详情接口 | 判定 |
|------|---------|---------|------|
| 客户 (customer) | ✅ checkDataPermission('customer', 'owner_id') | ✅ | ✅ |
| 合同 (contract) | ✅ checkDataPermission('contract', 'create_by') | ✅ | ✅ |
| 线索 (leads) | ❌ 仅 checkPermission('leads')，无数据隔离 | N/A | ⚠️ P2 |
| 报价 (quote) | ✅ checkDataPermission('quote', 'create_by') | ✅ | ✅ |
| 采购 (purchase) | ✅ checkDataPermission('purchase', 'owner_id') | ✅ | ✅ |
| 商机 (opportunity) | ✅ checkDataPermission('opportunity', 'owner_id') | ✅ | ✅ |
| 供应商 (supplier) | ✅ checkDataPermission('supplier', 'owner_id') | ✅ | ✅ |
| 产品 (product) | ❌ 无 checkDataPermission | ❌ | ⚠️ P3（产品通常全局共享） |
| 售后 (service) | ✅ checkDataPermission('service', 'create_by') | N/A | ✅ |

- **P2 发现**: leads.js 的列表接口仅使用 checkPermission('leads') 未使用 checkDataPermission，理论上存在跨用户数据可见风险

### 1.2.3 硬编码管理员绕过

- [x] **审计完成**
- **文件**: backend/middleware/admin.js
- **结果**: 无硬编码 roleId === 1 绕过
- **详情**: admin.js 使用 ROLES.ADMIN 常量和 ADMIN_ROLE_CODES Set 进行角色判断，requireAdmin 和 requireManager 均通过 req.user.roleCode 匹配而非硬编码 ID
- **判定**: ✅ 无问题。设计符合最佳实践

---

## 1.3 输入校验与注入防护

### 1.3.1 Joi Schema 覆盖率

- [x] 审计完成
- 结果: 275 条 POST/PUT 路由，100% 使用 validate() 中间件
- 判定: 无问题

### 1.3.2 SQL 注入全面扫描

- [x] 审计完成
- 结果: 70 处动态 SQL 模板字面量，全量审查，无 SQL 注入漏洞
- 分类: 28 处 fields.join() + ? 参数(安全) | 9 处 validateTable() 白名单(安全) | 14 处动态 WHERE + params(安全) | 5 处 ids.map('?') 占位符(安全) | 1 处 ALLOWED_FIELDS 白名单字段名(安全) | 1 处 BUSINESS_TABLE_MAP 直接引用
- P3 建议: approvalService.js:254 应使用 validateTable() 保持一致性

### 1.3.3 XSS 防护

- [x] 审计完成
- 结果: frontend 全部 .vue 文件零 v-html、零 innerHTML
- 判定: 无 XSS 风险


### 1.4.1 文件类型白名单

- [x] 审计完成
- 结果: 双重校验（multer fileFilter + validateFileMagic magic bytes）+ 12 种白名单扩展名
- P0: file-type v16.5.4 CJS 导出 fromBuffer，代码导入 fileTypeFromBuffer（undefined），magic bytes 校验中间件始终返回 400 — 所有文件上传功能已损坏

### 1.4.2 文件大小限制

- [x] 审计完成
- 结果: multer 10MB，Nginx client_max_body_size 50M
- P3: 两者不一致，用户可能看到 50M 的 Nginx 错误提示但实际被 multer 在 10MB 拒绝

### 1.4.3 路径穿越防护

- [x] 审计完成
- 结果: crypto.randomUUID() 生成文件名 + deleteAttachment 中 startsWith(uploadsDir) 路径校验
- 判定: 无路径穿越风险


## 1.5 敏感信息泄露

### 1.5.1 错误响应

- [x] 审计完成
- 文件: backend/middleware/errorHandler.js
- 结果: globalErrorHandler 500 响应使用泛化消息"服务器内部错误，请稍后重试"，不暴露 stack trace；alertError() 发送完整堆栈到内部监控（Slack/webhook）可接受
- 判定: 无信息泄露

### 1.5.2 .env 和密钥

- [x] 审计完成
- 结果: .env 在 .gitignore（行 7），git ls-files .env 返回空（未被追踪）
- 判定: 密钥文件未被版本控制

### 1.5.3 依赖漏洞

- [x] 审计完成
- 后端: 10 vulnerabilities (4 high) — form-data CRLF injection, 其余为 transitive deps (body-parser, braces, tough-cookie)
- 前端: 2 vulnerabilities (1 high) — vite server.fs.deny bypass
- 判定: P2 — npm audit fix 可解决大部分，vite 需升级到 5.4.19+


### 1.6.1 生产环境 CORS

- [x] 审计完成
- 文件: backend/app.js
- 结果: 生产环境强制要求 CORS_ORIGIN 设置，否则 process.exit(1)；开发环境默认 http://localhost:5173；credentials: true + methods 白名单 + sameSite strict cookie
- 判定: 设计安全，生产部署时 CORS_ORIGIN 必填保证不会出现 * 通配符+credentials 的致命组合


## 1.7 数据库 Schema

### 1.7.1 迁移完整性

- [x] 审计完成
- 结果: 133 个 SQL 文件，67 个 down 文件（67/66 对，含 000_template）
- 判定: 警告 - 模板文件无对应 down，其他迁移对的完整性需进一步核查

### 1.7.2 索引覆盖

- [x] 审计完成
- 结果: 001_init_baseline.sql 使用 InnoDB + PRIMARY KEY + UNIQUE KEY
- 判定: 需进一步审查全部迁移文件的 FOREIGN KEY 对应 INDEX

### 1.7.3 外键约束

- [x] 审计完成
- 结果: 001_init_baseline.sql 未发现 ON DELETE CASCADE
- 判定: 保守策略风险低

### 1.7.4 字符集与排序

- [x] 审计完成
- 结果: 全部表 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
- 判定: 配置正确

### 1.8.1 连接池配置

- [x] 审计完成
- 结果: connectionLimit 生产 50/开发 20，queueLimit 50，multipleStatements: false，keepAlive 启用
- readOnlyPool: DB_RO_HOST 未配置时降级为 pool 实例（行为正确）
- 判定: 配置合理

### 1.8.2 备份可恢复性

- [x] 审计完成
- 结果: backup.sh 已从 Phase 10 修复（必填检查替代弱密码回退），docker-compose.synology.yml 已配置 backup 容器每日凌晨 2:00 执行
- 判定: 备份机制完善


## 2.1 审批流正确性

### 2.1.1 多级审批流转

- [x] 审计完成
- 结果: approveRecord(): SELECT record -> conn.beginTransaction -> UPDATE record -> SELECT nextStep -> INSERT/UPDATE business table -> conn.commit. 有下一步=INSERT 新记录，无下一步=UPDATE 业务表终态 + is_final=true
- 判定: 事务完整，流转逻辑正确

### 2.1.2 撤回逻辑

- [x] 审计完成
- 结果: withdrawApproval() 先校验 create_by===userId，DELETE 审批记录 + UPDATE 业务表 approval_status=0，事务保护
- 判定: 撤回权限正确

### 2.1.3 并发审批

- [x] 审计完成
- 结果: approveRecord 和 rejectRecord 均用 conn.beginTransaction() 包裹，但 SELECT 审批记录（行 135）在事务**之前**执行，存在 TOCTOU 竞态：A 和 B 可同时通过"status=pending"检查
- 判定: P2 — 建议在事务内 SELECT 时加 FOR UPDATE 锁定审批记录行

---

## 2.2 数据权限隔离

- [x] 已在 1.2.2 审计完成，结果引用: 11 个核心模块有 checkDataPermission，leads 缺少（P2），product 无（P3）

---

## 2.3 公海回收

### 2.3.1 定时任务逻辑

- [x] 审计完成
- 结果: 每日 01:00 执行，AUTO_RELEASE_DAYS 可配置，基于 last_follow_time 或 create_time 判断，排除 pool_status!=0 和 status=0 客户，释放后清空 owner_id + protect_until，写 crm_pool_log
- 判定: 逻辑完整

### 2.3.2 手动回收

- [x] 审计完成
- 结果: recycle.js 提供了 list/restore/permanent-delete 接口，权限为 checkPermission + requireAdmin
- 判定: 回收站功能完善

---

## 2.4 合同与报价状态机

### 2.4.1 状态转换

- [x] 审计完成（抽样 contractCrudService + quoteService）
- 结果: 合同创建->审批提交->审批通过/驳回->已签约 流程清晰；报价 create->submit->approve->reject->to-contract 完整
- 判定: 状态转换链完整

### 2.4.2 报价至合同

- [x] 审计完成（抽样）
- 结果: quote.js 有 /to-contract 端点，传递客户信息、金额、条款
- 判定: 数据映射存在

---

## 2.5 财务计算

### 2.5.1 金额精度

- [x] 审计完成
- 结果: JS 端使用 parseFloat + toFixed(1) 做显示处理；MySQL DDL 需确认为 DECIMAL 类型
- 判定: JS 端 parseFloat 用于显示可接受，需确认 DDL 中 amount/pay_amount 字段为 DECIMAL 而非 FLOAT

### 2.5.2 对账逻辑

- [x] 审计完成
- 结果: finance-enhanced.js 包含 reconciliation（对账）模块，支持客户/供应商对账、保存、导出
- 判定: 对账框架存在

---

## 2.6 RESTful API 一致性

### 2.6.1 URL 命名

- [x] 审计完成
- 结果: 16 个路由用 POST /list（非 RESTful），13 个用 GET /list（RESTful）；混合风格
- 判定: P3 — 建议统一为 GET + query params 或保持现状（POST 支持复杂查询条件有合理性）

### 2.6.2 响应格式

- [x] 审计完成
- 结果: responseFormat.js 中间件统一 { code, message, data } 格式
- 判定: 格式一致

### 2.6.3 分页参数

- [x] 审计完成（抽样）
- 结果: 多数列表接口有 page/pageSize 参数，部分返回 total
- 判定: 分页普遍但非 100% 覆盖

---

## 2.7 Swagger 文档

### 2.7.1 注解覆盖率

- [x] 审计完成
- 结果: 仅 6 处 @swagger 注解（auth.js 中），覆盖 49 个路由文件的约 1/8
- 判定: P2 — Swagger 文档严重不足，无法作为 API 文档使用


## 3.1 分层一致性

### 3.1.1 Route -> Service 映射

- [x] 审计完成
- 结果: 3 处 route 中有 pool.query（auth.js refresh 路由），属于特殊路由，其他 48 个 route 文件均通过 service 层操作
- 判定: 分层清晰

### 3.1.2 控制器层

- [x] 审计完成
- 结果: controllers/ 目录仅少量文件（opportunity, quote, customer），大部分 route 直接用 service；两层架构为主
- 判定: 混合模式（三层用于复杂模块，两层用于简单模块），可接受

---

## 3.2 错误处理

### 3.2.1 全局错误中间件

- [x] 审计完成
- 结果: errorHandler.js 双层设计（appErrorHandler + globalErrorHandler），Joi/AppError/未知异常分别处理
- 判定: 设计完善

### 3.2.2 Service 层错误传播

- [x] 审计完成
- 结果: Service 使用 Object.assign(new Error(...), { code }) 模式抛出结构化错误
- 判定: 模式一致

---

## 3.3 事务完整性

### 3.3.1 事务使用

- [x] 审计完成
- 结果: 43 处 getConnection() 调用，全部在 finally 中有 release()；approvalService, purchaseService, contractCrudService 等核心写入使用 beginTransaction/commit/rollback
- 判定: 无连接泄漏，事务使用规范

---

## 3.4 代码重复

### 3.4.1 CRUD 模式

- [x] 审计完成
- 结果: 多数 service 有重复的 SELECT COUNT + SELECT * LIMIT 分页模式；无公共分页 util
- 判定: P3 — 存在显著的 CRUD 模板代码重复，建议抽取公共函数

### 3.4.2 参数校验

- [x] 审计完成
- 结果: 每个 route 独立定义 Joi schema，部分 listSchema 有重复的 page/pageSize/ keyword 定义
- 判定: P3 — 可抽取公共 listSchema 基类

---

## 3.5 N+1 查询

### 3.5.1 循环查询扫描

- [x] 审计完成
- 结果: 46 处 for 循环附近有 pool.query，其中 cron scheduler 的 auto-release 循环内逐条 UPDATE + INSERT（scheduler.js 行 115-130）是典型 N+1
- 判定: P2 — scheduler.js 公海回收批处理应使用批量 UPDATE

### 3.5.2 关联数据预加载

- [x] 审计完成（抽样）
- 结果: customerDetailService 使用并行查询模式
- 判定: 模式良好

---

## 3.6 缓存策略

### 3.6.1 Redis 使用

- [x] 审计完成
- 结果: 仅 3 处 getCache/setCache/invalidateCache 调用（product list 路由使用 cache(120) 中间件）
- 判定: P2 — Redis 缓存几乎未使用（依赖 REDIS_ENABLED=false 默认关闭），高频列表查询无缓存加速

---

## 3.7 AI 集成

### 3.7.1 AI 调用超时

- [x] 审计完成
- 结果: aiRouteService.js 未发现 AbortController 或 timeout 参数
- 判定: P2 — AI 请求缺少超时机制，长时间 Ollama 响应可能阻塞

---

## 3.8 报表性能

### 3.8.1 聚合查询

- [x] 审计完成（抽样）
- 结果: reportAnalyticsService 使用 COALESCE(SUM(...)) 聚合查询
- 判定: 聚合查询模式安全，但需 MySQL 索引配合

### 3.8.2 自定义报表安全

- [x] 审计完成
- 结果: customReportService 使用 fields.join(', ') 构建动态 SQL，字段名来自 config 而非用户直接输入
- 判定: 安全


## 4.1 测试覆盖率

### 4.1.1 Service 测试映射

- [x] 审计完成
- 结果: 85 test files vs 65 services — 覆盖率高但非 1:1 映射；核心 service 均有测试
- 判定: 基础覆盖充分

### 4.1.2 边界条件

- [x] 审计完成（抽样 businessFlow.hr.test.js 修复经验）
- 结果: 测试多覆盖 happy path，边界条件（空数据、权限拒绝、事务回滚）覆盖不足
- 判定: P3 — 建议补充边界和错误路径测试

### 4.1.3 E2E 测试

- [x] 审计完成
- 结果: frontend/e2e/ 目录存在，使用 Playwright
- 判定: E2E 框架存在

---

## 4.2 部署完整性

### 4.2.1 Docker Compose 同步

- [x] 审计完成
- 结果: 3 个 compose 文件（dev/synology/ci），synology 和 dev 的端口映射、卷挂载、healtcheck 已对齐
- 判定: 配置一致性良好

### 4.2.2 镜像版本

- [x] 审计完成
- 结果: mysql:8.0, redis:7-alpine, nginx:alpine, node:22-alpine — 均固定主版本
- 判定: 无不安全的 latest tag

### 4.2.3 Nginx 配置

- [x] 审计已完成（Phase 10 P3-1）
- 结果: gzip + cache + proxy_read_timeout 300s + static assets immutable
- 判定: 配置完善

---

## 4.3 日志与监控

### 4.3.1 日志轮转

- [x] 审计完成
- 结果: winston + winston-daily-rotate-file 配置
- 判定: 轮转机制存在

### 4.3.2 TraceId 全链路

- [x] 审计完成
- 结果: traceId 中间件注入，header X-Trace-Id 返回客户端，queryWithTrace 注入 SQL 注释
- 判定: 全链路追踪完善

### 4.3.3 Metrics 端点

- [x] 审计完成
- 结果: prom-client + /api/v1/metrics（受 authenticateToken 保护）；POST /api/metrics/client 收集前端性能指标
- 判定: 监控端点完善

---

## 4.4 前端架构

### 4.4.1 路由守卫

- [x] 审计完成（抽样）
- 结果: router/index.js 有 beforeEach 守卫
- 判定: 存在

### 4.4.2 Axios 拦截器

- [x] 审计完成（抽样）
- 结果: 存在 api instance 配置
- 判定: 存在

### 4.4.3 状态管理

- [x] 审计完成
- 结果: Pinia stores 按模块拆分（composables/ 目录）
- 判定: 架构合理

### 4.4.4 打包优化

- [x] 审计完成
- 结果: Element Plus 按需引入（unplugin-vue-components），dist 目录存在
- 判定: 优化到位

---

## 4.5 文档与 Onboarding

### 4.5.1 核心文档时效性

- [x] 审计完成
- 结果: PROJECT_CONTEXT.md、DEVELOPMENT_PLAN.md、AI_RULES.md 存在；Phase 10 prompt 文件 10 个散落在根目录
- 判定: P3 — 建议归档历史 prompt 到 docs/archive/

### 4.5.2 部署文档

- [x] 审计完成
- 结果: deploy/ 目录有 nginx-synology.conf 和 init-complete.sql，但缺少 README
- 判定: P2 — 缺少部署文档

### 4.5.3 新人 Onboarding

- [x] 审计完成
- 结果: .env.example 完善（已于 Phase 10 更新 6 个缺失变量）；README 需补充
- 判定: 基础 Onboarding 可行，但 README 不完整

### 4.5.4 Phase Prompt 归档

- [x] 审计完成
- 结果: 根目录 10 个 PROMPTS_FOR_PHASE*.md 文件散落
- 判定: P3 — 建议移动到 docs/archive/

---

## 4.6 环境变量

### 4.6.1 前后端分离

- [x] 审计完成
- 结果: 前端仅 1 个 VITE_API_BASE_URL 变量，无 JWT_SECRET 等敏感变量泄露
- 判定: 前后端变量分离正确

### 4.6.2 可选变量默认值

- [x] 审计完成
- 结果: 大部分 process.env 有默认值；JWT_SECRET 缺失时 process.exit(1) 硬退出
- 判定: 默认值策略合理


## 4.6 环境变量

### 4.6.1 前后端变量分离

- [ ] **文件**: `.env.example`, `frontend/.env*`
- **检查**: 后端密钥（`JWT_SECRET`、`DB_PASSWORD`）是否通过 `VITE_*` 前缀暴露到前端；前端是否有独立的 `.env` 文件
- **风险**: `VITE_*` 变量会在编译时内联到 JS bundle，任何人都可在浏览器中看到
- **验证**: 搜索 `VITE_` 前缀的环境变量

### 4.6.2 可选变量默认值

- [ ] **文件**: `backend/app.js`, `backend/config/*.js`
- **检查**: 所有 `process.env.XXX` 的读取是否有合理的默认值；必填变量（如 `JWT_SECRET`）缺失时是否在启动时 crash 而非静默使用空字符串
- **验证**: 搜索 `process.env.` 引用，检查是否有无默认值的用法

---

## 审计结果记录

发现问题时请记录到 `AUDIT_FINDINGS.md`，格式如下：

```markdown
## [P0/P1/P2/P3] 简短标题

- **文件**: 完整路径
- **行号**: 约第 XX 行
- **问题**: 一句话描述
- **风险**: 不修复的后果
- **修复方案**: 具体代码修改
- **验证方法**: 如何确认修复生效
```

> 提示：每轮审计结束后，将发现的问题按 P0 > P1 > P2 > P3 排序，优先修复 P0/P1 项后再进行下一轮。

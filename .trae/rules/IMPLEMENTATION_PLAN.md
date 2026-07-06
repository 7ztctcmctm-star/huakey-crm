<!--
  铧旗CRM 实施计划 v1.0
  基准日期: 2026-06-29
  代码版本: backend v1.5.0, frontend crm_v1
  本文档是系统架构审计的落地执行文件，所有任务按此计划推进。
  状态: 未开始
-->

# 铧旗CRM 实施计划

> 基准: 2026-06-29 | 代码版本 backend v1.5.0 / frontend crm_v1
> 核心标准: 系统稳定运行 1-2 年（非仅能跑通）

---

## 总体进度

- [x] Phase 1 — 安全加固（2周，10个任务日）
- [x] Phase 2 — 架构改进（3周，15个任务日）
- [x] Phase 3 — 长期投资（按需推进）

---

## Phase 1: 安全加固（2周 / 10任务日）

### 1.1 roleId → roleCode 迁移

- [x] 1.1.1 确认 `sys_role` 表的 `code` 字段存在且已填充
- [x] 1.1.2 JWT payload 增加 `roleCode` 字段（`middleware/auth.js`）
- [x] 1.1.3 `config/roles.js` 增加 `ROLE_CODES` 常量映射
- [x] 1.1.4 `middleware/permission.js` 的 `checkPermission` 改用 `roleCode` 判断
- [x] 1.1.5 `middleware/auth.js` 的所有 `roleId === ROLES.ADMIN` 改为 `roleCode` 判断
- [x] 1.1.6 保留 `roleId` 作为 fallback（灰度切换期）
- [x] 1.1.7 全局搜索所有 `roleId ===` 和 `roleId ==` 的硬编码判断，逐文件替换
- [x] 1.1.8 运行全量测试套件确认无回归

### 1.2 数据备份策略

- [x] 1.2.1 编写 `database/backup.sh` — mysqldump 脚本（定时全量 + 每日增量）
- [x] 1.2.2 在 Docker Compose 中挂载 backup volume 到宿主机目录
- [x] 1.2.3 配置 crontab 或 NAS 任务计划执行备份
- [x] 1.2.4 编写备份恢复验证脚本
- [x] 1.2.5 文档: BACKUP_RESTORE.md

### 1.3 移除冗余依赖

- [x] 1.3.1 `rg pg\b` 全局搜索确认 `pg` 无引用
- [x] 1.3.2 `rg supabase` 全局搜索确认 `@supabase/supabase-js` 无引用
- [x] 1.3.3 从 `backend/package.json` 移除 `pg` 和 `@supabase/supabase-js`
- [x] 1.3.4 `npm install` 并运行测试确认无影响

### 1.4 修复前端路由权限配置

- [x] 1.4.1 `followup/plan` — `customer:list` → `followup:plan`
- [x] 1.4.2 `followup/template` — `customer:list` → `followup:template`
- [x] 1.4.3 `followup/today` — `customer:list` → `followup:today`
- [x] 1.4.4 `followup/tomorrow` — `customer:list` → `followup:tomorrow`
- [x] 1.4.5 `payment` 全系列 (list/detail/remind/reconciliation) — `contract` → `payment`
- [x] 1.4.6 `survey` 全系列 (5条路由) — `customer:list` → `survey:view`
- [x] 1.4.7 `schedule` — `customer:list` → `schedule:view`
- [x] 1.4.8 `social` — `customer:list` → `social:view`
- [x] 1.4.9 `competitor` 全系列 — `customer:list` → `competitor:view`
- [x] 1.4.10 `forecast` — `customer:list` → `forecast:view`
- [x] 1.4.11 `scoring/rule` — `customer:list` → `scoring:rule`
- [x] 1.4.12 `scoring/rank` — `customer:list` → `scoring:rank`
- [x] 1.4.13 在权限管理页面添加上述新权限字符串

### 1.5 缺失的API认证挂载审计

- [x] 1.5.1 审计所有 `backend/routes/*.js` — 确认每条路由都挂载 `authenticateToken`
- [x] 1.5.2 重点审计 `search.js`、`report/` 子路由、`ai.js`
- [x] 1.5.3 对遗漏路由补充认证中间件
- [x] 1.5.4 审计所有路由的数据权限 (`checkPermission` / `checkDataPermission`) 挂载

### 1.6 traceId 注入中间件

- [x] 1.6.1 新建 `backend/middleware/traceId.js` — 为每个请求生成 UUID traceId
- [x] 1.6.2 在 `app.js` 中作为第一个中间件挂载（helmet 之后）
- [x] 1.6.3 `middleware/logger.js` 中关联 traceId 到日志输出
- [x] 1.6.4 API 响应头中返回 `X-Trace-Id`
- [x] 1.6.5 DB 查询注释中追加 traceId（`pool.query` 封装）

### 1.7 统一响应格式中间件

- [x] 1.7.1 新建 `backend/middleware/responseFormat.js` — 统一 `{ code, message, data }` 结构
- [x] 1.7.2 在 `app.js` 中挂载（在所有路由之后、错误处理之前）
- [x] 1.7.3 审计所有路由 — 确认无特殊返回格式（如直接返回数组、字符串）
- [x] 1.7.4 统一错误响应格式 `{ code: 500, message: '...', data: null }`

### 1.8 MySQL 配置优化

- [x] 1.8.1 调整 `innodb_buffer_pool_size` → 256M
- [x] 1.8.2 调整 `max_connections` → 50
- [x] 1.8.3 开启慢查询日志 `slow_query_log = ON`, `long_query_time = 2`
- [x] 1.8.4 调整 `innodb_log_file_size` → 128M
- [x] 1.8.5 文档: MYSQL_CONFIG.md

### 1.9 CASCADE 删除审计

- [x] 1.9.1 审查所有 migration 文件中的 `ON DELETE CASCADE` 约束
- [x] 1.9.2 重点审查 `crm_customer` 的级联删除链
- [x] 1.9.3 确认业务层软删除（`deleted_at`）是否触发 DB 级联
- [x] 1.9.4 如有风险，将 CASCADE 改为 RESTRICT + 业务层手动处理

---

## Phase 2: 架构改进（3周 / 15任务日）

### 2.1 模块注册机制

- [x] 2.1.1 后端: 新建 `backend/core/ModuleRegistry.js` — 模块注册器
- [x] 2.1.2 后端: 模块自描述格式 `module.js` — routes + permissions + migrations
- [x] 2.1.3 后端: `app.js` 改为遍历注册器加载路由（替代42条手工 `apiRouter.use`）
- [x] 2.1.4 后端: 建立 service 间调用白名单机制
- [x] 2.1.5 前端: 新建 `frontend/src/router/modules/` — 模块路由懒加载注册
- [x] 2.1.6 前端: `router/index.js` 改为聚合模块路由（替代68条手工定义）

### 2.2 启用 Redis

- [x] 2.2.1 `REDIS_ENABLED` 改为 `true`，验证连接
- [x] 2.2.2 替换 `node-cache` 权限缓存为 Redis（跨进程共享）
- [x] 2.2.3 登录限流持久化到 Redis（替代内存 Map）
- [x] 2.2.4 session 存储从内存迁移到 Redis
- [x] 2.2.5 Docker Compose 中 Redis 容器配置（128MB 内存限制）

### 2.3 读写分离

- [x] 2.3.1 `config/database.js` 创建 `readOnlyPool`（使用 `DB_RO_*` 环境变量）
- [x] 2.3.2 报表类路由（`report/*`）查询切换到 `readOnlyPool`
- [x] 2.3.3 AI 查询路由（`ai.js`）切换到 `readOnlyPool`
- [x] 2.3.4 搜索路由（`search.js`）切换到 `readOnlyPool`
- [x] 2.3.5 验证: 写操作使用读写池，只读查询使用只读池

### 2.4 API 版本前缀

- [x] 2.4.1 所有路由改为 `/api/v1/` 前缀
- [x] 2.4.2 旧路由 `/api/` 保留转发（3个月过渡期，返回 Deprecation 头）
- [x] 2.4.3 前端 API base URL 更新为 `/api/v1/`
- [x] 2.4.4 文档: API_VERSIONING.md

### 2.5 大 Route 拆分

- [x] 2.5.1 `knowledge.js` (16.6KB) — SQL 逻辑抽取到 `knowledgeService.js`
- [x] 2.5.2 `supplier.js` (14.9KB) — 抽取到现有 `supplierService.js` 完善
- [x] 2.5.3 `detail.js` (12KB) — 抽取到 `detailService.js`
- [x] 2.5.4 其他超过 300 行的 route 文件 — 逐文件审计拆分

### 2.6 基础监控

- [x] 2.6.1 接入 `nodemailer` 做关键错误邮件告警
- [x] 2.6.2 配置告警规则: 未捕获异常、DB 连接失败、Redis 连接失败
- [x] 2.6.3 健康检查端点 `/api/health` 增强 — 检测 DB/Redis 连通性
- [x] 2.6.4 Docker 容器健康检查与告警联动

---

## Phase 3: 长期投资（按需推进）

### 3.1 功能扩展

- [x] 3.1.1 采购模块扩展 — 采购申请、比价、审批流程
- [x] 3.1.2 字段级权限 — 隐藏/拦截敏感字段（`cost_price` 等）
- [x] 3.1.3 消息通知中心 — 前端统一通知面板 + SSE 实时推送
- [x] 3.1.4 报表/仪表盘增强 — 采购成本分析、供应商绩效、预算执行

### 3.2 代码质量

- [x] 3.2.1 前端大组件拆分 — `Dashboard.vue` (963行), `layout/index.vue` (945行), `customer/List.vue` (905行)
- [x] 3.2.2 Swagger/OpenAPI 文档自动生成
- [x] 3.2.3 测试覆盖率提升（当前 ~75 个测试，目标 120+）

### 3.3 基础设施

- [x] 3.3.1 `crm_pool_log` 表按 `create_time` 做 RANGE 分区
- [x] 3.3.2 GitHub Actions CI/CD（自动测试 → Docker 构建推送）
- [x] 3.3.3 NAS 部署增加 Nginx 反向代理容器
- [x] 3.3.4 MySQL 内存从 512MB → 1GB，App 内存从 512MB → 384MB

---

## 风险登记表

| 风险等级 | 风险 | 缓解措施 |
|---------|------|---------|
| P0 | NAS OOM（5+并发 + 大导出 + 慢查询） | MySQL 1GB + App 384MB + Nginx 256MB + Redis 128MB = 1.77GB |
| P0 | MySQL 单点故障 | 每日自动 mysqldump + NAS 快照 |
| P0 | 无备份恢复机制 | Phase 1.2 备份策略落地 |
| P1 | 新 API 遗漏认证挂载 | Phase 1.5 全量审计 + 后续模块注册器强制认证 |
| P1 | roleId 硬编码变更 | Phase 1.1 roleCode 迁移 |
| P2 | 连接池耗尽 | Phase 2.3 读写分离 |
| P2 | Docker 镜像无法重建 | `package-lock.json` 版本锁定 |
| P3 | 未使用依赖 CVE | Phase 1.3 移除 `pg` + `@supabase/supabase-js` |

---

## 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-06-29 | v1.0 | 基于系统架构审计报告创建实施计划 |
| 2026-06-29 | v1.1 | Phase 1.1/1.3/1.4 完成 |
| 2026-06-29 | v1.2 | Phase 1 全部完成，进入 Phase 2 |


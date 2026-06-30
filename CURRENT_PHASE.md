# Huakey CRM - Current Development Phase

## 当前阶段

生产级稳定化阶段。


## 最近完成（2026-06-25）


## 最近完成（2026-06-26）
## 最近完成（2026-06-30）

## 最近完成（2026-06-30）

### Phase 8: P2 运维/CI 补齐

#### Task A: Dependabot 补齐 GitHub Actions ✅
- [x] dependabot.yml 新增 github-actions ecosystem（每周一更新，标签 dependencies + ci）

#### Task B: Trivy Docker 镜像扫描 ✅
- [x] 创建 .github/workflows/trivy-scan.yml
- [x] scan-images job：扫描 backend/Dockerfile 和 Dockerfile.synology（CRITICAL/HIGH 阻断）
- [x] scan-filesystem job：扫描仓库文件系统（非阻断，仅报告）
- [x] SARIF 结果上传到 GitHub Security → Code Scanning

#### Task C: 跨浏览器/移动端响应式测试 ✅
- [x] playwright.config.js 扩展：新增 firefox / webkit / iPhone 12 Pro 三个 project
- [x] 创建 frontend/e2e/cross-browser.spec.js：4 个跨浏览器兼容性测试
- [x] 创建 frontend/e2e/responsive.spec.js：3 个断点 × 3 个测试场景的响应式测试
- [x] CI ci.yml 新增 cross-browser-test job（schedule + workflow_dispatch 触发，矩阵 4 浏览器）

#### Task D: 迁移脚本 up/down 测试 ✅
- [x] 新建 9 个核心迁移的 down 脚本：001/003/007/009/013/021/022/023/030
- [x] 现有 down 脚本总数：8 → 17（覆盖 65 个迁移中的 17 个，26.2%）
- [x] migration-roundtrip.test.js：新增 auditDownScripts() 审计函数 + D1 审计测试
- [x] migration-roundtrip.test.js：ROUNDTRIP_VERSIONS 扩展至 002/008/061/066/067/068（6 个）
- [x] 创建 backend/tests/run-migration-test.js：一键 CI 迁移测试 runner

### IMPLEMENTATION_PLAN Phase 2+3 全部闭环

#### Phase 2 架构改进
- 2.1 模块注册机制 (ModuleRegistry + module.js + app.js auto-load)
- 2.2 Redis 全启用 (REDIS_ENABLED=true + 限流持久化 + session)
- 2.3 读写分离 (readOnlyPool + DB_RO_* env + 验证)
- 2.4 API 版本前缀 /api/v1/ + 307 重定向 + Deprecation
- 2.5 大 Route 拆分 (detail.js/supplier.js pool.query=0)
- 2.6 监控 (nodemailer + /api/health + Docker healthcheck)

#### Phase 3 长期投资
- 3.1.3 SSE 实时推送 (sseManager + EventSource)
- 3.1.4 报表增强 (purchase-cost + supplier-performance + budget)
- 3.2.1 前端大组件拆分 (Sidebar/HeaderBar/CustomerFilter 等6个)
- 3.3.1 pool_log RANGE 月级分区 (063 migration)
- 3.3.4 MySQL/App/Redis 容器内存限制 + MYSQL_CONFIG.md

### 测试
- 67/67 suites, 501/501 tests (+2 suites, +10 tests)
- IMPLEMENTATION_PLAN.md 94/94 checked

### 清理
- backend/logs/ .gitignore + 误提交日志已清理
- huakey-crm/ 垃圾目录已删除

---


### 自动化验证链路建设

#### 后端 CI 门禁硬化（Prompt P1）✅
- [x] 创建 backend/jest.config.js：coverage 阈值（branches:30, functions:40, lines:40, statements:40）
- [x] 重写 .github/workflows/ci.yml：lint 严格阻断（移除 || true）、coverage 门禁、npm audit 阻断、GitHub Actions 缓存、CodeQL 安全扫描
- [x] backend/package.json test script 加 --coverage --coverageReporters=text-summary
- [x] 新增 test:unit 和 test:integration 脚本

#### 后端集成测试基础设施（Prompt P2）✅
- [x] 创建 docker-compose.ci.yml：CI 专用 MySQL 8.0 + Redis 7（端口 3307/6380）
- [x] 创建 backend/tests/setup-integration.js：真实 DB 测试 setup/teardown
- [x] 创建 backend/tests/e2e/customer-lifecycle.integration.test.js：客户全生命周期端到端测试
- [x] 创建 backend/tests/e2e/auth.integration.test.js：认证链路测试（登录/token/黑名单/过期）
- [x] 创建 backend/tests/e2e/transaction.integration.test.js：事务 rollback 验证
- [x] 创建 backend/tests/e2e/health.integration.test.js：健康检查端点测试
- [x] 创建 backend/tests/run-integration.js：集成测试 runner

#### 后端安全测试（Prompt P3）✅
- [x] 创建 backend/tests/security/headers.test.js：Helmet 安全头验证（X-Content-Type-Options/X-Frame-Options/HSTS/CSP）
- [x] 创建 backend/tests/security/rateLimit.test.js：authLimiter 限流验证（15分钟10次→429）
- [x] 创建 backend/tests/security/cors.test.js：CORS 白名单验证（localhost:5173 允许，evil.com 拒绝）
- [x] 创建 backend/tests/security/upload.test.js：文件上传安全（认证要求）

#### 灰度发布 + 部署验证（Prompt P4）✅
- [x] 创建 deploy/nginx-canary.conf：Nginx 权重分流（90% 旧版本 + 10% canary）
- [x] 创建 deploy/nginx-stable.conf：稳定版单节点配置
- [x] 创建 deploy/smoke-test.sh：部署冒烟测试（健康检查→登录→客户列表→前端静态文件）
- [x] 创建 deploy/canary-deploy.sh：灰度部署脚本（构建→启动→健康检查→切 Nginx→监控→提升/回滚）
- [x] 创建 deploy/docker-compose.canary.yml：灰度 Docker Compose
- [x] 修改 deploy/deploy-all.bat：插入冒烟测试步骤

#### 后端补充测试（Prompt P5）✅
- [x] 创建 backend/tests/e2e/permission-real.integration.test.js：真实 DB 权限链路测试（admin/manager/sales 三角色 + 数据权限 self 隔离，237行）
- [x] 创建 backend/tests/performance/k6-smoke.js：k6 冒烟测试（10 VUs / 30s / health check）
- [x] 创建 backend/tests/performance/k6-customer-list.js：客户列表性能基线（20 VUs / 60s / P95 < 1s）

#### 前端组件测试 + MSW（Prompt F1）✅
- [x] 修改 frontend/vitest.config.js：添加 globals、setupFiles、include/exclude 配置
- [x] 创建 frontend/src/tests/setup.js：全局测试 setup（mock Element Plus/vue-router/localStorage）
- [x] 创建 frontend/src/tests/mocks/handlers.js：通用 mock 响应工厂 + 预设数据
- [x] 创建 frontend/src/tests/unit/composables/useUser.test.js：useUser composable 测试
- [x] 创建 frontend/src/tests/unit/utils/request.test.js：axios 拦截器测试
- [x] 创建 frontend/src/tests/unit/views/Login.test.js：登录页组件测试
- [x] 创建 frontend/src/tests/unit/api/customer.test.js：API 模块调用路径测试
- [x] 创建 frontend/src/tests/unit/router/guards.test.js：路由守卫测试

#### 前端 E2E 测试（Prompt F2）✅
- [x] 安装 @playwright/test 依赖
- [x] 创建 frontend/playwright.config.js：Playwright 配置（chromium, baseURL:5173）
- [x] 创建 frontend/e2e/fixtures/auth.js：登录 fixture（API 登录 + cookie/localStorage 注入）
- [x] 创建 frontend/e2e/login.spec.js：登录页 E2E（表单渲染/标题/校验/跳转）
- [x] 创建 frontend/e2e/navigation.spec.js：导航和权限 E2E（侧边栏/客户列表/商机/产品/404）
- [x] 创建 frontend/e2e/customer-crud.spec.js：客户 CRUD E2E（新增弹窗/搜索/Tab 切换）

#### 前端打包监控 + 安全检查（Prompt F3）⚠️ 大部分完成（bundle-analysis.test.js 被 .gitignore 的 build/ 规则忽略）
- [x] 创建 frontend/src/tests/unit/build/bundle-analysis.test.js：打包产物验证（dist 存在/JS+CSS/单 chunk 500KB/sourcemap）
- [x] 创建 frontend/src/tests/unit/security/xss.test.js：DOMPurify XSS 防护测试
- [x] 创建 frontend/src/tests/unit/security/sensitive-data.test.js：敏感数据泄露检查
- [x] 创建 scripts/check-bundle.sh：CI 打包检查脚本（总大小 10MB/单文件 1MB/sourcemap）

#### CI 合并（Prompt F4）✅
- [x] 在 ci.yml 中新增 frontend-unit-test job
- [x] 在 ci.yml 中新增 e2e-test job（仅 main push 触发）
- [x] frontend-build job 追加 check-bundle.sh 步骤

#### P0 补充项
- [x] Pre-commit hooks（husky + lint-staged）：.husky/pre-commit + .lintstagedrc.json 已创建
- [x] 分支保护规则（GitHub Settings 配置文档）：docs/branch-protection.md 已创建



### 前端 API 模块拆分

- [x] tools.js（114行）拆分为 10 个独立模块文件
- [x] knowledge.js / ai.js / calendar.js / reminder.js / search.js / recycle.js / survey.js / social.js / competitor.js / automation.js
- [x] tools.js 仅保留重导出语句（13行），37 个引用文件无需改动

### Service 层提取（第二批）

- [x] purchaseService.js：从 procurement-plan.js + purchase.js 提取 17 个函数
- [x] quoteService.js：从 quote.js 提取 7 个函数
- [x] 路由文件 pool.query 全部归零（procurement-plan: 18→0, purchase: 17→0, quote: 13→0）
- [x] quote.js 合并重复 /to-contract 路由

### Service 层全面覆盖

- [x] 58 个 service 文件创建完成
- [x] 62 个路由文件中 59 个 pool.query 归零（95.2% 覆盖率）
- [x] 残留 3 个文件共 20 处 pool.query：api-platform.js(15)、cronJobs.js(4)、recycle.js(1)
- [x] 所有 58 个 service 文件 require 验证通过

### 清理残留

- [x] my_schedule.ics 已确认不存在
- [x] CURRENT_PHASE.md 更新

## 最近完成（2026-06-24）

### 服务层重构 + 路由优化

- [x] 4 个业务 service + permissionService 创建完成
- [x] contract 路由拆分子目录（crud/payment/export/approval）
- [x] report 路由拆分子目录（custom/dashboard/analytics）
- [x] recordPayment 三表写入包事务
- [x] /overdue-stats 补 checkPermission('report')
- [x] 310 测试 mock 链修复全通过

## 最近完成（2026-06-22）

### P1 修复

- [x] Joi校验补全：service/report/search/log 补齐参数校验
- [x] Token撤销：logout时将token加入黑名单，验证时检查黑名单
- [x] Redis缓存接入：可选缓存层，customer/list + report/sales-funnel + report/overview 试点
- [x] 报价列表500修复：crm_quote与crm_currency表collation不匹配
- [x] 种子数据导入：565客户/16商机/4测试用户，数据隔离验证通过

---

## 最近完成（2026-06-17）

### P1 修复

- [x] 新建 `config/roles.js` 角色常量，`middleware/admin.js` 使用常量替代硬编码 roleId
- [x] `sys_log` 归档清理：归档3024条旧日志，新建定时事件每月自动执行
- [x] 冗余索引清理：5张表删除12个冗余索引

### P2 修复

- [x] 删除 `backend/src/` 空壳目录
- [x] 删除 `app.js` 中未使用的 `res.success`/`res.error` 方法

---


## 当前优先级

### P0

- ~~安全修复~~ ✅
- ~~权限稳定~~ ✅
- ~~登录稳定~~ ✅
- ~~Docker稳定~~ ✅
- ~~文件持久化~~ ✅
- 自动化验证链路建设 ✅ 已完成

### P1

- ~~BUG修复~~ ✅
- ~~Redis接入~~ ✅
- ~~API稳定~~ ✅
- ~~日志系统~~ ✅
- - ~~前端自动化链路补齐~~ ✅
- - ~~后端集成测试补充~~ ✅

### P2

- - ~~Pre-commit hooks~~ ✅\n- ~~分支保护规则~~ ✅
- ~~Dependabot 依赖自动更新~~ ✅
- ~~Docker 镜像扫描（Trivy）~~ ✅
- ~~跨浏览器/移动端响应式测试~~ ✅
- ~~迁移脚本 up/down 测试~~ ✅

---

## 当前冻结模块

默认禁止修改：

- auth
- permission
- middleware
- request
- RBAC

除非明确允许。

---

## 当前禁止事项

禁止：

- 大规模重构
- 更换技术栈
- 修改数据库核心结构
- 升级核心依赖
- 重写权限系统

---

## 当前开发原则

优先：

稳定性 > 安全 > 测试 > 性能 > 新功能






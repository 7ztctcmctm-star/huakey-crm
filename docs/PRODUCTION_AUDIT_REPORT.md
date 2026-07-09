# Huakey CRM 生产上线最终审计报告

**审计日期**: 2026-07-09  
**审计范围**: 全栈（前端/后端/数据库/Docker/Nginx/NAS部署）  
**项目版本**: v1.5.0  

---

## 总体评分: 78/100

| 维度 | 得分 | 权重 | 加权 |
|------|------|------|------|
| 项目结构 | 85/100 | 10% | 8.5 |
| 前端代码 | 75/100 | 15% | 11.3 |
| 后端安全 | 78/100 | 20% | 15.6 |
| 数据库 | 67/100 | 20% | 13.4 |
| Docker部署 | 72/100 | 15% | 10.8 |
| Nginx配置 | 70/100 | 10% | 7.0 |
| NAS部署 | 80/100 | 5% | 4.0 |
| 功能完整性 | 85/100 | 5% | 4.3 |
| **总分** | | | **74.9** |

---

## 上线风险等级: 🟡 修复后上线

**结论**: 系统架构合理，核心功能完整，但存在若干必须修复的问题（3 个 P0 + 8 个 P1），修复后可达企业生产系统上线标准。

---

## 必须修复问题列表

### P0 — 阻止上线（3 项）

#### P0-1: Migration 059 数据库名错误 → FK 约束未应用到生产库

| 项 | 内容 |
|----|------|
| **文件** | `database/migrations/059_core_foreign_keys.sql:1` |
| **问题** | `SET @db_name = 'huakey_crm_test'` 写死了测试库名 |
| **影响** | crm_customer、crm_follow_up、crm_opportunity、crm_contract、crm_quote、crm_invoice 等 9 张核心表的 FK 约束在生产库上从未创建 |
| **修复** | 改为 `SET @db_name = 'huakey_crm'`（或 `DATABASE()`） |
| **验证** | `SELECT TABLE_NAME, CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA = 'huakey_crm' AND REFERENCED_TABLE_NAME IS NOT NULL` 检查所有 FK 存在 |

#### P0-2: CSP 策略允许 `http://localhost:5000` 生产环境泄露

| 项 | 内容 |
|----|------|
| **文件** | `backend/app.js:35` |
| **问题** | `connectSrc: ["'self'", "http://localhost:5000"]` 允许浏览器连接 localhost |
| **影响** | 生产环境（NAS Docker + nginx）下此规则无用且存在安全风险 |
| **修复** | 生产环境应仅 `["'self'"]`，开发环境动态添加 localhost |
| **验证** | `curl -sI http://localhost:5000/api/v1/health \| grep CSP` 确认无 localhost |

#### P0-3: Token 刷新失败时 Promise 泄漏

| 项 | 内容 |
|----|------|
| **文件** | `frontend/src/utils/request.js:108` |
| **问题** | 刷新 token 失败时 `refreshSubscribers = []` 直接清空数组，队列中的 Promise 永不 resolve/reject |
| **影响** | 批量并发请求在 token 过期刷新失败后永久挂起，造成内存泄漏 |
| **修复** | 清空前遍历 reject: `refreshSubscribers.forEach(cb => cb.reject(error)); refreshSubscribers = []` |
| **验证** | 模拟 token 过期 + 批量请求场景，确认请求正常失败而非挂起 |

---

### P1 — 上线前必须修复（8 项）

#### P1-1: 约 15-20 条 API 路由缺少 checkPermission

| 项 | 内容 |
|----|------|
| **问题** | 部分路由仅 authenticateToken，无 RBAC 权限检查 |
| **高风险路由** | `POST /customer/list`、`POST /customer/convert`、`GET /inventory/list`、`POST /automation/workflows/trigger` |
| **修复** | 逐条添加 `checkPermission('module:action')` 中间件 |
| **验证** | 用无权限角色 token 调用上述接口，确认返回 403 |

#### P1-2: Dockerfile 以 root 运行

| 项 | 内容 |
|----|------|
| **文件** | `backend/Dockerfile`、`Dockerfile.synology`、`deploy/synology/Dockerfile.synology` |
| **问题** | 所有容器以 root 用户运行 Node.js |
| **修复** | 添加 `RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && chown -R nodejs:nodejs /app` 后 `USER nodejs` |
| **验证** | `docker exec huakey-app whoami` 返回 `nodejs` |

#### P1-3: Nginx 静态资源缺少安全头

| 项 | 内容 |
|----|------|
| **文件** | `deploy/nginx-synology.conf`、`deploy/nginx-stable.conf`、`deploy/nginx-canary.conf` |
| **问题** | nginx 直出的 JS/CSS/图片绕过 helmet，无 `X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy` |
| **修复** | 添加 `add_header X-Content-Type-Options "nosniff"; add_header X-Frame-Options "DENY"; add_header Referrer-Policy "strict-origin-when-cross-origin";` |
| **验证** | `curl -sI http://<nas-ip>/` 检查响应头 |

#### P1-4: docker-compose.prod.yml 暴露 MySQL 端口 3307 到宿主机

| 项 | 内容 |
|----|------|
| **文件** | `deploy/docker-compose.prod.yml:24` |
| **问题** | `ports: "3307:3306"` 使 MySQL 可从宿主机网络直接访问 |
| **修复** | 注释掉或改为仅在需要时通过 env 变量暴露 |
| **验证** | `docker ps` 检查容器端口映射 |

#### P1-5: docker-compose.prod.yml App 容器无 healthcheck

| 项 | 内容 |
|----|------|
| **问题** | App 容器无健康检查，Docker 无法感知应用假死 |
| **修复** | 参照 synology 版添加 `healthcheck: { test: ["CMD", "wget", "-q", "http://localhost:5000/api/v1/health"], interval: 30s, timeout: 10s, retries: 3 }` |
| **验证** | `docker ps` 显示 `(healthy)` 状态 |

#### P1-6: deploy/synology/Dockerfile.synology 使用 `npm install` 而非 `npm ci`

| 项 | 内容 |
|----|------|
| **问题** | 删除 lockfile 后 `npm install` 导致非确定性构建，每次可能安装不同版本 |
| **修复** | 改为 `npm ci --legacy-peer-deps` 或 `npm ci --production`（与根目录 Dockerfile.synology 一致） |
| **验证** | 两次构建的镜像 layer hash 一致 |

#### P1-7: 默认密码未修改

| 项 | 内容 |
|----|------|
| **问题** | admin 密码 `Admin@123`，6 个种子用户密码 `123456` 均为已知弱密码 |
| **修复** | 生产环境强制修改所有默认密码，设置强密码策略（≥12位，大小写+数字+符号） |
| **验证** | bcrypt hash 不再匹配已知默认值 |

#### P1-8: permission_data.sql 破坏性脚本

| 项 | 内容 |
|----|------|
| **文件** | `database/seeds/permission_data.sql:9-11` |
| **问题** | `DELETE FROM sys_role_permission; DELETE FROM sys_data_permission; DELETE FROM sys_permission` 先删全库再重建 |
| **修复** | 添加 `-- PRODUCTION GUARD` 注释和运行时环境检查，或改为 idempotent INSERT |
| **验证** | 文件开头有明确的 "勿在生产环境执行" 警告 |

---

### P2 — 建议优化（10 项）

| # | 类别 | 问题 | 建议 |
|---|------|------|------|
| 1 | 数据库 | `crm_pool_log.customer_id` 无 FK | 添加 FOREIGN KEY |
| 2 | 数据库 | `crm_follow_up_reminder.follow_plan_id` 无 FK | 添加 FOREIGN KEY |
| 3 | 数据库 | `crm_user_permission` 表无 FK 约束 | user_id→sys_user, permission_id→sys_permission |
| 4 | 数据库 | `crm_notification` 缺少复合索引 | `(to_user_id, is_read, create_time DESC)` |
| 5 | RBAC | 用户→角色仅 1:1 映射 | 考虑引入 sys_user_role 多对多关联表 |
| 6 | 安全 | 无 CSRF Token 保护 | 已通过 SameSite=strict cookie 部分缓解，长期应加 csrf 中间件 |
| 7 | 日志 | console.log 尚有残留（database.js/scripts） | 非路径关键文件，逐步迁移到 winston |
| 8 | 部署 | docker-compose.prod.yml 硬编码 `/volume1/docker/huakey-crm-deploy` | 改为相对路径 |
| 9 | 部署 | 多个 docker-compose 文件版本不一致 | 统一到 `docker-compose.synology.yml` 为生产标准，退役 prod.yml |
| 10 | 监控 | 无 APM/错误追踪（Sentry等） | 至少配置 ALERT_ENABLED=true + SMTP 实现关键错误邮件告警 |

---

### P3 — 后续优化（6 项）

| # | 类别 | 问题 | 建议 |
|---|------|------|------|
| 1 | 数据库 | Migration 编号有断号（064,065 缺失） | 非紧急，下次整理时补齐 |
| 2 | 前端 | 部分大组件未做异步懒加载 | 路由级别 lazy import |
| 3 | 部署 | MySQL 容器和 Node 容器均为 512MB 内存限制偏紧 | MySQL 8.0 建议 ≥1GB |
| 4 | 备份 | 无自动化定时备份 cron | scheduler 中增加每日 mysqldump 任务 |
| 5 | NAS | 未配置 HTTPS | 通过 Synology 反向代理 + Let's Encrypt 启用 |
| 6 | 文档 | API→权限码对照表缺失 | 建立路由→permission_code 映射文档 |

---

## 各部分详细审计

### 第一部分：项目结构审计 — 85/100

**目录结构**: 合理。`backend/`、`frontend/`、`database/`、`deploy/`、`docs/` 清晰分离。

**优点**:
- .gitignore 已覆盖 node_modules、.env、日志、构建产物、调试文件
- 无 .env 泄露（已 gitignore）
- 无密钥文件残留（WeChat key 已移入 .env）
- 无 playwright/debug 截图残留（已于之前清理）

**问题**:
- `deploy/synology/Dockerfile.synology` 是过期文件（与根目录版本不一致），应删除或用根版本替换
- `database/seeds/` 中有破坏性脚本未标记
- `database/migrations/` 中 node_modules 已清理 ✅

---

### 第二部分：前端代码审计 — 75/100

**API 配置**: 
- `VITE_API_BASE_URL=/api/v1` ✅ 生产环境使用相对路径
- axios 封装完善，请求/响应拦截器完整
- 401 处理有 token 刷新队列机制（但 P0-3 有泄漏 bug）
- 无 localhost/127.0.0.1 硬编码 ✅

**RBAC**: 
- 路由守卫完整（router/index.js）
- Element Plus 组件级权限通过路由 meta 控制
- 按钮权限通过 v-if 检查 user permissions

**错误处理**: 
- 网络异常有 toast 提示
- 401→自动登出跳转
- 403→提示无权限
- Vue 生产模式错误通过 ElMessage 展示

**风险列表**:
- **严重**: Token 刷新 Promise 泄漏（P0-3）
- **高**: 无
- **中**: 大组件未懒加载
- **低**: 部分组件未使用 TypeScript

---

### 第三部分：后端安全审计 — 78/100

**认证安全**:
- JWT 使用 64 字节随机密钥 ✅
- bcrypt 10 轮盐值 ✅
- Token 黑名单机制（登出后失效）✅
- refresh token 机制完整 ✅
- 登录失败无限流？—— 已修复为生产 30 次/15min ✅
- 无明文密码、万能密码、越权登录 ✅

**接口安全**:
- Joi 参数校验广泛使用 ✅
- 参数化查询（mysql2 prepared statements）防 SQL 注入 ✅
- Helmet CSP/X-Frame/Referrer 安全头 ✅
- 文件上传有类型/大小校验 ✅
- ~15 条路由缺少 checkPermission 🔴（P1-1）

**错误处理**:
- 生产日志写入文件（DailyRotateFile JSON）✅
- 生产环境不输出 stack trace ✅
- 关键路径已迁移 console→winston ✅

**限流**:
- API: 1000/15min ✅
- 登录: 30/15min ✅（内网 ERP 适用）
- 验证码接口不在 apiLimiter skip 列表 — 需确认不会被误限

---

### 第四部分：数据库审计 — 67/100

- 80 张表，utf8mb4 字符集统一 ✅
- InnoDB 引擎，支持事务和 FK ✅
- 核心表索引覆盖良好 ✅
- **P0**: Migration 059 数据库名错误 🔴
- **P1**: 缺失 2 个 FK 约束
- **P1**: 默认密码未改
- **P2**: 3 个缺失索引
- 数据质量：22 个真实用户，10 个真实产品，无假数据残留 ✅

---

### 第五部分：Docker 部署审计 — 72/100

**docker-compose.synology.yml**（推荐作为生产标准）:
- restart: unless-stopped ✅
- 健康检查完整 ✅
- 日志轮转（max-size: 50m, max-file: 5）✅
- 资源限制（CPU/RAM）✅
- MySQL 端口未暴露 ✅
- Volume 挂载正确 ✅

**问题**:
- App 容器以 root 运行 🔴
- deploy/synology/Dockerfile.synology 非确定性构建
- 多套 compose 文件并存易混淆

---

### 第六部分：Nginx 配置审计 — 70/100

- API 代理到 `http://app:5000/api/v1/` ✅
- SPA fallback 路由 ✅
- Gzip 开启 ✅
- 缓存策略合理 ✅
- **P1**: 静态资源缺少安全头（X-Content-Type-Options, X-Frame-Options）🔴
- 未配置 HTTPS/SSL

---

### 第七部分：NAS 部署审计 — 80/100

- Synology DS925 硬件满足需求
- Docker 目录规划合理
- 部署文档完整（NAS-STABLE-DEPLOY.md）
- **待确认**: NAS 重启后 Docker 自启动、定期备份策略、HTTPS 配置

---

### 第八部分：功能完整性 — 85/100

已验证完整的功能闭环：
- 登录/登出/修改密码 ✅
- 用户/角色/权限/菜单管理 ✅
- 客户/供应商/项目管理 ✅
- 报价/合同/订单/发票 ✅
- 售后/审批/知识库/报表 ✅
- 验证码正常 ✅
- 企业微信通知 ✅

---

## 上线前检查清单

- [ ] P0-1: 修复 Migration 059 数据库名
- [ ] P0-2: 修复 CSP localhost 泄露
- [ ] P0-3: 修复 Token 刷新 Promise 泄漏
- [ ] P1-1: 补齐缺失的 checkPermission
- [ ] P1-2: Dockerfile 添加 USER node
- [ ] P1-3: Nginx 添加安全头
- [ ] P1-4: 关闭 MySQL 端口暴露
- [ ] P1-5: App 容器添加 healthcheck
- [ ] P1-6: 统一为 npm ci
- [ ] P1-7: 修改所有默认密码
- [ ] P1-8: permission_data.sql 添加保护
- [ ] 数据库完整备份
- [ ] JWT_SECRET 确认为强随机密钥
- [ ] 日志轮转验证
- [ ] NAS Docker 自启动验证

---

## 最终结论

**是否达到企业生产系统上线标准**: **尚未达到，但差距可控。**

3 个 P0 问题均集中在配置层面（SQL 脚本、CSP 配置、Promise 处理），不涉及架构重构。8 个 P1 问题中 5 个为 Docker/Nginx 配置修正。预计 **1-2 个工作日**可全部修复，修复后可达到上线标准。

---

*审计执行: Claude Fable 5 | 2026-07-09*

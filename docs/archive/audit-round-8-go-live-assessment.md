# 第八轮：上线评估报告

> 审计日期：2026-07-04
> 审计范围：8 轮全面审计（代码规范、安全、数据库、前端、API、Docker/NAS、压力测试、上线检查）

---

## 一、审计总览

### 各轮问题汇总

| 轮次 | 🔴 严重/高危 | 🟡 中危 | 🟢 低危 | ℹ️ 建议 | 合计 |
|------|:----------:|:------:|:------:|:------:|:----:|
| 第一轮：代码规范 | 3 | 6 | 5 | 3 | 17 |
| 第二轮：安全审计 | 4 | 7 | 4 | 0 | 15 |
| 第三轮：数据库 | 3 | 10 | 5 | 2 | 20 |
| 第四轮：前端 | 3 | 8 | 5 | 3 | 19 |
| 第五轮：API 审计 | 3 | 7 | 4 | 3 | 17 |
| 第六轮：Docker/NAS | 3 严重 + 5 高危 | 7 | 7 | 0 | 22 |
| 第七轮：压力测试 | 1 | 3 | 2 | 2 | 8 |
| **合计** | **24** | **48** | **32** | **13** | **118** |

### 按风险等级分布

```
🔴 严重/高危 : ████████████████████████ 24 个
🟡 中危      : ████████████████████████████████████████████████ 48 个
🟢 低危      : ████████████████████████████████ 32 个
ℹ️  建议      : █████████████ 13 个
```

---

## 二、上线前必须修复（P0 — 阻塞上线）

### 安全问题（5 项）

| # | 问题 | 位置 | 风险 |
|---|------|------|------|
| 1 | `.env.vercel` 已提交到 Git（含 OIDC token） | `.env.vercel` | 凭证泄露 |
| 2 | `restore.sh` 硬编码默认密码 `huakey123` | `database/restore.sh:4` | 未授权访问 |
| 3 | 所有容器以 root 运行 | 所有 Dockerfile | 容器逃逸 |
| 4 | Redis 无密码保护 | `docker-compose.synology.yml` | 未授权访问 |
| 5 | 登录页 captcha SVG 未经过 sanitize（XSS） | `frontend/src/views/login/index.vue:52` | XSS 攻击 |

### 功能 Bug（3 项）

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 6 | `saveUser` 用 PUT 但后端只有 POST——**编辑用户功能 404** | `frontend/src/api/system.js:5` + `backend/routes/user.js:66` | 功能不可用 |
| 7 | `savePermission` 调 `/permission/save` 但后端无此路由——**权限编辑 404** | `frontend/src/api/system.js:22` + `backend/routes/permission.js` | 功能不可用 |
| 8 | AI SQL 生成未强制只读账号（未配置时降级为主库） | `backend/routes/ai.js` + `backend/config/database.js` | AI 可能在主库执行危险 SQL |

### 数据准确性问题（1 项）

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 9 | 仪表盘/报表约 15 处查询缺失 `deleted_at IS NULL`——已删除记录被计入统计 | `dashboardService.js`、`reportAnalyticsService.js` | 首页数据不准确 |

### 数据完整性问题（1 项）

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 10 | `claimCustomer`/`releaseCustomer` 多表写入无事务——可能遗漏操作日志 | `backend/services/customerService.js:413,462` | 操作不可追溯 |

---

## 三、上线后尽快修复（P1 — 不阻塞但优先）

### 安全增强（4 项）

| # | 问题 |
|---|------|
| 11 | HTTPS/TLS 缺失——Nginx 仅监听 80 端口 |
| 12 | Token 明文存 localStorage + SSE URL 传参 |
| 13 | MySQL 端口在 deploy/synology 版本中对外暴露 |
| 14 | helmet 使用默认 CSP 策略，建议自定义 |

### 功能增强（5 项）

| # | 问题 |
|---|------|
| 15 | CustomerDetail 路由无权限守卫（任何登录用户可访问任意客户详情） |
| 16 | CustomerList keep-alive 缓存后缺少 onActivated 刷新 |
| 17 | API Sunset 日期 2026-08-01 仅 28 天 |
| 18 | 只读连接池过小（5 连接 + queueLimit=0，第 6 个请求失败） |
| 19 | survey 模块独立挂载绕过了全局速率限制 |

### 代码质量（4 项）

| # | 问题 |
|---|------|
| 20 | `database/migrations/node_modules/` 残留（500+ 文件） |
| 21 | 前端零 ESLint 覆盖 |
| 22 | 分页代码 40+ 处重复 |
| 23 | 业务错误码系统（19 个结构化错误码）完全未使用 |

---

## 四、迭代优化（P2 — 后续版本）

- DOMPurify href 协议未限制（javascript:/data:）
- 8 个超大组件（>500 行，最大 973 行）
- 消除 N+1 查询循环（4 处）
- 058 迁移 7 表补 deleted_at 索引
- Swagger 文档覆盖率仅 18.6%
- 合并两套 Docker 配置文件
- 安全测试文件全为空
- 统一 follow-up URL 前缀
- Helm CSP 自定义策略
- 深分页 cursor-based 策略
- 前端添加 ESLint + eslint-plugin-vue
- Pinia 依赖可移除（未使用任何 store）

---

## 五、环境变量检查

### .env.example 缺失的变量

| 变量 | 用途 | 位置 |
|------|------|------|
| `EMAIL_ENC_KEY` | 邮箱密码加密密钥 | `backend/services/emailService.js` |
| `SUPABASE_URL` | Supabase 存储地址 | `backend/config/supabase-api-driver.js` |
| `SUPABASE_SERVICE_KEY` | Supabase 服务密钥 | `backend/config/supabase-api-driver.js` |
| `AI_PROVIDER` | AI 提供商 | `backend/utils/llmClient.js` |
| `MIMO_API_KEY` | MiMo API 密钥 | `backend/utils/llmClient.js` |
| `OPENAI_API_KEY` | OpenAI API 密钥 | `backend/utils/llmClient.js` |
| `LOG_LEVEL` | 日志级别（默认 http，建议生产 info） | `backend/config/logger.js` |
| `SLOW_QUERY_THRESHOLD_MS` | 慢查询阈值 | `backend/config/slowQuery.js` |
| `SKIP_CAPTCHA` | 开发环境跳过验证码 | `backend/routes/auth.js` |
| `DATABASE_URL` | Vercel 数据库连接 | `backend/index.js` |

---

## 六、npm 依赖审计

| 组件 | 漏洞 | 严重度 | 修复版本 |
|------|------|--------|----------|
| file-type | 无限循环 DoS (CVE-835) | Moderate (5.3) | 22.0.1 |
| uuid (via node-cron) | 缓冲区越界 (CWE-787) | Moderate (7.5) | 11.1.1 |
| node-cron | 传递依赖 uuid | Moderate | 4.5.0 |
| **前端** | **0 个漏洞** | ✅ | - |

---

## 七、备份与恢复

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 自动备份 | ✅ 已配置 | backup 容器每日 2:00 cron |
| 备份保留 | ✅ 30 天 | `KEEP_DAYS=30` |
| 备份脚本 | ⚠️ 有硬编码密码 | `MYSQL_ROOT_PASSWORD:-huakey123` |
| 恢复脚本 | ⚠️ 有硬编码密码 | 同上风险 |
| Windows 备份 | ❌ 脚本硬编码路径 | 不可移植 |

---

## 八、监控与健康检查

| 端点 | 认证 | 说明 |
|------|------|------|
| `/api/v1/health` | 无 | MySQL 连接、Redis 状态、版本信息 |
| `/api/v1/system/health` | Admin | 数据库延迟、Top 表、在线用户数、内存 |
| `/api/v1/metrics` | Admin | Prometheus 指标（HTTP QPS、延迟分位数、DB 连接数） |
| Docker healthcheck | - | `wget /api/health`（30s 间隔） |

---

## 九、已知问题（Known Issues）

1. 前后端 HTTP 方法不匹配（PUT/POST）导致 2 个功能 404
2. 仪表盘数据可能因缺失软删除过滤而虚高
3. 客户认领/释放操作缺少事务保护
4. AI 查询的只读账号在生产环境可能未配置
5. Survey 模块绕过了全局速率限制
6. 只读连接池在 >5 并发时直接拒绝请求
7. API 旧路径 `/api` Sunset 日期 2026-08-01（28 天后面临下线）

---

## 十、上线风险评估

| 风险域 | 等级 | 说明 |
|--------|------|------|
| 安全 | 🟡 中 | 4 项 P0 安全问题（.env.vercel 泄露、硬编码密码、容器 root、Redis 无密码） |
| 功能完整性 | 🔴 高 | 2 个功能 Bug（用户编辑、权限编辑返回 404） |
| 数据准确性 | 🟡 中 | 仪表盘统计包含已删除数据 |
| 性能 | 🟢 低 | 连接池在正常负载下可行，高并发场景需扩容 |
| 运维 | 🟡 中 | 备份脚本有密码泄露风险、HTTPS 未配置、监控覆盖良好 |

---

## 十一、是否建议上线

# 🟡 有条件上线（Conditional Go）

**前提条件**（必须在上线前完成）：

- [ ] 修复 `saveUser` 的 HTTP 方法不匹配（`request.post` 替换 `request.put`）
- [ ] 修复 `savePermission` 的路由不匹配
- [ ] 将 `.env.vercel` 从 Git 中移除并加入 `.gitignore`
- [ ] 移除 `restore.sh` 中的硬编码默认密码
- [ ] 生产环境 Redis 设置密码
- [ ] 仪表盘/报表查询补 `deleted_at IS NULL` 过滤
- [ ] `claimCustomer`/`releaseCustomer` 添加事务保护
- [ ] 登录页 captcha SVG 添加 sanitize 处理

**上线后首周内完成**：

- [ ] 配置 HTTPS/TLS
- [ ] 升级有漏洞的 npm 依赖
- [ ] 容器改用非 root 用户
- [ ] 清理 `database/migrations/node_modules/`
- [ ] 提升只读连接池 + queueLimit

**审计结论**：项目整体架构扎实，代码质量中等偏上，安全防护层级较完善。存在 10 个上线阻塞项（主要是近期引入的功能 Bug 和配置类安全问题），但这些问题的修复成本低（单文件修改为主），预计 1-2 天可全部修复。修复完成后建议上线。

# 第二轮：安全审计报告

> 审计日期：2026-07-04

## 总览

| 指标 | 数值 |
|------|------|
| 发现的问题 | 15 |
| 🔴 高危 | 4 |
| 🟡 中危 | 7 |
| 🟢 低危 | 4 |

## 🔴 高危问题

### 1. .env.vercel Vercel OIDC Token 泄露到 Git
- **位置**：`.env.vercel`（已提交到仓库）
- **问题**：包含 Vercel OIDC JWT token，不在 `.gitignore` 中
- **风险**：虽然 token 已过期，但暴露了项目 owner、project_id 等敏感信息
- **修复**：`git rm --cached .env.vercel`，添加到 `.gitignore`，如有必要轮换 Vercel 凭证

### 2. AI 动态 SQL 只读账号未强制执行
- **位置**：`backend/routes/ai.js:158` + `backend/config/database.js:67-82`
- **问题**：readOnlyPool 在未配置 DB_RO_HOST 时自动降级为主库连接池（`readOnlyPool = pool`）
- **风险**：如果部署时忘记配置只读账号，AI 生成的 SQL 将在主库执行（虽然有白名单/黑名单过滤，但仍有风险）
- **修复**：生产环境强制要求 DB_RO_* 配置，或至少打印显著警告

### 3. Prometheus metrics 端点权限检查不完整
- **位置**：`backend/app.js:340-347`
- **问题**：metrics 端点使用 `manageAll || ADMIN_ROLE_CODES.has(roleCode)` 做准入检查，能通过认证即可，无需特定业务权限码
- **风险**：所有登录用户理论上可以看到系统指标（如果他们有 manageAll 权限或 admin 角色）
- **评估**：实际上 admin-only，风险可控但未显式要求 `metrics:view` 等细粒度权限

### 4. survey 公开端点绕过全局限流
- **位置**：`backend/app.js:356`
- **问题**：`app.use('/api/v1/survey', responseFormat, surveyRoutes)` 独立挂载，绕过了 apiRouter 的 apiLimiter
- **风险**：公开的 survey 回复端点（无需认证）可被滥用发起拒绝服务攻击
- **修复**：将 survey 模块移入 apiRouter

## 🟡 中危问题

### 5. 权限检查不一致——部分集成端点
- **位置**：`backend/routes/integration.js`
- **问题**：部分端点使用 `requireManager` 而非细粒度权限码 `checkPermission('integration:xxx')`
- **修复**：统一使用 checkPermission + 细粒度权限码

### 6. Token 双重点暴露
- **位置**：`frontend/src/utils/request.js:19` + cookie
- **问题**：JWT token 既存在 localStorage 又通过 httpOnly cookie 传输，localStorage 可被 XSS 读取
- **修复**：长期方案考虑仅使用 httpOnly cookie 传输 token

### 7. Email 密码加密密钥未文档化
- **位置**：`backend/services/emailService.js:21`
- **问题**：EMAIL_ENC_KEY 环境变量未在任何 `.env.example` 中出现
- **修复**：添加到环境变量模板

### 8. restore.sh 包含硬编码默认密码
- **位置**：`database/restore.sh:4`
- **问题**：`MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-huakey123}"` 包含 fallback 默认密码
- **修复**：移除默认值，强制要求设置环境变量

### 9. helmet 使用默认 CSP 策略
- **位置**：`backend/app.js:26`
- **问题**：未自定义 Content-Security-Policy 头
- **修复**：根据前端实际需要的资源来源定制 CSP

### 10. 安全测试文件全为空
- **位置**：`backend/tests/security/`（cors.test.js、headers.test.js、rateLimit.test.js、upload.test.js）
- **问题**：4 个安全测试文件都是空占位文件，无任何测试逻辑
- **修复**：编写实际的安全测试用例

### 11. npm audit 发现 3 个 moderate 漏洞
- **位置**：`backend/package.json`
- **详情**：
  - `file-type` (16.5.4): 无限循环 DoS（修复版 22.0.1）
  - `uuid` (via node-cron): 缓冲区越界（CVSS 7.5，修复版 11.1.1）
  - `node-cron` (3.0.3): 修复版 4.5.0
- **修复**：升级受影响的依赖

## 🟢 低危问题

### 12. 前端 captcha SVG v-html 渲染
- **位置**：`frontend/src/views/login/index.vue:52`
- **风险**：低——captcha 由服务端 `svg-captcha` 库生成，非用户输入
- **修复**：考虑使用 `v-safe-html` 指令或直接内嵌 SVG

### 13. Redis 无密码保护
- **位置**：`docker-compose.synology.yml` redis 服务
- **修复**：生产环境设置 Redis 密码

### 14. MySQL 端口调试暴露风险
- **位置**：`docker-compose.synology.yml`（端口映射被注释但在 deploy/synology 版本中未注释）
- **修复**：确保生产环境 MySQL 端口不对外暴露

## ℹ️ 建议

### 15. 前端 npm audit 零漏洞（✅ 优秀）

---

## 安全总体评价

**良好方面：**
- 参数化查询使用规范，绝大多数 SQL 通过 `?` 占位符
- JWT 黑名单 + refresh token 机制设计正确
- httpOnly + Secure + SameSite=strict cookie 配置完整
- 文件上传使用 file-type 双阶段校验
- 登录限流（10次/15分钟）防止暴力破解
- 前端 npm audit 零漏洞

**主要风险域：**
- 配置管理（凭证泄露、环境变量文档不完整）
- 防护边界一致性（部分端点遗漏限流/权限检查）
- 依赖安全更新滞后

---

## 优先修复顺序

1. 将 `.env.vercel` 从 Git 中移除
2. 移除 `restore.sh` 中的硬编码默认密码
3. 升级有漏洞的 npm 依赖
4. 将 survey 模块移入 apiRouter（恢复限流保护）
5. 强制生产环境配置只读数据库账号
6. 编写安全测试用例
7. 自定义 helmet CSP 策略

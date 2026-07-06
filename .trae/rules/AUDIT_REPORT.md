# 华锴CRM 全栈代码审计报告

> 审计日期：2026-06-30  
> 审计范围：全栈（Vue 3 + Node.js/Express + MySQL 8.0 + Docker）  
> 审计维度：架构 | 代码质量 | 安全 | 数据库 | 性能 | DevOps  

---

## A. 总体评估

| 维度 | 评分 | 评级 | 关键发现 |
|------|------|------|----------|
| 架构合理性 | **82** / 100 | B+ | 三层分层清晰，58 个 service 文件，62 个路由中 59 个 pool.query 归零 |
| 代码质量 | **78** / 100 | B | 命名规范统一，Joi 校验覆盖主路由，存在少量 console.error 残留 |
| 安全性 | **72** / 100 | B- | 参数化查询全覆盖，bcrypt(12) + JWT黑名单 + Helmet 有效，文件上传 MIME 可绕过 |
| 数据库设计 | **75** / 100 | B- | 范式合理，索引覆盖主查询路径，57 个迁移缺 down 脚本，1 张表无建表 migration |
| 性能与扩展性 | **74** / 100 | B- | Redis 已接入限流持久化，缓存仅试点 3 个端点，连接池需调大 |
| DevOps / 部署 | **80** / 100 | B | Docker Compose 完整，健康检查到位，CI 含安全扫描，缺 Trivy（已在 Phase 8 补上） |
| **综合** | **77** / 100 | **B（可投产）** | — |

**结论**：可投产的企业级系统。3 个 High 问题须在上线前修复，9 个 Medium 问题建议第一个迭代消化。

---

## B. 高风险问题

### Critical — 0 项

未发现可导致系统被直接攻破的 Critical 级风险。bcrypt(12) + JWT 黑名单 + 参数化查询 + Helmet 安全头 + rate limiting 联合形成了有效防线。

### High — 3 项（上线前必须修复）

#### H1. JWT 可通过 URL query string 传递（token 泄露风险）

- **位置**：[backend/middleware/auth.js:17](/C:/huakey-crm/backend/middleware/auth.js)
- **问题**：`getTokenFromRequest` 函数优先读取 Cookie，其次 `Authorization` header，最后 fallback 到 `req.query.token`。query string 中的 token 会被浏览器历史、服务器 access log、Referer header 记录。
- **风险**：token 泄露导致账户劫持。
- **修复**：

```diff
  const getTokenFromRequest = (req) => {
    if (req.cookies && req.cookies.token) return req.cookies.token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.split(' ')[1];
-   if (req.query && req.query.token) return req.query.token;
    return null;
  };
```

#### H2. CORS_ORIGIN 生产环境无强制校验

- **位置**：[backend/app.js:70-76](/C:/huakey-crm/backend/app.js)
- **问题**：`corsOrigin` 生产环境默认 `'https://your-domain.com'`（占位符）。如果运维忘记设置 `CORS_ORIGIN` 环境变量，CORS 实际使用占位域名导致前端无法访问；或因误操作设为 `*` 而允许任意域。
- **风险**：CORS 策略失效，可能被 CSRF 攻击利用。
- **修复**：

```javascript
const isProduction = process.env.NODE_ENV === 'production';
const corsOrigin = isProduction
  ? process.env.CORS_ORIGIN
  : 'http://localhost:5173';

if (isProduction && !corsOrigin) {
  console.error('FATAL: CORS_ORIGIN must be set in production');
  process.exit(1);
}
```

#### H3. 文件上传 MIME 校验可被伪造绕过

- **位置**：[backend/routes/upload.js:29-30](/C:/huakey-crm/backend/routes/upload.js)
- **问题**：`file.mimetype` 来自客户端 HTTP `Content-Type` 头，可被任意伪造。当前仅校验了扩展名白名单和 MIME 映射表，但 `docx`/`xlsx` 本质是 ZIP 格式，恶意文件可伪造成 `.jpg` 并以 `image/jpeg` Content-Type 上传。
- **风险**：攻击者上传伪装成图片的可执行文件或 WebShell。
- **修复**：

```javascript
const { fileTypeFromBuffer } = require('file-type');

// 在 multer fileFilter 中：
fileFilter: async (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|zip|rar)$/i;
  if (!allowedExts.test(ext)) {
    return cb(new Error('不支持的文件格式'));
  }
  // Magic bytes 检测 —— 不信任客户端 Content-Type
  try {
    const type = await fileTypeFromBuffer(file.buffer.slice(0, 4100));
    const allowedMimes = ALLOWED_MIME_TYPES[ext];
    if (!type || !allowedMimes || !allowedMimes.includes(type.mime)) {
      return cb(new Error('文件内容与扩展名不匹配'));
    }
  } catch {
    return cb(new Error('文件检测失败'));
  }
  cb(null, true);
}
```

需要安装：`npm install file-type --save`

### Medium — 9 项（建议上线后迭代修复）

#### M1. 登录失败未做 timing attack 防护

- **位置**：[backend/services/authService.js:85-105](/C:/huakey-crm/backend/services/authService.js)
- **问题**：统一返回「用户名或密码错误」是最佳实践，但未增加恒定延迟。攻击者可通过响应时间差异推断用户是否存在。
- **修复**：

```javascript
async function login(pool, { username, password }) {
  const start = Date.now();
  try {
    // ... 正常登录逻辑 ...
  } finally {
    const elapsed = Date.now() - start;
    if (elapsed < 200) await new Promise(r => setTimeout(r, 200 - elapsed));
  }
}
```

#### M2. `/register` 端点未限制管理员权限

- **位置**：[backend/routes/auth.js:250](/C:/huakey-crm/backend/routes/auth.js)
- **问题**：`authenticateToken` 确保已登录用户可调用，但未限制只有管理员可注册新用户。任何登录用户均可注册新账号。
- **修复**：

```diff
- router.post('/register', authenticateToken, validate(registerSchema), async (req, res) => {
+ router.post('/register', authenticateToken, checkPermission('user:create'), validate(registerSchema), async (req, res) => {
```

#### M3. 3 个路由文件仍有 pool.query 直接调用（20 处）

- **位置**：[backend/routes/api-platform.js](/C:/huakey-crm/backend/routes/api-platform.js) (15处)、[backend/routes/cronJobs.js](/C:/huakey-crm/backend/routes/cronJobs.js) (4处)、[backend/routes/recycle.js](/C:/huakey-crm/backend/routes/recycle.js) (1处)
- **问题**：违反 service 层架构约定，路由直接持有数据库连接，增加耦合和测试难度。
- **修复**：为这 3 个模块补建 service 层，参照已有 service 文件模板。

#### M4. `crm_user_permission` 表无对应建表 migration

- **位置**：被 [backend/services/permissionService.js](/C:/huakey-crm/backend/services/permissionService.js) 引用，但全局所有 migration 文件中无 `CREATE TABLE crm_user_permission` 语句。
- **问题**：从零重建数据库时（非导入 SQL dump），该表缺失导致权限查询失败。
- **修复**：新建 `database/migrations/069_create_user_permission.sql` 补充建表语句，并创建对应的 down 脚本。

#### M5. `console.error` 残留绕过结构化日志

- **位置**：多处路由 handler 的 catch 块中：[routes/auth.js:170](/C:/huakey-crm/backend/routes/auth.js)、[routes/upload.js:62](/C:/huakey-crm/backend/routes/upload.js)、[routes/notification.js:20](/C:/huakey-crm/backend/routes/notification.js) 等。
- **问题**：`console.error` 在生产环境中绕过结构化日志系统（Winston），无法被集中采集、索引和告警。
- **修复**：

```javascript
// 全局替换模式：
const logger = require('../config/logger');

// 将所有：
console.error('[xxx] 错误:', error);
// 替换为：
logger.error('[xxx]', { error: error.stack || error.message, traceId: req.traceId });
```

#### M6. Token 刷新机制缺失（无 refresh token）

- **位置**：[frontend/src/utils/request.js:4-12](/C:/huakey-crm/frontend/src/utils/request.js)
- **问题**：前端有 `isRefreshing` + `refreshSubscribers` 队列，但后端无对应的 `/auth/refresh` 端点。token 过期后用户被强制登出。
- **风险**：用户体验差，长时间使用后频繁重新登录。
- **修复**：
  1. 后端新增 `POST /auth/refresh`，验证旧 token 后签发新 token
  2. 前端 `request.js` 拦截器在 401 时调用 `/auth/refresh`
  3. access token 缩短为 30 分钟，refresh token 保持 7 天

#### M7. 密码修改后不要求重新认证

- **位置**：[backend/routes/auth.js:294](/C:/huakey-crm/backend/routes/auth.js)
- **问题**：`/change-password` 仅需有效 token + 旧密码即可修改。若 XSS 获取 token，攻击者可尝试暴力破解旧密码。
- **风险**：低（已有旧密码验证 + rate limiter），但建议增加邮箱验证码二次确认。
- **修复**：生产环境增加邮箱验证码流程（Phase 9 候选）。

#### M8. 数据库连接池上限偏低

- **位置**：[backend/config/database.js:12](/C:/huakey-crm/backend/config/database.js)
- **问题**：`connectionLimit: 20`，并发 > 100 用户时连接可能耗尽，请求排队。
- **风险**：高峰期 API 响应延迟激增。
- **修复**：

```javascript
// 按环境分层：
connectionLimit: process.env.NODE_ENV === 'production' ? 50 : 20,
```

#### M9. Docker：MySQL 端口暴露到宿主机

- **位置**：[docker-compose.synology.yml:37](/C:/huakey-crm/docker-compose.synology.yml)
- **问题**：`ports: - "3307:3306"` 将 MySQL 暴露给 NAS 宿主机网络，若 NAS 暴露在公网则增加攻击面。
- **修复**：

```yaml
# 如不需要外部直连 MySQL（仅容器内通过 crm-network 通信），注释掉：
# ports:
#   - "3307:3306"
```

### Low — 5 项（优化项）

| 编号 | 描述 | 位置 |
|------|------|------|
| L1 | 57 个迁移缺 down 脚本（Phase 8 补齐 10 个核心，剩余 47 个低风险） | database/migrations/ |
| L2 | `responseFormat.js` 对非标准格式自动包装可能导致前端误判 | middleware/responseFormat.js |
| L3 | `svg-captcha` noise 参数偏低（当前 2，建议 4） | services/authService.js |
| L4 | Docker Redis 禁用 AOF 持久化（`--save ""`），重启缓存全丢 —— 确认是否为设计选择 | docker-compose.synology.yml |
| L5 | Playwright `reuseExistingServer: true` 在 CI 环境下可能导致测试污染 | frontend/playwright.config.js |

---

## C. 具体问题修复代码

### H3 详细修复：文件上传 Magic Bytes 检测

**安装依赖：**
```bash
cd backend && npm install file-type --save
```

**完整的 multer 配置替换：**

```javascript
// backend/routes/upload.js — 完整替换
const multer = require('multer');
const path = require('path');
const { fileTypeFromBuffer } = require('file-type');

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar'];

const ALLOWED_MIME_TYPES = {
  '.jpg':  ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png':  ['image/png'],
  '.gif':  ['image/gif'],
  '.webp': ['image/webp'],
  '.pdf':  ['application/pdf'],
  '.doc':  ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls':  ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.zip':  ['application/zip', 'application/x-zip-compressed'],
  '.rar':  ['application/vnd.rar', 'application/x-rar-compressed'],
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: async (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|zip|rar)$/i;
    if (!allowedExts.test(ext)) {
      return cb(new Error('不支持的文件格式'));
    }

    // 阶段 1: MIME 快速检查（非最终判定）
    const allowedMimes = ALLOWED_MIME_TYPES[ext];
    if (allowedMimes && !allowedMimes.includes(file.mimetype)) {
      return cb(new Error('文件类型与扩展名不匹配'));
    }

    // 阶段 2: Magic bytes 深度检查（仅对 4KB 以内的头部）
    try {
      const type = await fileTypeFromBuffer(file.buffer.slice(0, 4100));
      if (!type) {
        return cb(new Error('无法识别文件类型'));
      }
      if (allowedMimes && !allowedMimes.includes(type.mime)) {
        return cb(new Error('文件内容与扩展名不匹配'));
      }
    } catch {
      return cb(new Error('文件检测失败，请重试'));
    }

    cb(null, true);
  }
});
```

### M4 修复：补充 crm_user_permission 建表 migration

```sql
-- database/migrations/069_create_user_permission.sql
USE huakey_crm;

CREATE TABLE IF NOT EXISTS crm_user_permission (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    user_id INT NOT NULL COMMENT '用户ID',
    permission_id INT NOT NULL COMMENT '权限ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_user_permission (user_id, permission_id),
    INDEX idx_user_id (user_id),
    INDEX idx_permission_id (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户权限关联表';
```

```sql
-- database/migrations/069_create_user_permission_down.sql
DROP TABLE IF EXISTS crm_user_permission;
```

### M6 修复：Refresh Token 端点骨架

```javascript
// backend/routes/auth.js — 新增 refresh 端点
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT u.id, u.username, u.role_id, COALESCE(r.code, '') as role_code,
              COALESCE(r.view_all, 0) as view_all, COALESCE(r.manage_all, 0) as manage_all
       FROM sys_user u LEFT JOIN sys_role r ON u.role_id = r.id
       WHERE u.id = ? AND u.status = 1`,
      [req.user.userId]
    );
    if (users.length === 0) {
      return res.status(401).json({ code: 401, message: '用户不存在或已禁用', data: null });
    }

    const user = users[0];
    // 将旧 token 加入黑名单
    const oldToken = getTokenFromRequest(req);
    const tokenHash = require('crypto').createHash('sha256').update(oldToken).digest('hex');
    await pool.query(
      `INSERT INTO sys_token_blacklist (token_hash, expire_at) VALUES (?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [tokenHash]
    );

    // 签发新 token
    const newToken = generateToken(user);
    res.json({ code: 200, message: 'Token 已刷新', data: { token: newToken } });
  } catch (error) {
    console.error('[Auth] Token 刷新失败:', error);
    res.status(500).json({ code: 500, message: 'Token 刷新失败', data: null });
  }
});
```

---

## D. 架构评价

### 当前架构优点

1. **三层分层清晰**：routes → services → database，58 个 service 文件覆盖所有业务模块
2. **中间件链完整**：traceId → CORS → helmet → compression → metrics → rateLimiter → authenticateToken → checkPermission → validate → responseFormat
3. **字段级权限**：`checkFieldPermission` + `stripRestrictedFields` 控制 product/quote/purchase/supplier/contract 的敏感字段可见性
4. **ModuleRegistry**：customer/product/report 支持声明式模块注册
5. **统一响应格式**：`{ code, message, data }` 三元组，`responseFormat.js` 自动包装
6. **CI/CD 完善**：lint 阻断 + npm audit + CodeQL + coverage 门禁 + integration test + migration test + Trivy 扫描

### 架构短板

1. **缺少 Controller 层**：复杂业务流程（如「创建客户 → 分配销售 → 发通知 → 写日志」）散落在路由 handler 中
2. **缺少统一错误码**：HTTP 状态码和业务错误码混用，前端难以精确处理不同错误类型
3. **`pool.query` 残留**：api-platform(15)、cronJobs(4)、recycle(1) 共 3 个文件 20 处直接调用

### 推荐目标架构

```
backend/
  controllers/           # 新增：编排层（调用多个 service，组装响应）
    authController.js
    customerController.js
    ...
  services/              # 保持：纯业务函数，不含 HTTP 上下文
  middleware/             # 保持：认证/权限/限流/日志/格式化
  routes/                 # 精简：仅路由注册 + Joi 参数校验
  errors/                 # 新增：错误码枚举 + 统一异常类
    codes.js              #   { USER_NOT_FOUND: 1001, TOKEN_EXPIRED: 1002, ... }
    AppError.js           #   class AppError extends Error { code, httpStatus }
  config/
  utils/
  tests/
```

**Controller 层示例：**

```javascript
// backend/controllers/customerController.js
const customerService = require('../services/customerService');
const notificationService = require('../services/notificationService');
const logger = require('../config/logger');

async function create(req, res) {
  const customer = await customerService.create(req.pool, req.body, req.user.userId);

  // 跨 service 编排 —— 当前这些逻辑散落在路由 handler 中
  await notificationService.createNotification(req.pool, {
    user_id: req.user.userId,
    type: 'customer_created',
    title: `新客户: ${customer.name}`,
    content: `已创建客户 ${customer.name}`,
    business_type: 'customer',
    business_id: customer.id,
  });

  logger.info('[Customer] 创建成功', { userId: req.user.userId, customerId: customer.id });
  res.status(201).json({ code: 201, message: '创建成功', data: customer });
}
```

### Redis 缓存扩展建议

当前 Redis 仅用于 rate limiter 持久化。建议扩展：

| 场景 | 缓存策略 | 预期收益 |
|------|----------|----------|
| `GET /customer/list` | 5 分钟 TTL，按用户+筛选条件 key | 减少 70% 重复查询 |
| `GET /report/sales-funnel` | 10 分钟 TTL | 减少 90% 聚合计算 |
| `GET /report/overview` | 10 分钟 TTL | 减少 90% 聚合计算 |
| 批量导入（>100 条） | Redis List 异步队列 + 逐条写入 | 避免连接池耗尽 |
| Session（可选） | 替代纯 JWT 无状态，支持强制踢出 | 安全增强 |

---

## E. 优化路线图

### 1 天修复清单（紧急）

| # | 条目 | 级别 | 文件 |
|---|------|------|------|
| 1 | 删除 query string token 提取 | H1 | middleware/auth.js:17 |
| 2 | CORS_ORIGIN 生产环境启动检查 | H2 | app.js:70 |
| 3 | 文件上传增加 magic bytes 检测 | H3 | routes/upload.js + 安装 file-type |
| 4 | `/register` 端点加 `checkPermission('user:create')` | M2 | routes/auth.js:250 |
| 5 | 创建 `crm_user_permission` migration (069) | M4 | database/migrations/ |
| 6 | `console.error` 全部替换为 `logger.error` | M5 | 全局搜索替换 |

### 3 天优化清单

| # | 条目 | 级别 | 涉及 |
|---|------|------|------|
| 7 | 为 api-platform / cronJobs / recycle 补建 service 层 | M3 | 3 个新 service 文件 + 路由改写 |
| 8 | 实现 `/auth/refresh` refresh token 端点 | M6 | routes/auth.js + request.js |
| 9 | 调整 production pool `connectionLimit` 到 50 | M8 | config/database.js |
| 10 | 评估 MySQL 端口对外暴露必要性，按需注释 | M9 | docker-compose.synology.yml |
| 11 | captcha noise 参数从 2 调至 4 | L3 | services/authService.js |
| 12 | Joi schema 覆盖扫描（确认无遗漏路由） | — | 全局扫描 |
| 13 | 前端 DOMPurify 集成（审计所有 `v-html` 使用点） | — | main.js + 全局 |

### 1 周架构优化计划

| 天 | 任务 |
|----|------|
| Day 1-2 | 提取 Controller 层：customer / opportunity / contract / quote 4 个核心模块 |
| Day 3 | 创建 `errors/AppError.js` + 错误码枚举 `errors/codes.js`，替换全局 `throw new Error()` |
| Day 4 | Redis 缓存接入：customer list / report overview / sales funnel 3 个热点端点 |
| Day 5 | 批量操作异步化：客户导入、contract 批量生成 → Redis 队列缓冲 |
| Day 6 | 补齐全部 65 个迁移的 down 脚本（Phase 8 已完成 17 个） |
| Day 7 | 集成测试覆盖 Controller 层 + k6 压力测试（50 VUs）验证 |

---

## 附录：已确认安全项（无需修复）

以下项目经常在审计中被标记，但在本项目中已妥善处理：

| 项目 | 状态 | 实现方式 |
|------|------|----------|
| SQL 注入防护 | ✅ | 全部使用参数化查询 `pool.query(sql, [params])`，无字符串拼接 |
| 密码存储 | ✅ | bcrypt (12 rounds) + 注册时密码强度校验（8位/大小写/数字） |
| JWT 黑名单 | ✅ | `sys_token_blacklist` 表 + SHA-256 hash，logout 时写入 |
| Token 过期 | ✅ | JWT `expiresIn: 7d` + verify 时分错误类型返回不同消息 |
| CSRF 防护 | ✅ | `withCredentials: true` + CORS 白名单 + SameSite Cookie |
| XSS 防护 | ✅ | Helmet (CSP + X-Content-Type-Options + X-Frame-Options) + Element Plus 模板转义 |
| 限流 | ✅ | apiLimiter (1000/15min) + authLimiter (10/15min)，Redis 持久化 |
| 安全头 | ✅ | Helmet 自动注入 HSTS、X-DNS-Prefetch-Control、X-Permitted-Cross-Domain-Policies |
| 日志脱敏 | ✅ | `maskLogParams` 脱敏 password/phone/id_card 等字段 |
| 健康检查 | ✅ | `/api/health` (公开) + `/api/system/health` (管理员) |
| 审计日志 | ✅ | `sys_log` 表记录所有操作，含 userId/IP/action/module |
| 字段级权限 | ✅ | checkFieldPermission + stripRestrictedFields 控制 5 个模块敏感字段 |
| Pre-commit hooks | ✅ | husky + lint-staged |
| 分支保护 | ✅ | `docs/branch-protection.md` 已文档化 |

---

## 附录：项目统计

| 指标 | 数值 |
|------|------|
| 后端路由文件 | 62 个（含子路由） |
| Service 文件 | 58 个 |
| 数据库迁移 | 65 个（17 个含 down 脚本） |
| 测试 Suite | 67/67 通过 |
| 测试 Case | 501/501 通过 |
| pool.query 残留 | 3 个文件 / 20 处 |
| 代码覆盖率门禁 | branches:30%, functions:40%, lines:40%, statements:40% |

---

> 审计工具：Codex 全栈审计  
> 下次审计建议：Phase 9 功能开发前

<!--
  Phase 1 剩余任务 prompt 清单
  生成日期: 2026-06-29
  目标执行者: Trea / 其他 AI agent
  前提: 已完成的改动见 IMPLEMENTATION_PLAN.md（roleCode迁移、前端路由权限、冗余依赖移除）
-->

# Phase 1 剩余任务 — 可分派 Prompt

> 每个任务独立自包含，可以分开执行。顺序按优先级排列。

---

## 任务 A: traceId 中间件（预计20分钟）

### 背景
当前系统所有请求没有 traceId，排查问题时无法串联一次请求的完整链路。需要在请求进入时注入 UUID，贯穿日志和响应头。

### 要求

1. 新建 `backend/middleware/traceId.js`：
   - 使用 `crypto.randomUUID()` 生成 traceId
   - 注入到 `req.traceId`
   - 调用 `next()` 继续
   - 在响应头中设置 `X-Trace-Id: <uuid>`

2. 在 `backend/app.js` 中挂载：
   - 位置：`helmet()` 之后、其他中间件之前
   - 引入: `const traceIdMiddleware = require('./middleware/traceId');`
   - 挂载: `app.use(traceIdMiddleware);`

3. 修改 `backend/middleware/logger.js`：
   - 在日志输出中追加 `[traceId=xxx]` 前缀
   - 从 `req.traceId` 读取

4. 修改 `backend/config/database.js`：
   - 暴露一个 `queryWithTrace(traceId, sql, params)` 包装函数，在 SQL 开头注入 `/* traceId=xxx */` 注释
   - 不改动现有 `pool.query` 签名，另起一个导出

### 验收标准
- `curl -v http://localhost:5000/api/health` 返回 `X-Trace-Id` 头
- 触发任何业务请求后，控制台日志包含 `[traceId=xxx]`

---

## 任务 B: 统一响应格式中间件（预计30分钟）

### 背景
当前各 route 手动构造 `{ code, message, data }`，但没有统一校验。部分旧接口可能直接返回数组或字符串。需要在所有路由之后挂一个 format 中间件确保格式统一。

### 要求

1. 新建 `backend/middleware/responseFormat.js`：
   - 拦截 `res.json()`，用 Proxy 包装
   - 规则：如果返回体已经是 `{ code, message, data }` 结构，放行
   - 如果返回体是数组或字符串，自动包装为 `{ code: 200, message: 'success', data: <原值> }`
   - 如果返回体是 `null` 或 `undefined`，包装为 `{ code: 200, message: 'success', data: null }`

2. 在 `backend/app.js` 中挂载：
   - 位置：**所有路由之后，错误处理中间件之前**
   - 引入: `const responseFormatMiddleware = require('./middleware/responseFormat');`
   - 挂载: `app.use(responseFormatMiddleware);`

3. 审计路由返回格式（只读不改）：
   - 扫描 `backend/routes/**/*.js` 中所有 `res.json(` 调用
   - 列出**未按 `{ code, message, data }` 格式返回**的调用，输出到控制台或日志
   - 不改动任何 route 文件，仅列出异常

### 验收标准
- 所有 API 响应自动统一为 `{ code, message, data }` 结构
- 不破坏现有正确返回格式的路由

---

## 任务 C: 运行测试（预计10分钟）

### 背景
已完成 Phase 1.1 roleCode 迁移，修改了28个文件。需要跑全量测试确认无回归。

### 要求
```bash
cd C:\huakey-crm\backend
npx jest --forceExit --no-coverage 2>&1
```
观察：
- 是否有测试因 `roleCode` 为 `undefined` 而失败
- 是否有测试因 `ADMIN_ROLE_CODES` 导入问题而失败
- 如有失败，定位原因后修复（大概率是 mock 的 `req.user` 缺少 `roleCode` 字段）

### 验收标准
- 所有已有测试通过（失败数 = 0）
- 如有新增失败，已修复且无其他回归

---

## 任务 D: API 认证挂载审计（预计30分钟）

### 背景
系统有62个 route 文件，`authenticateToken` 中间件未在 apiRouter 层级统一挂载，每个 route 独立决定是否调用。存在遗漏风险。

### 要求

1. 扫描 `backend/routes/**/*.js`：
   - 列出每个文件中是否有 `authenticateToken` 引用
   - 列出每个文件中是否有 `checkPermission` 引用
   - 输出一个表格：`文件名 | 路由路径 | 有auth? | 有permission?`

2. 重点检查这些文件（已知高风险）：
   - `backend/routes/search.js`
   - `backend/routes/report/analytics.js`
   - `backend/routes/ai.js`
   - `backend/routes/upload.js`
   - `backend/routes/recycle.js`

3. 对缺少 `authenticateToken` 的路由：
   - 补充挂载（在 `router.use()` 或具体路由上）
   - 确保不影响 `/api/health` 等公开端点

### 验收标准
- 除 `/api/auth/login`、`/api/auth/captcha`、`/api/health` 外，所有API端点都有认证保护

---

## 任务 E: CASCADE 删除审计（预计20分钟）

### 背景
`database/migrations/` 中有65个 migration 文件。`crm_customer` 表的级联删除可能过于激进（删除客户→物理删除所有关联数据），而业务层用 `deleted_at` 做软删除。需要审查所有 `ON DELETE CASCADE` 约束。

### 要求

1. 扫描 `database/migrations/*.sql` 中所有 `ON DELETE CASCADE`：
   - 列出：文件名 | 表名 | 外键列 | 引用表

2. 重点审查 `crm_customer` 的级联链：
   - 追踪从 `crm_customer` → 所有子表的外键
   - 确认 DELETE CASCADE 是否会物理删除 `crm_follow_up`、`crm_opportunity`、`crm_quote`、`crm_contract` 等

3. 风险评估：
   - 如果业务层软删除（设置 `deleted_at`），数据库层 CASCADE 不会触发（因为不是真 DELETE）
   - 但如果任何代码用了 `DELETE FROM crm_customer`，就会触发级联
   - 搜索 `backend/**/*.js` 中是否有 `DELETE FROM` 语句涉及客户表

4. 输出结论：
   - 如果风险可控（没有 `DELETE FROM crm_customer` 代码），标记为 PASS
   - 如果存在风险，建议将 CASCADE 改为 RESTRICT

### 验收标准
- 输出一份清晰的级联删除链路图和风险评估结论

---

## 任务 F: 数据备份策略（预计30分钟，需 Docker 环境）

### 背景
当前 `database/backups/` 目录存在但 Docker Compose 中没有挂载备份 volume，也没有定期备份的 cron。

### 要求

1. 编写 `database/backup.sh`：
   ```bash
   #!/bin/bash
   # 全量备份 + 保留最近30天
   mysqldump -h mysql -u root -p${MYSQL_ROOT_PASSWORD} --single-transaction --routines --triggers huakey_crm \
     | gzip > /backups/huakey_crm_$(date +%Y%m%d_%H%M%S).sql.gz
   find /backups -name "*.sql.gz" -mtime +30 -delete
   ```

2. 编写 `database/restore.sh`：
   - 接受一个备份文件名参数
   - 先验证文件存在
   - `gunzip < xxx.sql.gz | mysql -h mysql -u root -p${MYSQL_ROOT_PASSWORD} huakey_crm`

3. 在 `docker-compose.synology.yml` 中：
   - 为 MySQL 服务添加 backup volume：`./database/backups:/backups`
   - 或配置 Synology DSM 任务计划每天执行一次备份

4. 编写 `BACKUP_RESTORE.md` 说明备份恢复步骤

### 验收标准
- `backup.sh` 可执行，能生成 `.sql.gz` 文件
- `restore.sh` 可执行，能恢复备份
- 文档清晰

---

## 执行建议

按 A → B → C → D → E → F 顺序执行，因为：
- A(traceId) 和 B(响应格式) 是纯新建中间件，独立性强
- C(测试) 必须在 A+B 之后跑，验证无回归
- D(认证审计) 和 E(CASCADE审计) 是只读审计，不涉及大量代码修改
- F(备份) 需要 Docker/NAS 环境，放最后

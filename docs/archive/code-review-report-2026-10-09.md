# HUAKEYCRM 代码检视报告

## 检视摘要

| 项 | 值 |
|---|---|
| 检视范围 | 后端核心（app.js / middleware / controllers / services / routes）+ 前端核心（router / api / utils） |
| 技术栈 | Node.js 22 + Express 4 + MySQL 8 + JWT / Vue 3 + Element Plus + Vite |
| 检视日期 | 2026-10-09 |
| 问题统计 | **Critical 1 / High 2 / Medium 3 / Low 3 / Info 4** |
| 总体评价 | 架构成熟度高（分层清晰、RBAC+数据权限+字段权限三层防护、JWT 黑名单、CSRF、Helmet、限流、Joi stripUnknown、统一错误处理、审计日志、优雅关闭）。主体安全基线良好，但**客户状态流转与分配存在 IDOR 越权**，自定义报表存在存储型 SQL 注入，需优先修复。 |

---

## Critical（必须立即修复，阻断上线）

### [C-001] 自定义报表 `c.label` 拼接进 SQL 标识符，存在存储型 SQL 注入

- **位置**：`backend/services/customReportService.js:112-115`
- **维度**：安全
- **等级**：Critical
- **原因**：报表列配置 `c.label` 被直接拼接进 SQL 反引号标识符：

  ```js
  if (c.agg === 'count') return `COUNT(${src.alias}.${c.field}) as \`${c.label}\``;
  if (c.agg === 'sum')   return `COALESCE(SUM(${src.alias}.${c.field}), 0) as \`${c.label}\``;
  if (c.agg === 'avg')   return `COALESCE(AVG(${src.alias}.${c.field}), 0) as \`${c.label}\``;
  return `${src.alias}.${c.field} as \`${c.label}\``;
  ```

  `c.label` 来自用户保存的报表配置（`config.columns_config`，JSON 解析）。虽然字段名 `c.field` 有白名单校验（`allowedFields.includes(c.field)`），但 **`c.label` 完全未校验**。攻击者构造 `label` 含反引号 `` ` `` 即可逃逸标识符上下文，注入任意 SQL（如 `` `x` FROM crm_customer; DROP TABLE--` ``）。这是存储型注入：恶意配置保存后，任何执行该报表的用户都会触发。

- **修复前**：
  ```js
  if (c.agg === 'count') return `COUNT(${src.alias}.${c.field}) as \`${c.label}\``;
  ```
- **修复后**：
  ```js
  // 标识符白名单：仅允许字母数字下划线中文，长度 <= 60，杜绝反引号/分号/空格逃逸
  const sanitizeLabel = (label) => {
    const s = String(label || '').slice(0, 60);
    if (!/^[\w\u4e00-\u9fa5]+$/.test(s)) return 'col'; // 非法 → 兜底别名
    return s;
  };
  // ...
  if (c.agg === 'count') return `COUNT(${src.alias}.${c.field}) AS \`${sanitizeLabel(c.label)}\``;
  if (c.agg === 'sum')   return `COALESCE(SUM(${src.alias}.${c.field}), 0) AS \`${sanitizeLabel(c.label)}\``;
  if (c.agg === 'avg')   return `COALESCE(AVG(${src.alias}.${c.field}), 0) AS \`${sanitizeLabel(c.label)}\``;
  return `${src.alias}.${c.field} AS \`${sanitizeLabel(c.label)}\``;
  ```
- **参考**：CWE-89 SQL Injection；标识符（表名/列名/别名）不能参数化，必须白名单校验。

---

## High（当前迭代修复）

### [H-001] 客户状态推进/回退端点缺失数据权限校验，存在 IDOR 越权

- **位置**：`backend/routes/customers.js:186-199`（路由）+ `backend/services/customerService.js:410-454`（service）
- **维度**：安全
- **等级**：High
- **原因**：`/customers/forward` 和 `/customers/backward` 路由只挂了 `checkPermission('customer:edit')`，**没有 `checkDataPermission('customer', 'owner_id')`**。service 层 `forwardStatus` / `backwardStatus` 只校验客户是否存在和状态流转合法性，**不校验操作者是否为该客户的负责人/有数据权限**。

  后果：销售 A 知道销售 B 的客户 ID，直接调用 `POST /customers/forward { customer_id: B的客户ID }` 即可推进他人客户状态。`customer:edit` 是销售普遍拥有的权限，越权门槛极低。

- **修复前**（`routes/customers.js:186`）：
  ```js
  router.post('/forward',
    authenticateToken,
    checkPermission('customer:edit'),
    validate(forwardSchema),
    customerController.forward
  );
  ```
- **修复后**：
  ```js
  router.post('/forward',
    authenticateToken,
    checkPermission('customer:edit'),
    checkDataPermission('customer', 'owner_id'),  // 新增：注入数据权限
    validate(forwardSchema),
    customerController.forward
  );
  ```
  同时 service 层 `forwardStatus` / `backwardStatus` 需增加归属校验：
  ```js
  async function forwardStatus(pool, customerId, operatorId, dataPermission) {
    const { clause, params } = await buildDataPermissionWhere(dataPermission, 'c');
    const [customers] = await pool.query(
      `SELECT id, status FROM crm_customer c WHERE c.id = ? AND c.deleted_at IS NULL AND ${clause}`,
      [customerId, ...params]
    );
    if (!customers.length) {
      throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND); // 不存在或无权限，统一报错避免枚举
    }
    // ... 后续流转逻辑不变
  }
  ```
  controller 传参：`customerService.forwardStatus(pool, req.body.customer_id, req.user.userId, req.dataPermission)`
- **关联**：`backward` 端点同样修复。`releaseToPool` / `claimPool` 等涉及单客户操作的端点都应排查是否缺 `checkDataPermission`。
- **参考**：CWE-639 Authorization Bypass Through User-Controlled Key (IDOR)；AGENTS.md 7.4「权限必须后端强制」。

### [H-002] 客户分配端点缺失归属校验 + 目标用户未校验，存在 IDOR 越权

- **位置**：`backend/controllers/customerController.js:166-186` + `backend/services/assignService.js:189-226`
- **维度**：安全
- **等级**：High
- **原因**：`/customers/assign` 和 `/customers/batch-assign` 路由无 `checkDataPermission`。`manualAssign` 只查客户是否存在，**不校验操作者对该客户有权限**，且 `toUserId`（目标接收人）**未校验是否为有效销售用户**。

  后果：
  1. 销售 A 可把销售 B 的客户分配给自己或任意人（抢客）；
  2. `toUserId` 可传任意用户 ID（含管理员/禁用用户），破坏客户归属完整性。

- **修复前**（`assignService.js:189`）：
  ```js
  async function manualAssign(pool, customerId, toUserId, operatorId, remark) {
    const [customers] = await pool.query(
      'SELECT id, owner_id, company_name FROM crm_customer WHERE id = ? AND deleted_at IS NULL',
      [customerId]
    );
    // ... 直接 UPDATE，无归属校验，无 toUserId 校验
  }
  ```
- **修复后**：
  ```js
  async function manualAssign(pool, customerId, toUserId, operatorId, remark, dataPermission) {
    // 1. 归属校验：操作者必须对源客户有数据权限
    const { clause, params } = await buildDataPermissionWhere(dataPermission, 'c');
    const [customers] = await pool.query(
      `SELECT id, owner_id, company_name FROM crm_customer c WHERE c.id = ? AND c.deleted_at IS NULL AND ${clause}`,
      [customerId, ...params]
    );
    if (customers.length === 0) {
      throw new AppError(ErrorCodes.CUSTOMER_NOT_FOUND);
    }

    // 2. 目标用户校验：toUserId 必须是 status=1 的有效销售（非管理员/非禁用）
    if (toUserId) {
      const [targetUsers] = await pool.query(
        `SELECT u.id FROM sys_user u JOIN sys_role r ON u.role_id = r.id
         WHERE u.id = ? AND u.status = 1 AND u.deleted_at IS NULL AND r.code = 'sales'`,
        [toUserId]
      );
      if (targetUsers.length === 0) {
        throw new AppError(ErrorCodes.BUSINESS_VALIDATION, '目标用户不是有效的销售人员');
      }
    }
    // ... 后续 UPDATE 逻辑不变
  }
  ```
  路由层同步加 `checkDataPermission('customer', 'owner_id')`，controller 传 `req.dataPermission`。
- **关联**：`batchAssign` 同样需修复（已有事务保护，补归属校验即可）。`transferService`、`poolService.claimCustomer` 等涉及客户归属变更的方法都应排查。
- **参考**：CWE-639 IDOR；AGENTS.md 7.3「客户归属逻辑必须落到前端+后端+数据库三层」、7.17「并发抢客户必须有锁/约束」。

---

## Medium（计划修复，下个迭代）

### [M-001] 客户状态配置/流转规则缓存永不过期，无失效机制

- **位置**：`backend/services/customerService.js:82-100`
- **维度**：可维护性 / Bug
- **等级**：Medium
- **原因**：`statusConfigCache` 和 `statusTransitionCache` 是模块级变量，首次加载后永久缓存。管理员在 `sys_customer_status` / `sys_customer_status_transition` 表修改流转规则后，**必须重启服务才生效**，与 AGENTS.md 7.22「修改数据后是否清缓存」要求不符。
- **修复建议**：改用 `node-cache` 设 TTL（如 5 分钟），或在管理员修改规则后主动调用 `statusConfigCache = null` 失效。最低成本方案：
  ```js
  const NodeCache = require('node-cache');
  const statusCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
  async function loadStatusTransitions(pool) {
    const cached = statusCache.get('transitions');
    if (cached) return cached;
    const [rows] = await pool.query('SELECT from_code, to_code, require_permission, require_reason FROM sys_customer_status_transition');
    statusCache.set('transitions', rows);
    return rows;
  }
  ```

### [M-002] 验证码 key 使用非密码学安全随机数，可预测性较高

- **位置**：`backend/services/authService.js:94`
- **维度**：安全
- **等级**：Medium
- **原因**：验证码 key 由 `Date.now().toString(36) + Math.random().toString(36).substr(2, 6)` 生成。`Math.random()` 不是密码学安全 PRNG，且 `Date.now()` 可被攻击者观测（响应时序）。虽 key 本身不直接泄露验证码内容（验证码存在 Redis/Map 中按 key 索引），但若攻击者能预测 key，可结合验证码接口做时序攻击或枚举。风险中等，因验证码内容有 300s TTL 且校验后即删。
- **修复建议**：用 `crypto.randomBytes` 生成 key：
  ```js
  const key = crypto.randomBytes(16).toString('hex');
  ```

### [M-003] `update` controller 解构 body 后整体传 service，缺纵深防御字段过滤

- **位置**：`backend/controllers/customerController.js:69`
- **维度**：安全 / 可维护性
- **等级**：Medium
- **原因**：`const { id, ...updateFields } = req.body` 后将 `updateFields` 整体传给 `customerDetailService.updateCustomer`。虽路由层 `validate(updateCustomerSchema)` 配合 `stripUnknown: true` 已移除未知字段，但 service 层未再做白名单过滤。若未来有其他调用方绕过路由（如内部服务直接调用），可能传入非法字段。
- **修复建议**：service 层 `updateCustomer` 入口再做一次字段白名单 pick，形成纵深防御。

---

## Low（建议优化，有空再改）

### [L-001] `String.prototype.substr` 已废弃

- **位置**：`backend/services/authService.js:94`
- **维度**：质量
- **等级**：Low
- **原因**：`Math.random().toString(36).substr(2, 6)` 中 `substr` 已被 MDN 标记为 deprecated，未来 Node 版本可能移除。
- **修复**：改用 `substring(2, 8)` 或 `slice(2, 8)`。

### [L-002] app.js 含 130+ 行注释掉的模块挂载说明，影响可读性

- **位置**：`backend/app.js:284-417`
- **维度**：质量
- **等级**：Low
- **原因**：`// xxx 通过 ModuleRegistry 自动挂载（2026-09-24 迁移）` 类注释重复 50+ 行，这些信息应放在 `docs/` 迁移记录中，而非留在入口文件。
- **修复**：删除冗余注释，保留必要的非显而易见的设计说明。

### [L-003] controller 层 try/catch next(error) 模式重复度高

- **位置**：`backend/controllers/customerController.js`（全文件）
- **维度**：质量
- **等级**：Low
- **原因**：每个 async handler 都是 `try { ... } catch (error) { next(error) }`，20+ 个函数重复同一模式。
- **修复建议**：用高阶函数封装：
  ```js
  const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  // router.post('/forward', asyncHandler(customerController.forward))
  ```
  Express 5 已原生支持 async middleware，升级后可彻底消除。

---

## Info（参考建议）

### [I-001] 整体架构成熟度高

- 三层权限模型完善：`checkPermission`（功能权限）+ `checkDataPermission`（数据范围 all/dept/dept_and_sub/self/custom）+ `checkFieldPermission`（字段级敏感字段过滤），且 `buildOwnerOverrideFilter` 在服务端强制校验「按成员筛选」不越权。
- JWT 安全：httpOnly Cookie 传输、黑名单登出、DB 实时查角色（不依赖 payload 过期值）、强制改密白名单、生产环境强制 128 字符 hex secret。
- CSRF double-submit cookie 纵深防御，sameSite=strict。
- 文件上传：magic bytes 深度校验 + 扩展名/MIME 白名单 + 10MB 限制 + 内存存储（兼容 Serverless）。
- 统一错误处理：AppError + Joi + DB 错误映射，5xx 才告警，不向客户端泄露堆栈。
- 优雅关闭、unhandledRejection/uncaughtException 处理、Prometheus 指标、慢查询日志、Trace ID 链路追踪。

### [I-002] 敏感文件已正确忽略

`.gitignore` 已忽略 `.env` / `.env.local` / `.env.production` / `.env.secrets` / `.env.synology` / `nginx/certs/*` / `backend/.dev-token.txt`，未发现敏感文件入库。

### [I-003] 前端 XSS 防护到位

前端 130 个 `.vue` 文件中无 `v-html` / `innerHTML` / `dangerouslySetInnerHTML` 使用，且已引入 `dompurify` 依赖。

### [I-004] SQL 参数化查询主体良好

后端 service 层主体使用 `pool.query(sql, params)` 参数化查询。模板字符串拼接的多为：① 权限 WHERE 片段（`buildDataPermissionWhere` 返回参数化 clause）；② 表名/列名（经 `validateTable` 白名单或常量数组）；③ `IN (${ids.map(()=>'?').join(',')})` 占位符生成。**唯一例外是 [C-001] 的 `c.label`**，已单列 Critical。

---

## 修复优先级清单

| 优先级 | 问题 | 文件 | 建议操作 |
|--------|------|------|---------|
| P0 | [C-001] 存储型 SQL 注入 | customReportService.js:112 | 立即加 `sanitizeLabel` 白名单，阻断上线 |
| P1 | [H-001] forward/backward IDOR | routes/customers.js:186 + customerService.js:410 | 加 checkDataPermission + service 归属校验 |
| P1 | [H-002] assign IDOR + toUserId 未校验 | assignService.js:189 | 加归属校验 + 目标销售有效性校验 |
| P2 | [M-001] 状态缓存永不过期 | customerService.js:82 | 改 node-cache TTL 或主动失效 |
| P2 | [M-002] 验证码 key 弱随机 | authService.js:94 | 改 crypto.randomBytes |
| P2 | [M-003] update 缺纵深防御 | customerController.js:69 | service 层加字段白名单 |
| P3 | [L-001] substr 废弃 | authService.js:94 | 改 slice |
| P3 | [L-002] app.js 冗余注释 | app.js:284 | 清理 |
| P3 | [L-003] controller 重复模式 | customerController.js | asyncHandler 封装 |

---

## 检视统计汇总

| 维度 | 问题数 | Critical | High | Medium | Low | Info |
|------|--------|----------|------|--------|-----|------|
| 安全 | 5 | 1 | 2 | 1 | 0 | 1 |
| Bug | 1 | 0 | 0 | 1 | 0 | 0 |
| 可维护性 | 2 | 0 | 0 | 1 | 0 | 0 |
| 质量 | 3 | 0 | 0 | 0 | 3 | 0 |
| 综合 | — | — | — | — | — | 2 |

---

## 核心发现

1. **安全基线良好，但客户操作类端点普遍缺 `checkDataPermission`**：`list`/`detail`/`export` 等查询类端点都有数据权限，但 `forward`/`backward`/`assign`/`batchAssign` 等变更类端点缺失。建议系统性排查所有涉及单客户 ID 操作的 POST 端点，统一补齐 `checkDataPermission` + service 层归属校验。

2. **自定义报表是安全薄弱点**：`customReportService` 允许用户自定义报表配置（列/过滤/聚合），配置 JSON 中的 `label` 未校验直接进 SQL 标识符。这类「用户配置驱动的动态 SQL」是存储型注入的高危场景，应对所有从 config JSON 解析出并拼入 SQL 的值做白名单校验。

3. **架构可扩展性好，但缓存一致性需关注**：模块级永久缓存（`statusConfigCache`）在配置变更时不会失效。项目已引入 `node-cache` 和 Redis，应统一缓存策略，确保「写数据 → 清缓存」链路完整。

---

*报告生成：2026-10-09 | 检视范围：后端核心模块 + 前端核心模块 | 工具：CodeArts Work 代码检视*

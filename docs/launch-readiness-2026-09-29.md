# HUAKEYCRM 上线就绪度评估与收敛报告（2026-09-29）

- 评估对象：本仓库 `main` 分支，HEAD `8c246df`（fix(core): 补客户域三大模块 require）
- 评估方式：**本机实测** —— 后端 jest 全量 + 覆盖率、后端 eslint、域边界审计、前端 vitest/build、
  Express 挂载栈遍历（`app._router.stack`）、supertest 运行时探针（真实登录 + 真实 HTTP 调用）、
  MySQL 8.0 直查（数据分布 / 权限字典 / `schema_migrations`）、git 与迁移文件走查
- 评估边界：**未修改任何代码**（AGENTS.md 红线❷），所有临时探针脚本已删除；
  生产环境（NAS 192.168.0.200）与 GitHub Actions 实际运行状态**未在本机验证**，
  相关结论一律显式标注「未验证」
- 结论：**当前不具备上线条件** —— 4 个 P0（其中 3 个已在运行时复现）、7 个 P1

---

## 一、结论（TL;DR）

代码底子不差：后端 lint 零错误、域边界审计通过、并发认领已是原子实现、数据集无孤儿记录、
认证覆盖 100%。**卡点集中在三类系统性问题**，都不是"代码写得差"，而是"改动未收口"：

| 类别 | 表现 | 对应条目 |
|---|---|---|
| **注册/挂载顺序** | 模块注册晚于 Express 挂载循环 ⇒ 接口永久 404 | P0-2 |
| **数据不变量被破坏** | `owner_id IS NULL` 与 `pool_status='sea'` 已 100% 错位 ⇒ 公海池恒空 | P0-1 |
| **回滚链静默失效** | 回滚"看起来成功"实则跳过 + 097 回滚必然中断 | P0-3 |

另有 1 个发布流程级红线：待执行的迁移 `120` 会把 manager 提权到 boss 级系统权限（P0-4）。

**一句话给非工程同事**：系统的骨架是好的，但有三处"管道接错了"——公海池页面上一条客户都看不到、
三个接口对着空气喊话、出事时回不去上一版。修完这四件事，才谈得上灰度。

---

## 二、已实测通过（可直接作为验收证据）

| 项 | 实测命令 / 方式 | 结果 |
|---|---|---|
| 后端 lint | `cd backend && npm run lint` | **0 error** |
| 域边界审计 | `npm run audit:boundary` | **PASS**，0 新增越界（报价/商机/合同未越权改客户状态） |
| 后端测试（裸跑） | `cd backend && npm test` | 131 suites / 1314 tests：**128 通过 / 3 失败**，见下方"⚠️ 门禁诚实性" |
| 覆盖率 | 同上 | Statements 53.82% / Branches 36.23% / Functions 52.61% / Lines 57.03%（阈值 40/30/40/40） |
| 前端构建 | `cd frontend && npm run build` | 成功 |
| 前端测试 | `cd frontend && npm test` | **23 文件 / 145 用例全通过**，24.9s（另有一次并行高负载运行出现 3 例 30s 超时，见 P1-2） |
| 并发抢客户 | 代码走查 + 现有用例 | `UPDATE ... WHERE id=? AND owner_id IS NULL AND deleted_at IS NULL` + `affectedRows!==1`，**非"先查后改"**（`services/poolService.js:130`、`:192`；`services/customerService.js:519`） |
| 数据洁净度 | SQL 全表扫描 | 无孤儿/悬挂记录；字符集 100% `utf8mb4_unicode_ci`；`.env` 已在 `.gitignore` |
| 认证覆盖 | 路由静态扫描 | 0 个路由缺失认证中间件 |

### ⚠️ 门禁诚实性（必须一并记录，否则"绿"会被误读）

1. **本机裸跑 `npm test` 是红的**：3 个"真连库"套件共 **11 例失败**，报
   `Access denied for user 'root'@'localhost' (using password: NO)`。
   原因：这些用例的凭据默认值是 `process.env.DB_USER || 'root'` / `DB_PASSWORD || ''`
   （如 `tests/db/customerListBusinessStatus.test.js:26-28`、`tests/db/contactSinglePrimary.test.js:28-30`、
   `tests/db/customerListSoftDelete.test.js:27-29`），与 `.env` 的 `crm_user` 不一致。
   **补上正确凭据后 11/11 全通过**（实测命令见第八章），故**不是业务缺陷，是环境依赖**。
2. **本机有 110 条迁移回滚用例从未真正执行，却计入"通过"**：
   `tests/db/migration-roundtrip.test.js` 在 `beforeAll` 里因上述同样的凭据问题认证失败，
   走 `console.warn('DB 认证失败...跳过')` + `return`（该文件 `:107-108`），
   随后每个版本用例在 `:223-229` 早退。实测输出中该跳过警告出现 **110 次**，
   且文案写作"数据库不可达"（实为"认证失败"，文案误导）。
   CI 的 `migration-test` job 用 `MIGRATION_ROUNDTRIP_STRICT=1` 才会真正执行。
   ⇒ **本机的"全绿"不能作为迁移回滚能力的证据。**

---

## 三、P0：上线前必须闭环

### P0-1 「客户总览 → 待认领」（原公海池）恒为空，423 条无主客户无法认领

**现象（本机运行时实测，非推断）**

以 `demo_admin` 登录后调用真实接口：

| 接口 | 实测返回 |
|---|---|
| `POST /api/v1/pool`（前端「待认领」页） | `total = 0` |
| `POST /api/v1/customers/list`（正式客户列表） | `total = 424`（**把 423 条无主客户当成"正式客户"**） |
| `POST /api/v1/leads`（潜客池） | `total = 423` |

同期数据库直查：

| 判据 | 行数 |
|---|---|
| `deleted_at IS NULL` | 424 |
| `owner_id IS NULL`（MASTER_SPEC §3.3 的唯一"公海"标准） | **423** |
| `pool_status = 'sea'`（旧判据） | **0** |
| `pool_status = 'private'` | 424 |

**根因**：两套判据并存，且数据侧已完全错位。

- 前端意图是 `owner_id` 为空：`frontend/src/views/pool/List.vue:240` 注释明写
  "pending → /pool：只返回无负责人客户（原「公海池」）"，`:242` 据此调用 `/pool`。
- 后端实际按 `pool_status` 过滤：`services/customerService.js:892`
  （`WHERE ... AND c.pool_status = ? AND c.business_status != ?`）。
- 全表 `pool_status='sea'` 为 0 行 ⇒ **该接口恒返回空**，且与数据权限无关（谓词本身就无行可命中）。
- 同一文件里还有一条**语义正确但零引用**的旧实现：`services/poolService.js:33`
  （`WHERE c.owner_id IS NULL AND c.deleted_at IS NULL`），已被架空成死代码。

**影响**：核心获客流程（认领公海客户）在页面上不可用；同时"正式客户列表"混入 423 条无主客户，
"潜客池"显示 423 条——三个页面互相矛盾。

**修法（三条缺一不可）**

1. **数据修复迁移**：`UPDATE crm_customer SET pool_status = IF(owner_id IS NULL,'sea','private') WHERE deleted_at IS NULL`
   （并核对 `business_status` 语义），附 down 脚本；
2. **判据收敛**：列表/认领/释放统一以 `owner_id IS NULL` 为准，`pool_status` 降级为只读兼容字段
   （与 MASTER_SPEC §3.3、`.claude/CLAUDE.md` §17.1 一致）；
3. **回归保护**：补一条不变量测试（`owner_id IS NULL ⇔ pool_status='sea'`），防止再次错位。

**⚠️ 未验证**：生产库是否同样错位。风险高（本机与生产同源迁移 110），**必须到 NAS 上核对**。

---

### P0-2 三个接口实测 404（模块注册晚于挂载循环）

**实测（supertest，真实登录后调用）**

| 实测请求 | 结果 | 对照 |
|---|---|---|
| `GET /api/v1/platform/keys` | **404** | `GET /api/v1/api-platform/keys` → **200** |
| `POST /api/v1/metrics/client` | **404** | — |
| `GET /api/v1/cron/clean-logs` | **404** | — |

**根因**

- `backend/core/ModuleRegistry.js:31` 的前缀取自**注册名**：`prefix: \`/${name}\``。
  `routes/api-platform.js:275` 注册为 `'api-platform'` ⇒ 实际前缀 `/api-platform`；
  而前端 `frontend/src/api/system.js:75-83` 共 **11 处**调用 `/platform/*`。
  ⇒ **"开放平台"配置页（`views/settings/api-platform.vue`，路由可达）11 个操作全部 404**
  （后端该模块 12 个端点前端零调用）。
- `app.js:357` 的挂载循环只取一次 `registry.getAllRoutes()` 快照；
  `app.js:421`（`require('./routes/cronJobs')`）与 `app.js:512`（`require('./routes/metrics')`）
  都在该行**之后** ⇒ 这两个模块注册了但永远不被挂载。
  - `/cron/*` 共 4 个运维端点（`daily-scoring` / `clean-logs` / `auto-release` / `generate-reminders`）失效；
  - `/metrics/client` 是前端生产环境性能上报入口（`frontend/src/utils/perfume.js:9`，`sendBeacon`），
    **静默失败**（sendBeacon 无回调），生产性能数据一直在丢。
- 这与最近一次提交 `8c246df` 修的是**同一类事故**（customers/pool/leads 曾因此 404）。

**修法**：把 `cronJobs` / `metrics` 的 `require` 移到 `app.js:357` 之前（与 `8c246df` 的修法一致）；
`/platform` 与 `/api-platform` 二选一（推荐改前端调用，或后端加一条兼容挂载，**不要两个都留**）。
建议在 CI 加一条静态回归检查（扫描 `registry.register` 与挂载循环的先后顺序）。

**⚠️ 勿误改**：`GET /api/v1/metrics`（Prometheus，管理员专用）是 `app.js:502` 的**内联路由**，
工作正常，与本条无关。

---

### P0-3 迁移回滚链静默失效（红线❾"备份必须验证可恢复"的孪生项）

**问题 A：回滚会"看起来成功"，实则静默跳过**

`database/migrations/run_migrations.js:161`：

```js
const downFile = name.replace('.sql', '_down.sql')   // name 取自 schema_migrations.name
const downPath = path.join(MIGRATIONS_DIR, downFile)
if (!fs.existsSync(downPath)) {
  console.warn(`  ⚠ 版本 ${version} 缺少回滚文件: ${downFile}，跳过（迁移不可逆）`)
  continue                                            // ← 不报错、不中断
}
```

本机 `schema_migrations` 共 116 行，其中 **84 行的 `name` 不含 `.sql` 后缀**（实测 SQL 见第八章）
⇒ `replace` 成为空操作 ⇒ `existsSync` 失败 ⇒ 打印警告后 `continue`。
被跳过的行**仍留在 `schema_migrations` 表中**，版本表与真实结构就此漂移，
后续正向迁移也不会再补 ⇒ 回滚后系统处于"版本号说 A、结构是 B"的状态。

> 注：`down` 脚本覆盖度本身并不差——实测正向迁移 117 个 / down 脚本 116 个（仅 `119` 缺）。
> 问题不在"缺文件"，而在**查找逻辑对 84 行登记失效 + 跳过被当成正常**。
> 另外 `tests/db/migration-roundtrip.test.js:217` 的断言 `withDown >= 17` 是过时弱断言，建议收紧到与正向迁移数对齐。

**问题 B：`097_down` 在真实数据上必然中断**

`database/migrations/097_customer_business_status_and_pool_enum_down.sql` 步骤 1 的恢复语句
带 `WHERE c.deleted_at IS NULL`，而本机实测：

| 实测项 | 结果 |
|---|---|
| `_migration_097_backup` 备份表存在？ | 是，**424 行** |
| `crm_customer` 总行数 | 426 |
| 已软删除、且**备份表中无对应行**的行数 | **2**（id 635 / 636，`pool_status='private'`，备份旧值 NULL） |

⇒ 这 2 行永远不会被步骤 1 转换，紧接着的
`ALTER TABLE crm_customer MODIFY COLUMN pool_status TINYINT` 立即报
**`Incorrect integer value: 'private' for column 'pool_status'`**（本机已实测复现）
⇒ `run_migrations.js:180` 的 `catch` 走 `process.exit(1)`，**回滚链中断在中途**，
`097` 之后的版本全部别想回滚。

**修法**：① 按 version 前缀匹配文件（不依赖 `name` 字段格式）；② 跳过必须显式失败，
或仅在显式 `--force` 下允许；③ 修复 `097_down`（去掉 `deleted_at IS NULL` 限定或用 `ELSE` 兜底）；
④ 统一 `schema_migrations.name` 的写入格式（本机 116 行里 84 行无后缀、32 行有后缀，属历史双写）。

---

### P0-4 待执行的迁移 `120` 会把 manager 提权到 boss 级（发布流程红线）

`database/migrations/120_manager_full_permissions.sql`（**未提交、未执行**，但已在迁移目录内）：

```sql
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT 2, rp.permission_id FROM sys_role_permission rp WHERE rp.role_id = 1;
```

- 其自述来源是"Phase 20 权限矩阵验证修复"（文件头注释），原因是 manager 只有 20 条权限码、
  boss 有 111 条，导致大量 manager 端点 403 —— **起因是真实问题，值得肯定**。
- 但解法是把 **boss 的全部 111 条**（含 `system:role:permission`、`backup:restore`、`system:user:*`
  等系统级权限）复制给 manager(role_id=2)，超出"功能权限对齐"的表述范围。
- 与既有约定冲突：`backend/scripts/init_role_permissions.js` 的 manager 白名单、
  `docs/crm-r07-manager-account-2026-09-17.md`。
- `120_manager_full_permissions_down.sql` 的回滚是 `DELETE FROM sys_role_permission WHERE role_id = 2`
  —— **会连 manager 原有的 20 条一起清空**，不是"恢复到迁移前"。
- **风险点**：本仓库发布流程（`.claude/CLAUDE.md` §15.1 第 3 步）就是执行 `node run_migrations.js`，
  该文件会**被自动执行**。

**处置**：上线前必须二选一 —— ① 移出 `migrations/`（或删除），另走权限设计评审；
② 保留但收窄范围（只对齐业务功能码，排除系统级码）+ 重写 down 脚本 + 更新文档。
**默认动作应是"不执行"。** 更精准的根因解法见 P1-1。

---

## 四、P1：上线前应闭环

### P1-1 权限字典三处漂移，7 个在用的权限码在本机库缺失
实测：本机 `sys_permission` 有 **112** 个码，路由 `checkPermission` 要求 **92** 个，其中 **7 个缺失**：

| 缺失权限码 | 出现位置（示例） | 受影响功能 |
|---|---|---|
| `file` | `routes/upload.js:132`（共 2 处） | 附件/文件 |
| `file:upload` | `routes/upload.js:126`（共 2 处） | **上传附件** |
| `recycle_bin:view` | `routes/recycle.js:39` | 回收站 |
| `data:restore` | `routes/recycle.js:75`（共 2 处） | 数据恢复 |
| `email:send` | `routes/email.js:147`（共 2 处） | 发邮件 |
| `purchase:request` | `routes/purchase/request.js:41` | 采购申请 |
| `purchase:comparison` | `routes/purchase/comparison.js:47` | 采购比价 |

这 7 个码在 `backend/scripts/init_role_permissions.js` 里**都存在**（脚本字典 114 个），
且 CI 正是用该脚本初始化权限（`.github/workflows/ci.yml:204`）
⇒ **CI 绿，门禁看不见这个缺口**；受影响的是**非 boss 角色**（销售上传附件即 403）。

**修法**：生产执行 `node scripts/init_role_permissions.js`（insert-only 幂等），
并用 `--force-clean` 复核一次；补一条"路由要求的权限码必须存在于字典"的自检。

### P1-2 前端质量门禁：无 ESLint，vitest 抖动
- `frontend/` 下**无任何 eslint/prettier 配置文件**，`package.json` 无 lint 脚本、无 eslint 依赖
  ⇒ AGENTS.md 第七章"代码质量"只对后端落地（后端有且 0 error）。
- 实测 `cd frontend && npm test`：**单独复跑 23 文件 / 145 用例全通过，24.9s**；
  但本轮评估中另一次运行（与后端 jest 并行、机器高负载）出现过 **3 个用例 30s 超时**。
  ⇒ 判定为**负载下的抖动**，非确定性失败；仍建议核对超时阈值或在 CI 中串行化，避免门禁偶发变红。

### P1-3 生产 MySQL 容器无时区设置
`docker-compose.synology.yml` 的 `mysql` 服务**无 `TZ`、command 无 `--default-time-zone`**
（同文件的 `app` 与 `backup` 都有 `TZ: Asia/Shanghai`）
⇒ `NOW()` / `CURDATE()` 与业务时区不一致，慢查询日志时间戳亦偏移（AGENTS.md 第七章"时区"）。
**修法**：加 `TZ: Asia/Shanghai` + `--default-time-zone=+08:00`，并核对既有时间字段是否受影响。

### P1-4 部分模块无数据权限配置行 ⇒ 经理被静默降级为"仅自己"
`middleware/permission.js` 的 `checkDataPermission` 在 `sys_data_permission` 无匹配行时 fail-closed 为 `{type:'self'}`。
实测本机 `sys_data_permission` 现有 17 个 module（approval、competitor、contract、customer、finance、
invoice、knowledge、opportunity、payment、product、purchase、quotation、report、service、supplier、survey、system），
而路由实际使用的 module 里 **3 个无任何配置行：`analysis`、`followup`、`quote`**
⇒ 经理看不到本部门数据，且**表现为"没有数据"而不是报错**，极难排查。
**修法**：补齐配置行 + 加一条启动自检（路由用到的 module 必须存在配置行）。

### P1-5 测试会覆写真实 `.env`
`backend/tests/drill-alerts.test.js:123` 直接对仓库根 `.env` 做 **覆盖式写入**，`:118` 在 `afterAll` 还原。
本轮实测旁证：运行 `npm test` 后 `.env` 内容与备份一致（已还原），**但 mtime 已变**
（`17:26:26` → `17:26:43`）。若测试中途崩溃/被 kill，`.env` 将残留 `DRILL_TEST_KEY=loaded_value` 且**丢失原内容**。
**修法**：改用临时文件 + 环境变量注入（或 mock dotenv 的路径解析）。

### P1-6 仓库卫生：12 个临时脚本被提交进 HEAD
`git ls-tree -r --name-only HEAD | grep '^tmp_'` = **12 个**（由最近一次提交 `8c246df` 带入）：
`tmp_debug_perms.sh`、`tmp_path_probe2.js`、`tmp_pm_final.js`、`tmp_pm_v2.js`、`tmp_q.sql`、`tmp_q2.sql`、
`tmp_q3.sql`、`tmp_q4.sql`、`tmp_routes2.js`、`tmp_routes3.js`、`tmp_routes4.js`、`tmp_routes_dump.js`。
当前工作区这 12 个显示为**未提交的删除**；另有 `tmp_diff.sql`、`tmp_pm_v3.js` 未跟踪。
**修法**：提交这批删除 + `.gitignore` 增加 `tmp_*`。

### P1-7 同一业务动作存在两条链路 / 两套实现
- **释放公海**：`POST /api/v1/pool/release`（入参 `{id, reason}`，`frontend/src/api/pool.js:36`）与
  `POST /api/v1/customers/release`（入参 `{customer_id}`，`frontend/src/api/customer.js:61`）
  —— 前端**两条都在调**，后端两套实现、两套入参 schema（实测两个端点均可达，各自返回自己的 Joi 校验错误）。
- **认领**：`services/poolService.js` 的 `claimCustomer`（判据 `owner_id IS NULL`，**线上在用**）与
  `services/customerService.js:507` 的 `claimCustomer`（判据 `pool_status !== 'sea'`，
  仅被测试引用、无路由调用）语义互斥——后者若被重新挂载，P0-1 的 423 条客户将无法认领。
**建议**：各留一条，另一条删除并在文档中登记。

---

## 五、需拍板事项（非技术问题）

| # | 事项 | 说明 |
|---|---|---|
| 1 | **迁移 120 的范围** | manager 是否应获得 boss 的系统级权限（角色权限分配、备份恢复、用户管理）？见 P0-4 |
| 2 | **boss 是否绕过功能权限** | 代码现状是绕过（`middleware/permission.js:21` / `:62`：`ADMIN_ROLE_CODES.has(req.user.roleCode) \|\| req.user.manageAll`），MASTER_SPEC §5.1 写的是"不绕过功能权限检查" —— **文档与实现必须二选一** |
| 3 | **`pool_status` 最终语义** | 保留为只读兼容字段，还是彻底废弃？决定 P0-1 的修法深度 |
| 4 | **零调用端点的去留** | 静态比对显示约 100 个后端端点前端从未调用（`/invoice` 6/6、`/upload/list`、`/upload/delete` 等）。**未逐条复核**，需业务确认是"预留"还是"废弃" |
| 5 | **生产是否允许一次性数据修复迁移** | P0-1 的 423 行 `pool_status` 回填 |
| 6 | **MASTER_SPEC §5.2 描述已过期** | 该节称"权限/数据权限缓存仅靠 5 分钟 TTL 失效，属已知 P3 待优化"，而代码已实现完整的主动失效（角色权限/数据权限/权限节点变更均调 `clearPermissionCache` / `clearAllPermissionCache` + `clearMeCache`）。需更正文档 |

---

## 六、未验证清单（必须到 NAS / CI 才能确认）

以下各项**本机无法验证**，一律标注「未验证」，不得当作已通过：

1. **生产库迁移进度与 `schema_migrations` 一致性** —— 本机开发副本已执行到 `119`，`120` 待执行；
   生产（NAS 192.168.0.200）实际执行到哪一版**未验证**。参考：`docs/archive/production-baseline-2026-08-07.md`
   是 2026-08-07 的基线，而 `112`–`120` 均在此之后。
2. **生产库是否同样存在 423 行 `pool_status` 错位**（同源迁移 ⇒ 风险高）。
3. **GitHub Actions 最近一次运行结论** —— 本机未做 `gh` 认证，CI 实际状态**未验证**。
4. **备份可恢复性演练** —— `deploy/backup/restore-test.sh` 从未在本机跑过；
   按红线❾，"导出过 SQL" ≠ "能恢复"。
5. **6 个 cron 定时任务在生产是否按点执行**（`backend/cron/scheduler.js` 的 02:00 / 03:00 / 03:30 / 00:45 / 01:00 / 08:30），
   以及是否有执行日志可查。注意：**调度本身由 `node-cron` 在进程内运行，不依赖 P0-2 的 `/cron` 路由**，
   但手动触发与外部平台触发不可用。
6. **DSM 层 nginx 配置不在容器备份范围内**（`deploy/backup/container-backup.sh` 自述的已知限制）。
7. **生产容器的 `ENABLE_SWAGGER` / `CORS_ORIGIN` / `ALERT_ENABLED` 等实际取值**。

---

## 七、收敛顺序建议

| 批次 | 内容 | 预估 |
|---|---|---|
| **第 1 批（P0）** | P0-2 修 `require` 顺序（改动最小、影响面清晰）→ 拍板 P0-4（迁移 120 去留）→ P0-1（数据回填 + 判据统一 + 不变量测试）→ P0-3 修回滚链（查找逻辑 + 097_down + 跳过改报错） | 1–2 天 |
| **第 2 批（P1）** | 权限字典补齐 + 自检 → `.env` 测试隔离 → MySQL 容器时区 → 数据权限配置行 → 前端 ESLint 配置补齐 + 测试超时核对 → 仓库清理 | 1–2 天 |
| **第 3 批（验证）** | 到生产环境逐条核对第六章 7 项 → 备份恢复演练 → 灰度发布 | 1 天 |
| **收尾** | 更正 MASTER_SPEC / AGENTS 与实现不一致处（第五章 #2、#6），产出《全面体检报告 V1》，按九步循环进入 Phase 1 | — |

---

## 八、本机实测环境与复现命令

- 环境：Windows 11 / Node（后端 Express 4 + mysql2）、本机 MySQL 8.0（开发副本 `huakey_crm`，
  **非生产库**；测试库 `huakey_crm_test`）、Redis 已连接、`NODE_ENV=test` + `SKIP_CAPTCHA=true` 用于探针
- 数据快照：`crm_customer` 未删除 424 行（`owner_id IS NULL` 423、`pool_status='sea'` 0、`'private'` 424）；
  `schema_migrations` 116 行（其中 84 行 `name` 无 `.sql` 后缀）；`sys_permission` 112 码；
  `sys_data_permission` 覆盖 17 个 module

```bash
# 1) 后端门禁与覆盖率（裸跑为红：3 套件 11 例，属凭据环境依赖）
cd backend && npm run lint && npm test

# 2) 真连库套件用正确凭据复跑 ⇒ 11/11 通过（证明 P1 门禁诚实性第 1 条）
DB_USER=crm_user DB_PASSWORD=<pwd> DB_NAME=huakey_crm_test DB_HOST=127.0.0.1 DB_PORT=3306 \
  npx jest tests/db/contactSinglePrimary.test.js tests/db/customerListBusinessStatus.test.js \
            tests/db/customerListSoftDelete.test.js --forceExit

# 3) 挂载点与 404 复现（supertest 直连 app，不启服务）
#    POST /api/v1/auth/login {username:'demo_admin',password:'Demo@123456',captcha:'abcd'}
#    GET  /api/v1/platform/keys        → 404       GET /api/v1/api-platform/keys → 200
#    POST /api/v1/metrics/client       → 404
#    GET  /api/v1/cron/clean-logs      → 404
#    POST /api/v1/pool                 → total=0   POST /api/v1/customers/list → total=424

# 4) 数据不变量与回滚链证据
mysql -u <user> -p huakey_crm -e "
  SELECT owner_id IS NULL AS owner为空, pool_status, COUNT(*) FROM crm_customer
   WHERE deleted_at IS NULL GROUP BY 1,2;
  SELECT SUM(name NOT LIKE '%.sql') AS 无后缀, COUNT(*) AS 总数 FROM schema_migrations;
  SELECT (SELECT COUNT(*) FROM _migration_097_backup) AS 备份行数,
         (SELECT COUNT(*) FROM crm_customer c LEFT JOIN _migration_097_backup b ON c.id=b.id
           WHERE b.id IS NULL AND c.deleted_at IS NOT NULL) AS 已删除且无备份行;"

# 5) 权限字典缺口
#    对比 backend/routes/**/*.js 的 checkPermission('code') 与 sys_permission.code
#    结果：7 个码缺失（file / file:upload / recycle_bin:view / data:restore /
#          email:send / purchase:request / purchase:comparison）
```

---

*评估：Claude Code（AI 助手）｜ 日期：2026-09-29 ｜ 依据：后端 jest 全量 + 覆盖率、eslint、域边界审计、
前端 vitest/build、Express `app._router.stack` 挂载栈遍历、supertest 真实登录与 HTTP 探针（`/platform`、`/api-platform`、
`/metrics/client`、`/cron/*`、`/pool`、`/customers/list`、`/leads`）、MySQL 直查（客户分布 / 权限字典 /
`sys_data_permission` / `schema_migrations` / `_migration_097_backup`）、迁移与 compose 文件走查、git 对象走查。
本报告未修改任何代码；生产环境与 CI 实际状态未在本机验证，相关条目已标注「未验证」。*

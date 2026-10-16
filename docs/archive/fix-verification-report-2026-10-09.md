# P0 回归修复完成报告 · 2026-10-09

> 结论：**8 个回归套件已全部修复，测试回到基线，CI lint 通过。**
> 原报告的 4 项 P0 全部收口，另新增 7 个安全回归测试。

---

## 一、最终验证结果（实测）

### 1.1 全量测试 —— 已回到基线

| 指标 | 改动前基线 | 修复前 | **修复后** | 判定 |
|---|---|---|---|---|
| Test Suites 失败 | 10 | 18 | **10** | PASS 与基线一致 |
| Test Suites 通过 | 135 | 127 | **135** | PASS |
| Tests 失败 | 36 | 55 | **36** | PASS 与基线一致 |
| Tests 通过 | 1388 | 1369 | **1395** | PASS **+7** |

失败套件清单与基线**逐条比对完全相同**（`db/*` 3 个、`e2e/*.integration` 5 个、`security/cors`、`security/rateLimit`），
全部源于环境（`crm_test` 账号被拒、沙箱 `cmd.exe EBUSY`），**与本轮改动无关**。

> 通过用例 +7 的来源：本次新增的 H-002 安全回归测试（见 §三）。

### 1.2 Lint —— CI 命令通过

```
cd backend && npm run lint   →  eslint .   →  exit 0
```
**2 warnings / 0 errors**。注意 CI 用的是 `eslint .`（**不带 `--max-warnings=0`**），warning 不阻断构建。

---

## 二、修复清单（8 个回归套件 + 1 处 CI 隐患）

| # | 文件 | 问题 | 修法 |
|---|---|---|---|
| 1 | `controllers/quoteController.js` | 本轮新引入的 `AppError`/`ErrorCodes` 未使用导入 | 删除（第 7-8 行） |
| 2 | `services/userRouteService.js` | `POOL_STATUS` 未使用导入 | 删除 |
| 3 | `tests/unit/services-assignService.test.js` | mock 顺序错位 | **重写为按 SQL 内容路由的 `createRoutedPool`** |
| 4 | `tests/transferService.test.js` | 断言文案过时 | 改为 `/接收人不存在、已停用或非业务角色/` |
| 5 | `tests/assign.test.js` | `mockPool.query` 少 1 次 mock | 补 `validateTargetUser` + `user status` |
| 6 | `tests/businessFlow.customer.test.js` | 同上（商机+报价两处） | 各补 `[H-005]`/`[H-003]` 权限校验 mock |
| 7 | `tests/e2e/release-smoke-test.spec.js` | 商机 3 处 + 报价 4b | 补权限校验 mock |
| 8 | `tests/e2e/opportunity-flow.spec.js` | 1.1 / 1.3 / 1.4 三处 | 补权限校验 mock |
| 9 | `tests/e2e/rbac-business-flow.spec.js` | sales 角色 `getDataPermissions` 返回 undefined | 补 `mockResolvedValue` |
| 10 | `tests/boundary.test.js` | 5 处商机用例 500 | 加 `installDefaultQuery()` 默认实现 |

### 关键改进：不再用「按序 mock」
原测试全用 `mockResolvedValueOnce` 按顺序喂返回值，**新增任何一次查询就会整体错位**——这正是本轮 19 个用例失败的根因。

- `services-assignService.test.js` → 新增 `createRoutedPool(routes)`，按 SQL 文本匹配
- `boundary.test.js` → 新增 `installDefaultQuery()`，按 SQL 语义分流

配套踩坑记录：`jest.clearAllMocks()` / `mockReset()` **会清掉 `mockImplementation`**，
所以 `installDefaultQuery()` 必须在每个 `beforeEach` 里重新调用（已在 4 处 `beforeEach` 补齐）。

---

## 三之二、安全修复的单测覆盖（后续补充，同日完成）

新增文件：`backend/tests/security/securityFixes20261009.test.js`（**23 个用例，5 项修复全覆盖**）

### 覆盖矩阵

| 修复项 | 用例数 | 关键断言 |
|---|---|---|
| **C-001** 报表列别名防注入 | 7 | 反引号/UNION/分号/DROP/单引号均兜底为 `col`；合法中文别名不误伤；>60 字符截断；四种聚合全覆盖 |
| **H-003** 跨客户建报价 | 5 | 越权 → 403 且 **`createQuote` 未被调用**（必须拦在业务写入前）；权限 clause 走占位符不内联 |
| **H-004** 转他人报价为合同 | 3 | `getQuote` 返回 null → 403 且不转合同；**权限 clause 确实透传给 getQuote** |
| **H-005** 跨客户建商机 | 3 | 越权 → 403 且 `createOpportunity` 未被调用；clause 走占位符 |
| **M-008** 转移接收人角色 | 5 | HR/停用角色被拒；**白名单恰为 sales/manager/boss/super_admin**；SQL 不得硬编码 roleId |

### ⭐ 变异测试验证有效性（关键，非形式化）

**全绿不等于有效**。对 3 项修复做了「故意回退 → 确认测试报警 → 恢复」：

| 变异内容 | 报警用例数 | 判定 |
|---|---|---|
| `sanitizeLabel` 改为直接返回原值（模拟 C-001 回退） | **5** | PASS 精准捕获 |
| 删除 H-003 整个权限校验块 | **2** | PASS 精准捕获 |
| M-008 白名单加入 `hr`,`finance` | **1** | PASS 精准捕获 |

恢复后 `git diff --stat` 确认三个源文件行数（15/18/8）与变异前**完全一致**，
`grep -rn "MUTATION"` 全库**零残留**。

### 最终全量结果

| 指标 | 基线 | 仅修回归 | **+ 安全单测** |
|---|---|---|---|
| Test Suites 失败 | 10 | 10 | **10**（一致） |
| Tests 失败 | 36 | 36 | **36**（一致） |
| Tests 通过 | 1388 | 1395 | **1418**（+23） |

新增文件在 `eslint --max-warnings=0` 严格标准下 **0 error 0 warning**；
`cd backend && npm run lint` → **exit 0**。

---

## 三之三、第二批修复的测试覆盖（后续补充，同日完成）

新增文件：`backend/tests/security/securityFixes20261009b.test.js`（**27 个用例**）

| 修复项 | 用例数 | 关键断言 |
|---|---|---|
| **M-005** 转移历史数据权限 | 4 | 越权 → 403 且 `listByCustomer` **未被调用**；clause 走占位符；`deleted_at IS NULL` 不得被误删 |
| **M-006** Redis 不暴露端口 | 4 | `redis.ports` 不存在；**`REDIS_HOST` 必须是 `redis` 而非 `127.0.0.1`**（否则容器内连自己） |
| **M-007** healthcheck + 持久化 | 7 | healthcheck 路径与 `app.js:515`+`:299` **交叉验证**；uploads 为 bind mount；mem_limit 换算为 512×1024×1024 字节 |
| **M-002/L-001** 验证码随机性 | 7 | key 为 32 位小写 hex；50 次全唯一；**mock 掉 `Math.random`/`Date.now` 后 key 仍唯一**（证明不依赖非密码学源） |
| compose 健壮性 | 5 | 无废弃 `version` 字段；四服务齐备；启动命令先迁移后启服务 |

### M-006/M-007 的测试方式（部署配置 ≠ JS 代码）
compose 是部署配置，jest 无法直接验证其语义。本文件用**双层验证**：
1. **静态 YAML 解析**（`js-yaml`）—— 断言字段存在/不存在，快、CI 友好
2. **实际执行 `docker compose config`** —— 由 Docker 官方解析器判定**最终生效配置**，能捕获缩进错误、变量插值、锚点展开问题

> ⚠️ **本机沙箱实测 `spawnSync docker EBUSY`**（与已知 `spawnSync cmd.exe EBUSY` 同源），
> 故第 2 层在本地被跳过。**已按铁律显式 `console.warn` 报告跳过原因（4 处），不静默放过。**
> 另在 Bash 中**手工执行过 `docker compose config` → exit 0**，并解析产物确认：
> `redis.ports = undefined`、`mem_limit = 536870912`、healthcheck 存在、uploads bind mount 已挂载。

### ⭐ 变异测试（第二批，同样执行）

| 变异内容 | 报警用例数 | 判定 |
|---|---|---|
| M-002 退回 `Date.now()+Math.random()` | **5** | PASS |
| M-005 删除整个权限校验块 | **3** | PASS |
| M-006 恢复 `redis.ports` 暴露 | **1** | PASS |

恢复后 `git diff --stat` 行数（10/3/19）与变异前完全一致，`grep -rn "MUTATION"` 零残留。

> 变异过程中发现：第一次用正则批量变异时 **M-006/M-005 的正则实际没生效**，
> 是靠 `grep` 复核 + 手工改才真正验证到。**变异必须确认「真的改上了」**，否则会得出假绿的结论。

### 最终全量结果（三轮累积）

| 指标 | 基线 | 现在 | 增量 |
|---|---|---|---|
| Test Suites 失败 | 10 | **10** | 一致 |
| Tests 失败 | 36 | **36** | 一致 |
| Tests 通过 | 1388 | **1445** | **+57** |

（+57 = H-002 的 7 + 第一批安全测试 23 + 本批 27）

---

## 三、新增安全回归测试（+7）

安全修复不能没有回归测试，否则下次改动必然重蹈覆辙。

### H-002 分配目标校验（`services-assignService.test.js`，6 个）
- 目标用户非在职业务角色 → 拒绝，且**不触碰客户表**
- 非 manageAll 操作者分配他人客户 → 拒绝
- manageAll 操作者 → 允许
- 无 `operatorUser`（向后兼容）→ 不拦截
- `batchAssign` 目标非法 → 拒绝且**不开事务**（`getConnection` 未被调用）
- `batchAssign` 静默跳过他���客户 → `count=0` 但**正常提交事务**

### H-002 端到端（`assign.test.js`，1 个）
- `to_user_id` 为非在职业务角色 → 返回非 200

---

## 四、逐项代码复核结论（未变更）

上一轮已静态核实、本轮未改动的部分，结论仍成立：

| 项 | 结论 |
|---|---|
| C-001 `sanitizeLabel` | 白名单 `/^[\w\u4e00-\u9fa5]+$/` + 长度 60 + 兜底 `'col'` —— PASS |
| H-003 / H-005 | `buildDataPermissionWhere` 确为 async，`await` 正确 —— PASS |
| H-004 | `getQuote(pool, id, permission)` 第三参数真实存在且实现无误 —— PASS |
| M-005 | `byCustomer` 已在 `pool.js:136` 挂 `checkDataPermission` —— PASS |
| M-006 | `REDIS_HOST: redis` 已显式设置，注释掉端口安全 —— PASS |
| M-007 | healthcheck `/api/v1/health` 与 `app.js:515`+`:299` 对得上；uploads 路径一致 —— PASS |
| M-002/L-001 | `crypto` 已在 `authService.js:8` 引入 —— PASS |
| M-008 | `JOIN sys_role` 按 code 判定，与 `ROLE_CODES` 一致 —— PASS |

---

## 五、剩余待办（如实标注）

| 优先级 | 事项 | 状态 |
|---|---|---|
| ~~P1~~ | ~~C-001 / H-003 / H-004 / H-005 / M-008 零单测覆盖~~ | ✅ 已补（23 用例） |
| ~~P2~~ | ~~M-005 / M-006 / M-007 / M-002 / L-001 无自动化测试~~ | ✅ 已补（27 用例） |
| P1 | **安全修复的 403 行为未做真库 E2E 验证** | **仍未验证**。`crm_test` 账号被拒，无法连库。当前只有 mock 层证据 |
| P1 | **`docker compose config` 未在 CI 内自动执行** | 本机沙箱 `spawnSync docker EBUSY`，测试中已显式跳过并告警。CI 有 Docker 时应能自动跑 |
| P2 | 打通 DB 测试环境（10 个既有失败） | 未做，环境权限问题 |
| P2 | `customerService.js:83` `loadStatusConfig` warning | **有意保留**，见下 |
| — | 提交 | 未提交（按 David 要求暂缓） |

### ⚠️ 关于「单测通过」的边界（务必知情）
两批共 50 个用例均在 **mock 层 / 静态解析层**验证，锁定的是「控制器在业务写入前拦截」+「SQL 走占位符」+「角色白名单精确」+「配置字段存在」。
**未覆盖**：
- 真实 MySQL 下的 clause 拼接是否语法正确、`sys_role.code` 与实际库数据是否一致
- `buildDataPermissionWhere` 各分支（dept / dept_and_sub）的真实行为
- 容器实际启动后 healthcheck 是否真的转 healthy、uploads 挂载是否真的可写

这些需要 DB / Docker 环境打通后补 E2E，**当前不得据此宣称两轮修复已在生产验证**。

### ⚠️ 关于「单测通过」的边界（务必知情）
本轮 23 个用例均在 **mock 层**验证，锁定的是「控制器在业务写入前拦截」+「SQL 走占位符」+「角色白名单精确」。
**未覆盖**：真实 MySQL 下的 clause 拼接是否语法正确、`sys_role.code` 与实际库数据是否一致、
`buildDataPermissionWhere` 各分支（dept / dept_and_sub）的真实行为。
这些需要 DB 环境打通后补 E2E，**当前不得据此宣称 5 项修复已在生产验证**。

### 关于 `loadStatusConfig` 的说明
该函数是 `customerService.js:1296` 注释明确记载的**有意保留项**：
> 「其中 SOURCE_PARENT_MAP / loadStatusConfig / loadStatusTransitions 仍为本文件内部实现（仅取消导出）」

它**不是本轮引入**（基线已存在），且删除会超出「修复回归」的范围。
因 CI 用 `eslint .` 不带 `--max-warnings=0`，**不影响构建**，故保留原样。
若要清理，建议单开一次死码清理并同步更新那段注释。

---

## 六、回滚

```bash
git checkout -- backend/tests/unit/services-assignService.test.js \
                backend/tests/transferService.test.js \
                backend/tests/assign.test.js \
                backend/tests/businessFlow.customer.test.js \
                backend/tests/boundary.test.js \
                backend/tests/e2e/opportunity-flow.spec.js \
                backend/tests/e2e/rbac-business-flow.spec.js \
                backend/tests/e2e/release-smoke-test.spec.js \
                backend/controllers/quoteController.js \
                backend/services/userRouteService.js
```
纯代码/测试修改，无数据库变更。修复前备份：`C:/Users/a8466/huakey-backup-2026-10-09.tar.gz`

# R-06 领域边界静态审计报告（2026-09-16）

> 编制：David ｜ 依据：PRD「架构铁律」（R-06 验收标准）+ `AGENTS.md` 第一节领域边界
> 工具：`backend/scripts/audit-domain-boundary.js`（本轮新增，可复现、可作 CI 卡点）
> 结论摘要：**RESULT: FAIL —— 16 处越界写 + 2 个跨模块 cron 作业**。R-06 的验收前提「证明无违规写操作与跨模块 cron」**当前不成立**。

---

## 一、被检验的规则（原文）

> 非 Customer 模块**仅允许 SELECT** `crm_customer`，禁止 UPDATE/DELETE、禁止下游反向改上游、禁止跨模块 cron 同步（违反 = P0 架构违规）。
> —— PRD《HuakeyCRM 下一步》「架构铁律」

## 二、方法与可复现命令

```bash
cd backend
node scripts/audit-domain-boundary.js            # 只报告（exit 0）
node scripts/audit-domain-boundary.js --strict   # 有违规 exit 1（CI 卡点用）
```
扫描范围：`controllers, routes, services, cron, workers, tools, utils, config, core, api, scripts`
（**排除** `tests/`：测试夹具写库属合法；排除 node_modules / coverage / backups / uploads / logs）。

扫描实现要点（三处易错，均已处理）：
1. **注释里的 SQL 不算命中** —— 否则把「说明文字」误报为违规；
2. **压平空白后回映射行号** —— SQL 是多行模板字符串，逐行正则必然漏；
3. **cron 必须溯源到真实模块** —— 只扫「哪个文件出现 `cron.schedule`」会**漏报**（真正的作业实现如
   `services/cronService.autoReleaseCustomers` 本身不含 `cron.schedule`）。

### 鉴别力自测（证明这个卡点不是摆设）

| 步骤 | 结果 |
|---|---|
| 注入探针 `services/__boundary_probe.js`（1 处 `UPDATE crm_customer`） | ✅ 报 `VIOLATION services/__boundary_probe.js:3` |
| `--strict` 退出码 | ✅ `1`（符合预期） |
| 删除探针后复跑 | ✅ 恢复为 16 处，探针文件确认已不存在 |

> 另有一次**自纠**：第一版 cron 检测误报「跨模块 cron 写客户 = 0 个」（假阴性）。修正为「按调度块解析
> require + 函数名映射 + 块内内联 SQL」后，检出 **2 个**真实作业。

---

## 三、扫描结果

### 3.1 【A】`crm_customer` 写操作 33 处 = 白名单 17 + **越界 16**

白名单（Customer 域内，允许）17 处：`customerService.js`(7)、`customerDetailService.js`(3)、
`poolService.js`(4)、`assignService.js`(3)。

**越界 16 处，涉及 9 个文件**：

| # | 位置 | 写什么 | 性质判定 |
|---|---|---|---|
| 1 | `services/automationService.js:84` | `SET owner_id`（自动化「分配客户」动作） | 🔴 真越界：自动化引擎写客户归属，**无归属守卫** |
| 2 | `services/automationService.js:107` | `SET ${白名单字段}`（自动化「更新字段」） | 🔴 真越界：跨模块写客户任意字段（列名动态拼接） |
| 3 | `services/automationService.js:111` | `SET business_status = CASE ?` | 🔴 真越界 **+ 规则重复实现**：又写了一遍 `status → business_status` 映射（第 2 份实现） |
| 4 | `services/automationService.js:306` | `SET owner_id`（轮询分配 round-robin） | 🔴 真越界：与 `assignService` 职责重叠 |
| 5 | `services/cronService.js:136` | `SET pool_status/owner_id/status`（公海自动回收） | 🔴 真越界 **且属「跨模块 cron 同步」**（PRD 明文禁止） |
| 6 | `services/followUpService.js:47` | `SET last_follow_time / 跟进状态 / 生命周期状态` | 🟠 越界：跟进域写客户冗余列 |
| 7 | `services/followUpService.js:124` | `SET last_follow_time`（事务内） | 🟠 同上 |
| 8 | `services/followUpService.js:374` | `SET last_follow_time` | 🟠 同上 |
| 9 | `services/followUpService.js:539` | `SET last_follow_time` | 🟠 同上 |
| 10 | `services/importService.js:153` | `INSERT INTO crm_customer`（批量导入） | 🟠 越界：导入域直接建客户 |
| 11 | `services/scoringRouteService.js:158` | `SET score` | 🔴 真越界：评分域反写客户域 |
| 12 | `services/transferService.js:144` | `SET owner_id/pool_status`（接受转移，**带原负责人守卫**） | 🟡 越界但业务核心：客户转移本属客户域能力 |
| 13 | `services/userRouteService.js:204` | `SET owner_id = NULL`（离职交接→公海） | 🟡 越界但业务核心：与已确认规则「离职即 owner_id=NULL」一致 |
| 14 | `scripts/auto_release.js:41` | `SET pool_status/owner_id/protect_until` | 🟡 运维脚本：与 #5 **同一逻辑的第 2 份实现** |
| 15–16 | `scripts/verify-transfer-sql.js:172,183` | 转移负例验证 | ⚪ 测试性质脚本，越界但无害 |

### 3.2 【B】定时任务 7 个，**2 个写 `crm_customer`**（跨模块 cron 同步）

| 计划 | 调用模块 | 写入表 | 判定 |
|---|---|---|---|
| `0 2 * * *` | `utils/qualification-reminder.js` | crm_qualification_reminder, crm_supplier_qualification | — |
| `0 3 * * *` | （块内内联 SQL） | sys_log | — |
| `30 3 * * *` | （块内内联 SQL） | sys_token_blacklist | — |
| **`45 0 * * *`** | **`services/transferService.js`** | **crm_customer**, crm_customer_transfer, crm_pool_log | ❌ 跨模块 cron 写客户 |
| **`0 1 * * *`** | **`services/cronService.js`** + `utils/config.js` | **crm_customer**, crm_follow_up_reminder, crm_pool_log, sys_log | ❌ 跨模块 cron 写客户 |
| `30 8 * * *` | `scripts/generate_reminders.js` | crm_follow_up_reminder | — |
| `0 4 * * 1` | `services/supplierScoringService.js` | crm_supplier, crm_supplier_rating | — |

### 3.3 【C】客户相关表写点 19 处（不违规，供审阅）

`crm_contact` 8 处（contactRouteService / customerDetailService / importService）、
`crm_follow_up` 7 处（followUpService）、`crm_customer_tag` 4 处（automationService / tagRouteService）。

---

## 四、比"16 处"更要紧的三个系统性发现

1. **同一规则存在多份实现（漂移源）**
   - `status → business_status` 映射：`customerService.mapStatusToBusinessStatus` **与** `automationService:111` 的 CASE 各一份；
   - 公海回收：`cronService.autoReleaseCustomers` **与** `scripts/auto_release.js` 各一份；
   - 客户归属变更散落 **6 处**（transferService / userRouteService / automationService×2 / cronService / auto_release.js），
     其中**只有** `transferService` 带「原负责人」并发守卫 —— 其余各处没有等价守卫。
2. **R-06 的验收标准当前被证伪**（不是"未验证"，是"已确认为 FAIL"）。PRD 假设「静态扫描证明无违规」，
   实际扫描出 16 + 2 项。
3. **元问题：「Customer 模块」边界无任何文档定义**。本报告的白名单是我**按代码职责推断**的
   （`customerService` / `customerDetailService` / `poolService` / `assignService` / `routes/{customers,leads,pool}.js`）。
   边界不签字，卡点就无法稳定红/绿 —— 这是 R-06 落地的前置条件。

---

## 五、待 David 决策（二选一，可分批）

**方案 A —— 承认现状，扩白名单（低成本，不治理）**
把 `transferService`、`userRouteService`、`followUpService`、`importService` 纳入「客户域合作方」白名单，
保留 `automationService` / `scoringRouteService` / `cronService` 为违规并限期整改。
→ 代价：铁律被实质放宽，须同步修订 PRD 措辞。

**方案 B —— 真治理，收敛写点（推荐，但需分批 + 回归）**
在客户域暴露受控写接口（如 `customerService.applyAutomationMutation(...)` /
`markLastFollowTime(...)`），让其余模块**只能经此写客户**；`cronService` 的回收逻辑改调客户域能力。
→ 代价：触及冻结模块边界，须走 RFC；建议按「automationService（4 处，无守卫，风险最高）→ cronService → scoring/followUp → import」分批。

**前置动作（建议先做，与方案无关）**：
1. 出一份《模块归属与写入权限矩阵》，把「哪些文件属于 Customer 域」写死并签字；
2. 把 `node scripts/audit-domain-boundary.js --strict` 接入 CI（R-06 要求的"CI 卡点"），
   初期用**基线白名单**（把现有 16 处登记为已知，只拦**新增**违规）——这样卡点立刻可用，
   又不阻塞既存技术债的排期整改。

---

## 六、局限（照实声明）

- 只匹配 `crm_customer` **字面量**；通过变量拼接表名（`UPDATE ${t}`）或视图间接触发的写会漏报。
- 只扫 `.js`；`database/migrations/*.sql` 与 `deploy/*.sql` 不在本规则范围（迁移本就有权改结构）。
- 注释判定为「整行以 `//` 或 `*` 开头」，行尾注释里的 SQL 仍计入命中（**宁多报不漏报**）。
- cron 溯源依赖 `cron/scheduler.js` + 解构 `require` 的写法；若日后换成动态注册（配置表驱动），需同步扩展脚本。

---

## 七、附：本轮同时复核的 R-04

| 项 | 结果 |
|---|---|
| 后端单元测试全量（`npx jest`） | 111 套件通过；3 套件失败 —— 失败原因全为 `Access denied for user 'root'@'localhost' (using password: NO)`（**是我漏传 DB 凭据的环境问题**，非代码缺陷） |
| 带凭据复跑 `tests/db`（真连库） | ✅ **6 套件 / 78 用例全部通过** |
| 结论 | **R-04 判定 PASS**（CI 的 `backend-test` 作业亦为绿）；本地跑库测试必须带 `DB_USER/DB_PASSWORD/DB_HOST/DB_PORT/DB_NAME` |

---

## 八、卡点落地（同日追加）：ratchet 模式 + 模块归属矩阵

### 8.1 为什么用 ratchet 而不是直接清零

PRD 的验收是「静态扫描 + **CI 卡点 PASS**」。存量 16 处 + 2 个 cron 不可能一轮清零，
若卡点直接判 FAIL 则永远进不去 CI。故采用业界常用的 **ratchet（棘轮）**：
存量债登记为已知，**只拦新增**；债务清掉后基线必须同步收缩，否则脚本报"可收缩"提示 —— 防止基线悄悄注水。

### 8.2 新增文件

| 文件 | 作用 |
|---|---|
| `backend/scripts/domain-boundary-baseline.json` | 存量债基线：按「文件 + 写入动词 + 允许条数」登记（**不记行号**，避免行号漂移误判）；含 `review_by`（2026-10-15，过期即 FAIL） |
| `docs/crm-module-ownership-matrix-2026-09-16.md` | 《模块归属与写入权限矩阵》草案：把「谁是 Customer 域」写死（7 个文件），并列出 9 个存量债文件的模块归属；附 4 条待签字确认项 |

### 8.3 脚本增强

- 新增 `loadBaseline()` / `baselineExpired()`；支持 `BOUNDARY_BASELINE=<path>` 指向自定义基线（便于自测）
- 输出区分 **白名单 / 存量债（基线放行）/ 🆕 新增**；`--strict` **只在有新增越界或基线过期时 exit 1**
- 新增三处防护：基线缺失 → FAIL；基线过期 → FAIL；条目可收缩 → 提示
- cron 基线键容错（`45 0 * * *` 与 `[45 0 * * *]` 均可）

### 8.4 鉴别力验证（5/5，全部实测）

| 场景 | 期望 | 实测 |
|---|---|---|
| 基线现状 | PASS / exit 0 | ✅ exit=0（白名单 17 + 存量债 16 + 2 cron + 新增 0） |
| 注入新增越界文件 | FAIL / exit 1 | ✅ exit=1（新增 1 处） |
| 基线条数收紧（4→3） | FAIL / exit 1 | ✅ exit=1（新增 1 处） |
| 基线过期（review_by=2020-01-01） | FAIL / exit 1 | ✅ exit=1（含过期提示） |
| 债务已清（放宽到 5） | PASS + 收缩提示 | ✅ exit=0 + ♻️ 提示 1 条 |
| 基线文件缺失 | FAIL / exit 1 | ✅ exit=1（防"没有基线就当通过"） |

### 8.5 结论更新

| 项 | 之前 | 现在 |
|---|---|---|
| R-06「静态扫描」 | ✅ 有工具 | ✅ 工具 + 基线 + 矩阵文档 |
| R-06「CI 卡点 PASS」 | ❌ 无卡点，且存量 16 处直接判 FAIL | ✅ **卡点已可用**（`npm run audit:boundary:strict` → exit 0），CI 接入待你确认后执行（本次未改 `ci.yml`） |
| 存量债 | 未登记 | ✅ 已登记 16 处 + 2 cron，含 `review_by` 到期强制重评审 |
| 边界定义（元问题） | 无任何文档 | ✅ 矩阵草案待签字（4 条确认项） |

**剩余唯一决策**：存量债的整改顺序（建议 automationService → cronService → scoring → followUp → import → scripts），
以及 `sys_data_permission` 是否给 manager 配 `data_scope='dept'`。

---

## 九、存量债整改（第 1 项已完成）：automationService 4 处 → 客户域受控入口

按建议顺序，先做风险最高、且**可以做到行为完全不变**的一项：`services/automationService.js`（4 处直接写 + 重复实现状态映射）。

### 9.1 做法

| 位置 | 收敛方式 |
|---|---|
| 新增 `customerService.systemAssignOwner(pool, customerId, toUserId)` | 系统级归属变更（原 `assign` 与「轮询分配」两处写点）；**刻意不做** pool_status / 审计日志等副作用（区别于业务级 `assignCustomer`） |
| 新增 `customerService.systemUpdateField(pool, customerId, field, value)` | 系统级字段更新；白名单与原 `ALLOWED_FIELDS` **逐字一致**；`status` 变更时用**单一来源** `mapStatusToBusinessStatus` 同步（`?? 'following'` 以复刻原 `ELSE` 分支） |
| `automationService` 4 处直接 UPDATE | 全部改为调用上述两个入口；**删除其内联的 `status→business_status` CASE 映射** |

**边界账变化**：白名单 17 → **20**（新增受控入口自身 3 处写点）；存量债 16 → **12**；新增越界 0。

### 9.2 「行为不变」的三重证据

| # | 证据 | 结果 |
|---|---|---|
| 1 | 单测**行为等价对照**：以改动前的内联 CASE 为参照实现，对 `lead/following/quoted/negotiating/signed/lost/sea/paused/未知值/null/undefined` **逐个比对** business_status 落库值 | ✅ 12/12 一致 |
| 2 | 既有 `services-automationService.test.js`（回归） | ✅ 通过（其中 1 条断言原为「必须出现 `business_status = CASE`」的实现细节，已更新为「必须出现 `SET business_status = ?` 同步」——**意图不变**） |
| 3 | **真库冒烟**（并还原原值） | ✅ `systemAssignOwner(1,2)`→owner_id=2；`status=negotiating`→同步 negotiating；`status=paused`→business_status=**following**；`level=B`→不触发同步；白名单外字段→抛 `FIELD_NOT_ALLOWED`；随后原值全部还原 |

附带效果：系统性发现①「同一规则多份实现」的**第一项（状态映射 ×2）已消除**。

### 9.3 回归与副作用

- 后端全量：**117 套件通过 / 1 失败**（1150 用例中 1148 通过）；唯一失败为 `tests/db/contactSinglePrimary.test.js`，
  属**已知的本地测试库现象**（跑 `tests/db` 会令 `schema_migrations` 回退到 109、唯一索引消失），与本次改动无关；
  跑完后已按迁移重建并复核（max=114、索引在位）。
- 未发现行为变化；`assignee` 白名单字段的**历史笔误**（该列并不存在）保持原样以保证行为不变，建议单独提 issue。

### 9.4 下一步（按同一顺序）

`cronService`（公海自动回收）→ `scoringRouteService` → `followUpService`（4 处）→ `importService` → `scripts`（3 处）。
其中「加归属守卫」属行为变更，需产品确认；**纯收敛（行为不变）可继续按本轮方式推进**。

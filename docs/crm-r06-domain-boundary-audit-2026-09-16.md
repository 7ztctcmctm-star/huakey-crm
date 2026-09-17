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

---

## 十、存量债整改（第 2 项已完成）：公海自动回收迁入客户域

### 10.1 判断：这不只是「写点位置不对」，而是**规则放错了域**

`cronService.autoReleaseCustomers` 是一整条业务规则：选超期未跟进客户 → 事务内批量释放 → 写公海日志 → SSE 通知原负责人。
「公海回收」本属**客户域**规则，却落在定时任务服务里。因此本轮不是把一条 SQL 搬走，而是**整条规则迁入 `poolService`**。

| 项 | 内容 |
|---|---|
| 迁入 | `poolService.autoReleaseCustomers(pool, releaseDays)`（实现逐字迁移：事务边界、批量 SQL、公海日志、SSE 通知、返回条数均未改） |
| 保留 | `cronService.autoReleaseCustomers` 改为**同名薄委托**，避免改动既有调用方（`cron/scheduler.js`、`routes/cronJobs.js`） |
| 注意 | 与 `poolService.batchReleaseCustomers`（**用户侧释放**：逐条权限校验、上限 100、`action='release'`）语义不同，**不可混用**；已在两处写明区别 |

### 10.2 边界账

| 项 | 变化 |
|---|---|
| 白名单 | 20 → **21**（公海域新增 1 处批量释放写点） |
| 存量债 | 12 → **11** |
| **跨模块 cron 作业** | **2 → 1**（`0 1 * * *` 作业不再直接写客户表 ⇒ 该 cron 基线条目同步删除） |
| 新增越界 | 0（卡点 PASS，`--strict` exit 0） |

> ✅ **棘轮机制按设计工作**：本次改完**未动基线**时，脚本主动报
> `♻️ 基线可收缩：services/cronService.js UPDATE 基线 1 → 实际 0` —— 正是「防基线注水」那道防线。

### 10.3 验证

| # | 证据 | 结果 |
|---|---|---|
| 1 | cron 相关测试（`services-cronService` / `cron` / `cronJobs`） | ✅ **26/26 通过**（3 套件） |
| 2 | **真库冒烟（可完全还原）** | ✅ 把样本客户改成「100 天未跟进」→ 调用 `autoReleaseCustomers(15)` 返回 **1**；释放后 `pool_status=sea / owner_id=NULL / protect_until=NULL / status=sea`；公海日志新增 1 条（`action='auto_release', from_user_id=3`）；随后**原值全部还原、新增日志已删** |
| 3 | 后端全量回归 | ✅ **118 套件 / 1150 用例 全过**（本轮无任何失败） |
| 4 | 依赖与循环 | ✅ 两个模块均可正常加载；`poolService` 不反向依赖 `cronService` |

### 10.4 顺带发现（未修，建议单独提 issue）

`scripts/auto_release.js` 的释放 SQL **独缺 `status='sea'`** —— 客户域内的释放（`poolService` 单条/批量、已迁入的自动回收）都会同步 `status`，
唯独该脚本只改 `pool_status/owner_id/protect_until`。用它释放的客户会停在 `pool_status='sea'` 而 `status='following'` 的**不一致状态**。
修复属行为变更（且该脚本可能是历史运维工具），需确认后再动。

### 10.5 下一步

`scoringRouteService`（1 处）→ `followUpService`（4 处）→ `importService`（1 处）→ `scripts`（3 处）+ `transferService` 的跨模块 cron。

---

## 十一、存量债整改（第 3 批已完成）：评分 / 转移 / 运维脚本 —— **跨模块 cron 清零**

### 11.1 三处收敛

| 目标 | 做法 | 备注 |
|---|---|---|
| `services/scoringRouteService.js`（1 处） | 新增 `customerService.systemUpdateScore(pool, customerId, score)`，评分写入改走该入口 | 窄接口，仅 `score` 一列 |
| `services/transferService.js`（1 处） | 新增 `customerService.systemAcceptTransfer(pool, customerId, toUserId, fromUserId)`，**保留原并发守卫**（`AND owner_id = fromUserId`，`affectedRows=0` 表示期间被他人接手，由调用方在同事务回滚） | 与 `assignCustomer` 区分：不清 `protect_until`、不写 `assign_log` |
| `scripts/auto_release.js`（1 处） | 改为**薄封装**调用 `poolService.autoReleaseCustomers` | 同时修掉三个真实缺陷，见 11.2 |

### 11.2 `auto_release.js` 的三个真实缺陷（David 已确认可改）

| # | 缺陷 | 证据 |
|---|---|---|
| ① | 选客条件 `status != 0` 在 status 改为**字符串**后**恒不成立**（MySQL 将 `'following'` 当 0 比较） | 实测：`status IS NOT NULL = 1` 而 **`status != 0 = 0`** ⇒ **该脚本从未释放过任何客户** |
| ② | 释放时**未同步** `status='sea'` ⇒ 留下 `pool_status='sea'` 而 `status='following'` 的不一致状态 | 对比 `poolService` 内所有释放路径均同步 status |
| ③ | 逐条 autocommit、**无事务** ⇒ 中途失败留半释放状态 | 原实现为 for 循环内两条独立 `pool.query` |

⇒ 现统一走客户域规则：**事务 + 公海日志 + status 同步 + SSE 通知**，与系统定时任务（`cron/scheduler.js` 01:00 作业）实现完全一致；`AUTO_RELEASE_DAYS` 环境变量仍可覆盖超期天数，缺省取系统配置。

### 11.3 边界账

| 项 | 变化 |
|---|---|
| 白名单 | 21 → **23** |
| 存量债 | 11 → **8** |
| **跨模块 cron 作业** | **1 → 0 ✅ 已清零**（transferService 不再写客户表 ⇒ 其 cron 作业不再被标记） |
| 新增越界 | 0（`--strict` exit 0，且基线无"可收缩"提示） |

### 11.4 验证

| # | 证据 | 结果 |
|---|---|---|
| 1 | 新增单测 `tests/unit/customerSystemWrite2.test.js`（评分 SQL / 转移守卫 SQL / 守卫失效返回 0 / 无额外副作用 / 三个源码守卫） | ✅ 与既有相关套件合计 **53/53 通过**（含 `transferService`、`scoring` 回归） |
| 2 | **真库冒烟（含还原）** | ✅ `systemUpdateScore(77)`→库内 77；`systemAcceptTransfer` 守卫**未命中**（错 from）→ `affectedRows=0` 且 owner 不变；**命中** → `affectedRows=1`、owner 变更、`pool_status=private`、`last_follow_time` 刷新；随后原值全部还原 |
| 3 | **子进程真实运行 `auto_release.js`**（`AUTO_RELEASE_DAYS=15`，样本客户改为 100 天未跟进） | ✅ 输出「已释放 1 个客户（含公海日志与状态同步）」；库内 `pool_status=sea / owner_id=NULL / status=sea`（**不再不一致**）；公海日志 +1；随后还原并删除该日志 |
| 4 | 后端全量回归 | 118 套件通过 / 1 失败（1156/1158 用例）；唯一失败为 `tests/db/contactSinglePrimary` —— **已知的本地测试库现象**（跑 `tests/db` 后 `schema_migrations` 回退 109、唯一索引消失），与本次改动无关；跑完后已按迁移重建并复核（max=114、索引在位） |

### 11.5 剩余存量债（8 处，跨模块 cron 已清零）

| 文件 | 处数 | 备注 |
|---|---|---|
| `services/followUpService.js` | 4 | 跟进模块（最大一块） |
| `scripts/verify-transfer-sql.js` | 2 | 测试性质的验证脚本；其写入用于负例验证，可能更适合移出扫描范围（需先确认口径） |
| `services/importService.js` | 1 | 数据导入 |
| `services/userRouteService.js` | 1 | 用户/离职交接（需注意与 R-07「经理账号」的边界） |

---

## 十二、存量债整改（第 4 批已完成）：跟进模块 4 处

### 12.1 判断：跟进动作引发的**客户派生状态**属客户域

`followUpService` 的 4 处写点全部是「记录/删除跟进、完成计划之后，维护**客户表上的派生状态**」——
客户自己的派生状态由客户域维护，因此新增 3 个受控入口（跟进模块调用）：

| 新入口 | 语义（逐字复刻原实现） | 原写点 |
|---|---|---|
| `customerService.systemApplyFollowUpEffect(pool, customerId)` | `last_follow_time=NOW()`；`follow_status`：NULL/「初次联系」→「跟进中」；`lifecycle_status`：`new`→`nurturing` | `addFollowUp` |
| `customerService.systemTouchLastFollowTime(pool, customerId)` | `last_follow_time=NOW()` | `batchAddFollowUp`、`completePlan` |
| `customerService.systemSetLastFollowTime(pool, customerId, at)` | 设为指定值；**传 null 置空**（删除最后一条跟进后回退） | `deleteFollowUp` |

> 批量补录处**把事务连接透传**给客户域（`systemTouchLastFollowTime(connection, …)`），保证仍是同一事务。

### 12.2 边界账

| 项 | 变化 |
|---|---|
| 白名单 | 23 → **26**（新增 3 个受控入口） |
| 存量债 | 8 → **4** |
| 新增越界 | 0（`--strict` exit 0；脚本先报 ♻️「followUpService 可收缩」→ 已同步下调基线） |

### 12.3 验证

| # | 证据 | 结果 |
|---|---|---|
| 1 | 新增 `tests/unit/customerSystemWrite3.test.js`（3 个入口的 SQL 语义 + 置空分支 + 源码守卫 + 事务连接透传） | ✅ 与 followUp 相关回归合计 **14/14 通过** |
| 2 | **真库冒烟（含还原）** | ✅ 造出 `follow_status=NULL / lifecycle_status='new' / last_follow_time=NULL` → `systemApplyFollowUpEffect` 后变为 **「跟进中」/`nurturing`/时间已刷新**；**幂等复调保持**（CASE 的 ELSE 分支）；`set(时间)`/`set(null)` 均正确；`touch` 刷新时间；随后原值还原 |
| 3 | 后端全量回归 | 119 套件通过 / 1 失败（1162/1164 用例） |
| 4 | 既有 `services-followUpService.test.js` 的 6 个用例曾失败 | ✅ 已修复：其 `jest.mock('../../services/customerService')` **只 mock 了 `transitionStatus`**，新增 3 个入口未在 mock 中 ⇒ 补进 mock（**未改任何业务断言**） |

### 12.4 关于「测试库回退到 109」的补充事实（本轮新增实测）

之前只到「触发链指向 `tests/setup-integration.js`」。本轮的**决定性实验**收窄了范围：

| 实验 | 结果 |
|---|---|
| **单独**运行 `npx jest tests/db/contactSinglePrimary.test.js`（带 DB 凭据） | ✅ 套件 5/5 通过，且**库完全未变**（`max=114`、`crm_customer_transfer` 在、唯一索引在） |
| **全量**运行 `npx jest`（含 tests/db） | ❌ 跑完后 `max=109`、`crm_customer_transfer` 与唯一索引消失（**本轮稳定复现 3 次**） |
| 恢复方式 | 重跑 `database/migrations/run_migrations.js` → 提示「本次执行了 5 个迁移」→ `max=114`、对象全部恢复 |
| 已排除 | `tests/backup.test.js` **mock 了 `execFile`**，不会真执行 mysqldump/恢复 ⇒ **不是它** |

⇒ 结论：**是「全量套件中的某个套件」导致回退，而非 `tests/db` 本身**；具体触发者**待定位**（候选方向：某套件写迁移账本或调用迁移回滚）。
在定位前，**建议约定：跑完后端全量测试后，若紧接着要跑 E2E，先核对测试库对象并在必要时重跑迁移**。

### 12.5 剩余存量债（4 处）

| 文件 | 处数 | 备注 |
|---|---|---|
| `scripts/verify-transfer-sql.js` | 2 | **口径问题**：其写入用于测试负例验证，建议改扫描口径移出范围（需确认） |
| `services/importService.js` | 1 | 数据导入 |
| `services/userRouteService.js` | 1 | 用户/离职交接（注意与 R-07「经理账号」的边界） |

> 累计成果：越界写 **16 → 4**；跨模块 cron **2 → 0**；占位白名单 **17 → 26**（受控入口 + 迁入的领域规则）。

---

## 十三、存量债清零（第 5 批）——**R-06 的 PRD 严格口径达成**

### 13.1 最后两处代码收敛

| 目标 | 做法 |
|---|---|
| `services/importService.js`（1 处 INSERT） | 新增 `customerService.systemCreateImportedCustomer(pool, fields)`；**取值与截断仍留在导入域**（导入解析属导入域职责），域内只负责落库并回传 `insertId` 供后续建主联系人 |
| `services/userRouteService.js`（1 处 UPDATE，离职交接） | 新增 `customerService.systemReleaseOwnedCustomersOnLeave(pool, userId)`；SQL **逐字保留**（含 `pool_type='public'`） |

### 13.2 扫描口径：把「真库核验脚本」显式排除（David 已确认）

`scripts/verify-transfer-sql.js` 是**真库核验工具**（文档头自述 + 事务内执行后 `ROLLBACK` + **无任何生产代码引用**），
其写入属**测试夹具/负例验证**，不属「生产模块越界写」的治理范围。故在扫描器中新增排除规则：

| 设计点 | 做法 |
|---|---|
| 规则要**窄** | 仅匹配 `^scripts/verify-[^/]+\.js$`；**禁止**排除 `services/`、`routes/`、`cron/`（那才是治理对象） |
| 不做**静默**排除 | 报告新增【D】段，显式列出排除数量与文件名（本轮：1 个） |
| 有元测试守住 | 单测断言该正则命中 `scripts/verify-transfer-sql.js`、**放过** `scripts/auto_release.js` / `services/*` / `routes/*` |
| 报告文案修正 | 存量债为 0 时输出 `RESULT: PASS（领域边界干净：无越界写、无跨模块 cron）`，不再沿用"存量债未清"（并复测 FAIL 分支未被破坏） |

### 13.3 边界账：**全部归零**

| 项 | 初值 | 现值 |
|---|---|---|
| 越界写 `crm_customer` | 16 | **0** ✅ |
| 跨模块 cron 作业 | 2 | **0** ✅ |
| 基线（已知债） | 16 + 2 | **空**（卡点已从 ratchet 升级为**零容忍门**） |
| 白名单（域内合法写点） | 17 | 28（受控入口 + 迁入的领域规则） |
| 新增越界 | — | 0 |

**⇒ 达成 PRD 对该项的验收口径**：「静态扫描证明**无**违规写操作与跨模块 cron」+ 卡点可入 CI。

### 13.4 验证

| # | 证据 | 结果 |
|---|---|---|
| 1 | 新增 `tests/unit/customerSystemWrite4.test.js`（两个入口的列/参数逐字对齐 + `insertId` 回传 + 排除规则元测试 + 源码守卫） | ✅ 随全量通过 |
| 2 | **真库冒烟（临时行，跑完删除）** | ✅ 导入建客户：`insertId` 有效、8 列值与传入一致；离职释放：`owner_id=NULL / pool_status=sea / pool_type=public`；临时行清理干净 |
| 3 | 全量回归 | 120 套件通过 / 1 失败（1168/1170 用例）；唯一失败为 `tests/db/contactSinglePrimary` 的**已知本地测试库现象** |
| 4 | **零容忍门复测**：注入探针文件 → `RESULT: FAIL`（rc=1）；清理后 → `RESULT: PASS（领域边界干净）`（rc=0） | ✅ 门仍然"有牙" |
| 5 | 基线文档与规则同步 | ✅ `domain-boundary-baseline.json` 的 `_desc/_howto` 已改为「当前为空 = 存量债已清零」并保留登记方法 |

### 13.5 遗留（不阻塞 R-06 验收，建议单独跟踪）

1. **`userRouteService` 离职释放与其它释放路径不一致**（本次收敛**刻意保持原行为**）：
   它**不同步 `status='sea'`**、**不写 `crm_pool_log`**；而 `poolService` 单条/批量释放、公海自动回收都会同步 status 并记公海日志。
   ⇒ 后果：离职释放的客户会停在 `pool_status='sea'` 但保留原 status；且**该次释放没有审计痕迹**。是否统一需产品确认。
2. `services/auto_release.js` 的历史问题已在本轮修掉（见 §十一），同类「状态不一致」问题建议做一次全局复查。
3. `crm_customer` 之外的客户域表（如 `crm_contact` / `crm_opportunity`）**尚未纳入边界扫描** —— 本轮口径只覆盖 `crm_customer`；
   如需扩展，建议下一轮扩大扫描面（口径变更需评审）。

# 模块归属与写入权限矩阵（草案 · 待签）

> 目的：R-06 的卡点需要一个**被定义过的边界**才能稳定红/绿。本文件把「谁是 Customer 域」显式写死，
> 作为 `backend/scripts/audit-domain-boundary.js` 的可执行口径来源（脚本内的白名单即是本表的机器可读形式）。
> 编制：David ｜ 版本：v1 草案 ｜ 日期：2026-09-16 ｜ **状态：待产品/架构签字**

---

## 一、规则（PRD「架构铁律」原文口径）

| 表 | Customer 域 | 非 Customer 模块 |
|---|---|---|
| `crm_customer` | 可 SELECT / INSERT / UPDATE / DELETE（软删） | **仅 SELECT**；禁止 UPDATE / DELETE |
| `crm_customer` 跨模块 cron | 允许（由客户域自身调度） | **禁止**（不得跨模块 cron 同步写客户） |

违规分级：**P0 架构违规**。

---

## 二、模块归属（文件级）

### 2.1 Customer 域（客户中心）—— 允许写 `crm_customer`

| 文件 | 职责 | 依据 |
|---|---|---|
| `services/customerService.js` | 客户主服务：状态流转、公海认领、归属变更 | 文件即客户域核心 |
| `services/customerDetailService.js` | 客户详情与编辑（`updateCustomer`/状态流转守卫） | 同上 |
| `services/poolService.js` | 公海池：释放 / 认领 / 转移 | 公海是客户归属状态的一部分 |
| `services/assignService.js` | 客户分配规则（归属计算） | 归属写入属客户域 |
| `routes/customers.js` | 客户中心 API（`/api/v1/customers/*`） | 入口层 |
| `routes/leads.js` | 潜客池 API（`/api/v1/leads`） | 潜客=客户生命周期前段 |
| `routes/pool.js` | 公海 API（`/api/v1/pool/*`） | 入口层 |

> 当前白名单写点合计 **21 处**（脚本实测，见 `ALLOWED` 输出）：
> 其中 17 处为原有业务写点，3 处为新增的对外受控入口，1 处为**迁入客户域的系统侧公海回收**（见下）。
> **新增写点必须同时改本表与脚本白名单** —— 这道人工摩擦是刻意的。

**对外受控入口（非 Customer 域模块唯一可用的写入方式）**

| 函数 | 用途 | 行为约束 |
|---|---|---|
| `customerService.systemAssignOwner(pool, customerId, toUserId)` | 系统级归属变更（自动化分配、轮询分配） | 仅 `owner_id` 一条 UPDATE；**不做** pool_status / 审计日志等副作用（区别于业务级 `assignCustomer`） |
| `customerService.systemUpdateField(pool, customerId, field, value)` | 系统级字段更新 | 白名单 `SYSTEM_UPDATABLE_FIELDS`；`field='status'` 时用**单一来源** `mapStatusToBusinessStatus` 同步 `business_status`（未知值回退 `following`） |
| `customerService.systemUpdateScore(pool, customerId, score)` | 系统级评分写入（评分模块） | 仅 `score` 一列 |
| `customerService.systemAcceptTransfer(pool, customerId, toUserId, fromUserId)` | 转移接收的归属变更（转移模块） | 带**原负责人并发守卫**（`AND owner_id = ?`）；`affectedRows=0` 表示期间被他人接手，由调用方在同事务内回滚 |
| `customerService.systemApplyFollowUpEffect(pool, customerId)` | 记录跟进后的客户派生状态（跟进模块） | `last_follow_time=NOW()`；跟进状态 NULL/「初次联系」→「跟进中」；生命周期 `new`→`nurturing` |
| `customerService.systemTouchLastFollowTime(pool, customerId)` | 刷新最后跟进时间（批量补录 / 完成计划） | `last_follow_time=NOW()`；批量场景**透传事务连接** |
| `customerService.systemSetLastFollowTime(pool, customerId, at)` | 最后跟进时间设为指定值或**置空**（删除跟进后回退） | 置空传 `null` |
| `customerService.systemCreateImportedCustomer(pool, fields)` | 导入创建客户（导入模块） | 列与顺序同原 INSERT；**取值/截断仍由导入域负责**；回传 `insertId` |
| `customerService.systemReleaseOwnedCustomersOnLeave(pool, userId)` | 离职交接：名下客户整体释放到公海 | SQL 逐字保留（含 `pool_type='public'`）；⚠️ **不同步 `status`、不写 `crm_pool_log`** —— 已知差异，见 §2.3 |

**本域内新增（原越界实现迁入）**

| 函数 | 原位置 | 说明 |
|---|---|---|
| `poolService.autoReleaseCustomers(pool, releaseDays)` | `services/cronService.js`（非客户域） | 系统侧公海自动回收（事务内批量释放 + 公海日志 + SSE 通知）。**「公海回收」本属客户域规则**，故整条迁入；`cronService` 仅保留同名薄委托以免改动调用方 |
| ⚠️ 与 `batchReleaseCustomers` 的区别 | — | 后者是**用户侧释放**（逐条权限校验、上限 100、`action='release'`）；前者是**系统侧自动回收**（按超期天数批量、`action='auto_release'`）。**不要混用** |

> ⚠️ 已知瑕疵（本次未顺手改，建议单独提 issue）：白名单里的 `assignee` 在 `crm_customer` 上**并不存在**（疑似历史笔误），
> 命中时会在 SQL 层报错 —— 这与收敛前的表现完全一致，故本次保持原状以保证「行为不变」。

### 2.2 非 Customer 模块（存量债所在）

**已收敛（2026-09-16 / 09-17）**：

| 文件 | 原越界写点 | 收敛方式 |
|---|---|---|
| `services/automationService.js` | 4 处 UPDATE | 改调 `customerService.systemAssignOwner` / `systemUpdateField`；**并删除其内联的 `status→business_status` CASE 映射（重复实现）** |
| `services/cronService.js` | 1 处 UPDATE + **1 个跨模块 cron 作业写入** | 公海自动回收整条规则**迁入** `poolService.autoReleaseCustomers`；cron 作业不再直接写客户表（该 cron 基线条目已删除） |
| `services/scoringRouteService.js` | 1 处 UPDATE | 改调 `customerService.systemUpdateScore` |
| `services/transferService.js` | 1 处 UPDATE（+ 曾被判为跨模块 cron） | 改调 `customerService.systemAcceptTransfer`（守卫语义不变）；连带 **cron 作业不再被标记 → 跨模块 cron 归零** |
| `scripts/auto_release.js` | 1 处 UPDATE | 改为薄封装调用 `poolService.autoReleaseCustomers`；**同时修掉三个真实缺陷**（见下） |
| `services/followUpService.js` | 4 处 UPDATE | 跟进派生状态改经 3 个受控入口（`systemApplyFollowUpEffect` / `systemTouchLastFollowTime` / `systemSetLastFollowTime`），批量场景透传事务连接 |
| `services/importService.js` | 1 处 INSERT | 改经 `systemCreateImportedCustomer`（取值/截断留在导入域） |
| `services/userRouteService.js` | 1 处 UPDATE | 改经 `systemReleaseOwnedCustomersOnLeave`（离职交接释放） |

### 2.3 扫描口径（重要）

| 项 | 约定 |
|---|---|
| 扫描对象 | `services/` `routes/` `cron/` `scripts/` 下的生产代码（`tests/` 本就排除） |
| **排除项** | `scripts/verify-*.js` —— **真库核验脚本**：写入为测试夹具/负例验证（事务内执行后 ROLLBACK，无生产引用）。规则必须窄，**禁止**用它排除 `services/`、`routes/`、`cron/`；排除数量在报告【D】段**显式列出**（不静默排除） |
| 表覆盖 | **仅 `crm_customer`**（本轮口径）。`crm_contact` / `crm_opportunity` 等尚未纳入，扩展需评审 |

**剩余存量债（0 处）** ✅：

> **已清零**：越界写 16 → **0**、跨模块 cron 2 → **0**。基线文件已置空 ⇒ 卡点由「棘轮」升级为**零容忍门**：
> 任何新增越界写/跨模块 cron 直接 FAIL（实测注入探针 → FAIL，清理后 → PASS）。

### 2.4 已知差异（未统一，需产品确认）

| 项 | 差异 | 影响 |
|---|---|---|
| `systemReleaseOwnedCustomersOnLeave`（离职释放） | 与客户域其它释放路径（`poolService` 单条/批量、公海自动回收）相比，**不同步 `status='sea'`**、**不写 `crm_pool_log`** | 客户会停在 `pool_status='sea'` 但保留原 status；该次释放**无审计痕迹** |

> 🔧 **`scripts/auto_release.js` 修掉的三处真实缺陷**（David 已确认可改）：
> ① 选客条件 `status != 0` 在 status 改为字符串后**恒不成立**（MySQL 把 `'following'` 当 0）——实测该脚本**从未释放过任何客户**；
> ② 释放时未同步 `status='sea'`，会留下 `pool_status='sea'` 而 `status='following'` 的**不一致状态**；
> ③ 逐条 autocommit 无事务，中途失败会留半释放状态。现统一走客户域规则：事务 + 日志 + 状态同步 + SSE。

**剩余存量债（0 处）** ✅：

| 文件 | 模块 | 现状（越界写点数） |
|---|---|---|
| — | — | **无** |

**合计 0 处** + **0 个跨模块 cron 作业** ✅（**均已清零**，PRD 严格口径达成）

---

## 三、卡点口径（ratchet 模式，已可启用）

| 项 | 说明 |
|---|---|
| 判定 | **只看新增**：存量债登记在 `backend/scripts/domain-boundary-baseline.json`（按「文件+动词+允许条数」） |
| 通过条件 | 新增越界 0 处 且 新增跨模块 cron 0 个 且 基线未过期 |
| 防"注水" | 债务清掉后脚本提示 ♻️ **可收缩**条目，需同步下调基线 |
| 防"没基线就放行" | 基线文件缺失 → 直接 FAIL |
| 防"基线永久冻结" | 基线含 `review_by`；过期即 FAIL，强制重新评审 |
| 命令 | `npm run audit:boundary`（报告）/ `npm run audit:boundary:strict`（卡点，新增越界 exit 1） |

**鉴别力已实测（5/5）**：新增文件→FAIL；基线条数收紧→FAIL；基线过期→FAIL；债务清掉→PASS+收缩提示；基线缺失→FAIL。

> CI 接入（待你确认后再动 `ci.yml`，本次未改）：
> ```yaml
>       - run: cd backend && npm run audit:boundary:strict
> ```

---

## 四、签字确认项（4 条，需逐条确认）

| # | 待确认 | 建议 |
|---|---|---|
| 1 | 2.1 的 Customer 域文件清单是否完整/正确？ | 按代码职责推断，请确认是否有遗漏（如「客户导入」是否属客户域） |
| 2 | 是否认可「先拦新增、存量债限期整改」的 ratchet 策略？ | 建议认可；否则需先清零才能启用卡点 |
| 3 | 存量债整改顺序 | ✅ **全部完成**：automationService → cronService（含 cron）→ scoringRouteService → transferService → auto_release.js → followUpService → importService → userRouteService（`verify-transfer-sql.js` 按口径排除）。**存量债 16→0、跨模块 cron 2→0** |
| 4 | `sys_data_permission` 是否给 manager 配 `data_scope='dept'`？ | 影响全系统所有模块（含 R-05 团队筛选可见性），需单独拍板 |

签字：____________（产品）　　　____________（架构）　　　日期：__________

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

**剩余存量债（11 处）**：

| 文件 | 模块 | 现状（越界写点数） |
|---|---|---|
| `services/followUpService.js` | 跟进 | 4 |
| `scripts/verify-transfer-sql.js` | 运维验证脚本（测试性质） | 2 |
| `services/importService.js` | 数据导入 | 1 |
| `services/scoringRouteService.js` | 客户评分 | 1 |
| `services/transferService.js` | 客户转移 | 1 |
| `services/userRouteService.js` | 用户/离职交接 | 1 |
| `scripts/auto_release.js` | 运维脚本 | 1 |

**合计 11 处**（= 基线放行量）+ **1 个跨模块 cron 作业**：

| cron | 调用模块 | 说明 |
|---|---|---|
| `45 0 * * *` | `services/transferService.js`（`expireTransfers`） | 转移超时回收 |

> 📌 顺带发现（未修，建议单独提 issue）：`scripts/auto_release.js` 的释放 SQL **独缺 `status='sea'`**
> （客户域内的释放都会同步 status）⇒ 用该脚本释放的客户会停在 `pool_status='sea'` 但 `status='following'` 的不一致状态。
> 修复属行为变更，需确认。

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
| 3 | 存量债整改顺序 | 建议：~~automationService（4 处）~~ ✅ → ~~cronService 公海回收~~ ✅ → scoringRouteService → followUpService → importService → scripts |
| 4 | `sys_data_permission` 是否给 manager 配 `data_scope='dept'`？ | 影响全系统所有模块（含 R-05 团队筛选可见性），需单独拍板 |

签字：____________（产品）　　　____________（架构）　　　日期：__________

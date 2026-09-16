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

> 当前白名单写点合计 **17 处**（脚本实测，见 `ALLOWED` 输出）。
> **新增写点必须同时改本表与脚本白名单** —— 这道人工摩擦是刻意的。

### 2.2 非 Customer 模块（存量债所在）

| 文件 | 模块 | 现状（越界写点数） |
|---|---|---|
| `services/automationService.js` | 自动化引擎 | 4 |
| `services/followUpService.js` | 跟进 | 4 |
| `scripts/verify-transfer-sql.js` | 运维验证脚本（测试性质） | 2 |
| `services/cronService.js` | 定时任务 | 1 |
| `services/importService.js` | 数据导入 | 1 |
| `services/scoringRouteService.js` | 客户评分 | 1 |
| `services/transferService.js` | 客户转移 | 1 |
| `services/userRouteService.js` | 用户/离职交接 | 1 |
| `scripts/auto_release.js` | 运维脚本 | 1 |

**合计 16 处**（= 基线放行量）+ **2 个跨模块 cron 作业**：

| cron | 调用模块 | 说明 |
|---|---|---|
| `45 0 * * *` | `services/transferService.js`（`expireTransfers`） | 转移超时回收 |
| `0 1 * * *` | `services/cronService.js`（`autoReleaseCustomers`） | 公海自动回收 |

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
| 3 | 存量债整改顺序 | 建议：**automationService（4 处，无归属守卫，风险最高）→ cronService 公海回收 → scoringRouteService → followUpService → importService → scripts** |
| 4 | `sys_data_permission` 是否给 manager 配 `data_scope='dept'`？ | 影响全系统所有模块（含 R-05 团队筛选可见性），需单独拍板 |

签字：____________（产品）　　　____________（架构）　　　日期：__________

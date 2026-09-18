# RFC-R10：合同状态日志 + 状态流转规则矩阵（草案）

> 编制：David ｜ 状态：**DRAFT，待评审** ｜ 日期：2026-09-17
> PRD：R-10（Contract Center）｜ 冻结相关：**是**（新增冻结模块 Contract 的表 + 状态机）
> ⚠️ 本文件**仅评估，不落地改表**。未经拍板不得写迁移。

---

## 一、背景与问题

PRD R-10 要求：**合同状态变更留痕** + **状态流转规则矩阵在 API 层校验**。当前事实（实测）：

| 项 | 现状 |
|---|---|
| `crm_contract` 状态列 | `status TINYINT`、`approval_status TINYINT`（无独立状态字符串、无历史留痕表） |
| 状态变更留痕 | **无**（无 `crm_contract_status_log`；只有通用 `sys_operation_log` 记录请求，非业务状态语义） |
| 流转规则 | **散落在服务层**（如 `(来自 107) contract_approval_status_default`），无集中矩阵，无「禁止非法流转」的统一校验 |

**痛点**：无法回答「合同 X 在何时由谁从状态 A 改到状态 B」；非法流转（如 已签→草稿）只能靠各处零散判断，容易出现绕过。

## 二、目标（可判定）

1. 任一合同状态变更 → 写入 `crm_contract_status_log`（谁/何时/从→到/原因/关联审批）。
2. 所有状态变更**经统一入口**，入口内按**规则矩阵**校验；非法流转返回 400 且不落库。
3. 日志表与主表 `FK 一致`（PRD 验收原话：「日志表与主表 FK 一致」）。

## 三、方案（推荐 A）

### 方案 A：新增日志表 + 集中状态机（推荐）
- **新表** `crm_contract_status_log`（迁移号待定，本轮不动）：
  `id, contract_id, from_status, to_status, action, reason, operator_id, created_at`
  索引：`(contract_id, created_at)`；外键 `contract_id → crm_contract.id`。
- **状态机**：在 Contract 域内新增 `contractStatusService`，导出：
  - `TRANSITIONS` 矩阵（`from → [allowed to]`，附动作名与所需权限码）；
  - `transitionContract(conn, contractId, toStatus, action, reason, operatorId)` —— 事务内：校验矩阵 → `SELECT ... FOR UPDATE` → 更新主表 → 写日志。
- **改造点**：把现有散落的 `status` 写入点收敛到 `transitionContract`（类似客户域 `systemUpdateField` 的受控入口范式）。
- **API**：`GET /contract/:id/status-log`（分页）；状态变更仍走既有业务端点，内部改调 `transitionContract`。

### 方案 B：复用 `sys_operation_log`（不推荐）
零新表，但无法承载 `from→to` 语义与 FK 一致性，不满足 PRD 验收。

## 四、影响面

| 维度 | 影响 |
|---|---|
| 表结构 | 新增 1 表（冻结模块 Contract 的附属表）→ **需 RFC** |
| API 契约 | 新增只读端点 `status-log`；既有端点的**内部实现**改为受控入口（外部契约不变） |
| 权限 | 新权限码 `contract:status-log:view`（或复用 `contract:view`）；状态机动作校验所需权限 |
| 前端 | 合同详情页新增「状态历史时间线」（只读） |
| CI/基线 | 新表须并入 `deploy/init-complete.sql` 基线（`scripts/regen-init-baseline.js`） |
| 领域边界 | 新表属 Contract 域；非 Contract 模块不得写它（纳入 `audit-domain-boundary` 白名单/口径评估） |

## 五、风险与回滚

- 风险：状态机与既有散落判断**语义不一致** → 出现历史数据无法流转。**对策**：先对现存合同状态做一次全量快照 + 干跑（dry-run）比对。
- 回滚：新表可 `DROP`；代码层保留「旧路径」开关（默认新路径），异常时切回。

## 六、验收标准（PASS/FAIL）

- [ ] 任一状态变更后 `crm_contract_status_log` 有且仅有一条对应记录（谁/何时/from→to）。
- [ ] 非法流转被 API 层拒绝（400），主表**未被修改**。
- [ ] 日志 `contract_id` 外键有效（无孤儿）。
- [ ] 既有合同相关回归测试全绿。

## 七、待拍板（Open Questions）

1. **状态枚举以哪套为准**？现 `status TINYINT`（0/1/2…）与业务语义（草稿/审批中/已签/已回款…）的映射表由谁定义？
2. **矩阵粒度**：是否区分「角色可执行的动作」（boss 可签、sales 不可）？还是仅校验 from→to 合法？
3. **是否要回填历史**？对存量合同无法追溯的历史状态，是留空还是按当前状态补一条「初始」记录？
4. 排期归属：v1.1 末 还是 v2.0 初（PRD Q-5）？

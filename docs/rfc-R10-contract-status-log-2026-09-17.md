# RFC-R10：合同状态日志 + 状态流转矩阵 + 合同可见性

> **状态：ACCEPTED · 已拍板（2026-09-24）** ｜ **排期：v2.0 初实施** ｜ 按本 RFC 出迁移

| 项 | 内容 |
|---|---|
| RFC 编号 | **RFC-R10** |
| 所属 PRD | R-10（Contract Center） |
| 影响域 | 合同域（Contract），波及合同数据范围、创建守卫、报表 |
| 作者 | David |
| 创建日期 | 2026-09-17 |
| 拍板日期 | **2026-09-24**（守卫放宽、回填、日志外键 SET NULL） |
| 排期 | **v2.0 初** |
| 关联文档 | `docs/contract-status-definition.md`、RFC-R13、RFC-R12、RFC-R15c |

## 目录

1. [背景与问题](#一背景与问题)
2. [现状（实测）](#二现状实测)
3. [目标](#三目标)
4. [方案](#四方案)
5. [合同可见性规则](#五合同可见性规则)
6. [排查出的真实缺陷](#六排查出的真实缺陷)
7. [影响面](#七影响面)
8. [风险与回滚](#八风险与回滚)
9. [验收标准](#九验收标准)
10. [决策记录](#十决策记录)
11. [参考资料](#十一参考资料)

---

## 一、背景与问题

1. PRD R-10：合同状态变更留痕 + 流转矩阵在 API 层强制校验。
2. 合同可见范围需明确（业务规则见第五节）。
3. 排查中发现两个阻断主流程的真实缺陷（见第六节）。

## 二、现状（实测）

合同有**两类相互独立的状态**（权威定义见 `docs/contract-status-definition.md`）：

| 列 | 类型 | 枚举 |
|---|---|---|
| `status`（**履行状态**） | TINYINT NULL 默认 1 | **1 待执行 / 2 执行中 / 3 已完成（终态）/ 4 已取消（终态）** |
| `approval_status`（**审批状态**） | TINYINT NOT NULL 默认 **0** | **0 未提交 / 1 待审批 / 2 已通过 / 3 已拒绝** |

- 审批通过（approval_status→2）自动把履行状态 `1→2`（待执行→执行中）。
- 状态变更**无任何留痕表**；`sys_operation_log` 只记请求，无业务状态语义。
- 流转规则散落、无集中矩阵；终态锁定在 `/update` 路径不生效（`contract-status-definition.md` §7.1）。

> 注：`approval_status` 数据库默认值实测为 **0**（旧文档 §7.2 称默认 2，已修复/过期）。

## 三、目标

1. 任一合同**两类状态**变更均写入日志（谁 / 何时 / 从→到 / 原因 / 动作）。
2. 状态变更统一入口，按矩阵校验，非法流转 400 且不落库；终态锁定在所有写路径生效。
3. 日志表外键与全库日志范式一致。
4. 合同可见性按业务规则在后端强制（非仅前端隐藏）。

## 四、方案

### 4.1 新表 `crm_contract_status_log`（迁移号 v2.0 排）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT PK AUTO_INCREMENT | |
| `contract_id` | BIGINT **NULL** | FK → `crm_contract.id`，**ON DELETE SET NULL**（对齐 `crm_opportunity_stage_log` 等日志范式，保留痕迹） |
| `change_type` | VARCHAR(16) NOT NULL | `approval`（审批状态）/ `execution`（履行状态） |
| `from_status` | TINYINT NULL | 变更前（首次可空） |
| `to_status` | TINYINT NOT NULL | 变更后 |
| `action` | VARCHAR(32) NOT NULL | submit/approve/reject/start/complete/cancel |
| `change_reason` | VARCHAR(500) NULL | 变更/驳回原因 |
| `create_by` | BIGINT NOT NULL | 操作人（遵循 RFC-R13 标准列名） |
| `create_time` | DATETIME NOT NULL | 记录时间（遵循 RFC-R13，**勿用 created_at**） |

索引 `(contract_id, create_time)`。

### 4.2 集中状态机 `contractStatusService`

- 导出两套矩阵：审批流转（`0→1→2/3`）、履行流转（`1→2→3`、`1/2→4`，终态 3/4 不可变），每流转附动作名与权限码；
- `transitionContract(conn, contractId, changeType, toStatus, action, reason, operatorId)`：事务内「校验矩阵 → `SELECT ... FOR UPDATE` → 更新主表 → 写日志」；
- 现有散落写入点（含审批通过自动 1→2、`/update` 路径）全部收敛到该入口。

### 4.3 API

- 新增只读 `GET /contract/:id/status-log`（分页）；
- 状态变更仍走既有业务端点，内部改调统一入口，外部契约不变。

### 4.4 存量回填

- 对存量合同各补一条「初始」日志（`action=initial`，取合同主表 `create_by` / `create_time`、初始两类状态值），保证时间线完整。

## 五、合同可见性规则

> **业务规则（2026-09-24 拍板）**：合同对 **boss（老板）、管理员、与该客户绑定的业务员**可见。

| 角色 | 可见范围 | 现状 |
|---|---|---|
| boss / 管理员（`manageAll`） | 全部合同 | ✅ 中间件 `type=all` 已覆盖 |
| 客户绑定的业务员 | 仅其负责客户的合同 | ⚠️ **不符，需改造** |
| 其他销售 / 员工 | 不可见 | 需后端拒绝 |

**问题**：现合同列表用 `checkDataPermission('contract', 'create_by')`，按**合同录入人**过滤；而规则要求按**客户负责人 `crm_customer.owner_id`**（录入人不一定是负责业务员）。

**改造**：合同列表 / 详情 SQL 关联 `crm_customer cu`，非管理角色的范围条件为
`cu.owner_id = ?`（userId），而非 `contract.create_by = ?`；详情接口同样按此做归属校验（防 IDOR）。

## 六、排查出的真实缺陷

| # | 缺陷 | 等级 | 说明 / 修法 |
|---|---|---|---|
| 1 | **建合同守卫因果倒置** | **P1** | `contractService.createContract:193` 要求客户 `status==='signed'` 才给建合同——合同是签约载体，客户没合同无法变 signed，形成死循环。**放宽为 `business_status IN (following/quoted/negotiating)`**，合同签署完成后客户才置 signed |
| 2 | **合同统计条件失效** | P2 | `analysisService.js:170` 写 `crm_contract.status='signed'`，该列是 TINYINT（1-4），字符串隐式转 0，**永不命中** → 合同金额统计恒 0。改为按业务口径（如 `approval_status=2` 或 `status IN (2,3)`） |
| 3 | 终态锁定可被 `/update` 绕过 | P2 | 统一状态机落地后自然解决 |

## 七、影响面

| 维度 | 影响 |
|---|---|
| 表结构 | 新增 1 表；不改合同主表（v2.0） |
| API | 新增只读 `status-log`；创建守卫放宽（语义变化）；可见范围切换 |
| 权限 | 新权限码 `contract:status-log:view`（或复用 `contract:view`） |
| 前端 | 详情页「状态历史时间线」；建合同客户选择口径放宽 |
| 数据范围 | 合同归属判断从 create_by 切到 customer.owner_id |
| 数据 | 存量合同回填初始日志 |
| CI / 基线 | 新表并入 `init-complete.sql`（`regen-init-baseline.js`） |

## 八、风险与回滚

- 状态机与既有判断语义不一致 → 上线前全量快照 + 干跑比对。
- 可见范围切换可能影响现有销售看到的合同 → 先核对录入人与客户负责人不一致的合同清单。
- 回滚：新表可 DROP；状态机 / 可见范围保留开关，异常切回旧路径。

## 九、验收标准

- [ ] 两类状态任一变更后日志有且仅有一条记录（谁/何时/from→to）。
- [ ] 非法流转 / 终态变更被 API 拒绝（400），主表未改。
- [ ] boss、管理员可见全部；业务员仅见其负责客户的合同；他人直调 API 取不到（含 IDOR）。
- [ ] following/quoted/negotiating 客户可建合同；签署后客户才变 signed。
- [ ] 存量合同均有初始日志；合同相关回归与报表统计正确。

## 十、决策记录

2026-09-24 拍板：

1. 建合同守卫放宽到 `business_status IN (following/quoted/negotiating)`。
2. 存量合同**回填**一条初始日志。
3. 日志表 `contract_id` 外键取 **SET NULL**（对齐全库日志范式，非 RESTRICT/CASCADE）。

## 十一、参考资料

- `docs/contract-status-definition.md` —— 合同状态权威定义
- `docs/contract-center-audit-report.md`
- RFC-R13（命名规范）、RFC-R12（客户状态收敛）、RFC-R15c（FK 口径）
- 同构实现：`crm_opportunity_stage_log`、`crm_assign_log`、`crm_pool_log`

# 「客户总览」改造方案（待确认）

> **日期**：2026-09-10
> **负责人**：David
> **依据**：`AGENTS.md` §13.3 —— 发现业务逻辑冲突时，先出「现状 → 问题 → 推荐方案 → 影响范围」，**确认后再动代码**
> **状态**：✅ **方案已于 2026-09-10 经委托人确认**（6 个问题全部答复，见第六章），
> **已实施至第 7 步**（通知栏转移待办区）；剩「真实浏览器走查」与「`pool:*` 改名」两项，
> 详见 **§八 实施进度与验证记录**。

---

## 一、你的需求（原话整理）

| 项 | 你的定义 |
|---|---|
| 名称 | **客户总览** |
| 定位 | 全员可查客户信息；老板清晰看到「哪些客户在哪些人手上」；方便老板录入客户 |
| 认领 | **销售需要认领客户**（保留） |
| 流转 | 老板可分配；销售也可**选择转移给谁**，**但需双方同意**才能流转 |
| 特权 | **老板不需要销售同意**，可直接分配 |
| 通知 | 需要**通知栏** |
| 离职 | 销售离职后，客户回归（无主）状态，再由老板分配 |
| 移除 | **保护期** 和 **私有池** 都不要了 |

---

## 二、先解决你点出的矛盾

> 你说：「我是觉得既想要这个职能，也想有公海池」

**这两件事不冲突，它们本来就是同一个页面的两半**，不需要做成两个模块：

```
┌─────────────────────────────────────────────────┐
│  客户总览                                        │
│                                                 │
│  [全部客户]  ← 默认视图：所有人的客户，含「负责人」列   │
│       ↑ 老板在这里看清"哪些客户在谁手上"            │
│                                                 │
│  [待认领]   ← 筛选视图：owner_id 为空的客户          │
│       ↑ 这就是原来的"公海池"，销售在这里认领         │
└─────────────────────────────────────────────────┘
```

- **一个页面、一个菜单项**，用筛选器切换「全部 / 待认领」
- 「公海池」不再是独立模块，而是客户总览的一个**筛选条件**（`owner_id IS NULL`）
- 这样既满足"全员可查、老板看清归属"，又保留了公海认领能力

> 这样命名也顺了：菜单从 **潜客池 / 正式客户 / 公海池** 变成 **潜客池 / 正式客户 / 客户总览**，
> 前两个是"客户所处的阶段"，第三个是"全局视图"，语义不打架。

---

## 三、现状（已实测）

| 层 | 现状 |
|---|---|
| 后端服务 | `poolService.js` 6 个方法：`listPoolCustomers` / `claimCustomer` / `batchClaimCustomers` / `releaseCustomer` / `batchReleaseCustomers` / `getPoolLogs` |
| 后端路由 | 5 条：`/claim`、`/batch-claim`（`pool:claim`）、`/release`、`/batch-release`（`customer:release`）、`/pool-log`（`pool:view`） |
| 前端 | `views/pool/List.vue`、路由 `path:'pool'`、菜单标题「公海池」、权限 `pool:view` |
| 数据库 | 表 `crm_pool_log`；`crm_customer` 三字段：`pool_status`、`pool_type`、`protect_until` |
| 权限码 | `pool:claim`、`pool:view`、`customer:release` |
| 已修复 | **认领竞态（P0-1）** 已改为原子更新并实测通过 |

---

## 四、推荐方案

### 4.1 保留（不动或小改）

| 能力 | 处理 |
|---|---|
| 认领 / 批量认领 | **保留**。P0-1 的原子修复继续有效 |
| 释放到公海 | **保留**（用于离职、主动交回） |
| 客户总览查询 | 由「公海专用列表」升级为「全量客户列表 + 负责人列 + 筛选」 |
| 老板录入客户 | 复用现有新增客户入口，无需新造 |

### 4.2 新增：带「双方同意」的转移

这是本次唯一的新功能。建议新增 `crm_customer_transfer` 表：

| 字段 | 说明 |
|---|---|
| `id` / `customer_id` | 客户 |
| `from_user_id` / `to_user_id` | 发起人 / 接收人 |
| `status` | `pending` / `accepted` / `rejected` / `cancelled` |
| `reason` | 转移原因 |
| `create_time` / `handle_time` | 时间 |

流程：

```
销售A 选择"转移给"销售B
   → 生成 pending 记录 + 通知销售B
   → 销售B 在通知栏看到「销售A 申请将客户X 转移给你」
   → 同意 → owner_id 改为 B；拒绝 → 记录 rejected，客户仍归 A
```

**老板/管理员走另一条路**：直接分配，**不经过同意流程**（`assignService` 现有能力），
但**应给原负责人与被分配人各发一条通知**（告知，不是征求同意）。

### 4.3 移除：保护期 与 私有池

| 项 | 处理 |
|---|---|
| `protect_until` 保护期 | **下线业务逻辑**；字段保留在库中（不删列，避免破坏历史数据），新数据不再写入 |
| `pool_type='private'` 私有池 | **下线**；`canManagePrivatePool` 判定与相关 UI 一并移除 |

### 4.4 离职流程

```
销售离职/停用 → 其名下客户 owner_id 置 NULL（回归公司池）
            → 出现在"客户总览 → 待认领"
            → 老板在总览里直接分配给其他人
```

需要确认现有「用户停用」是否已触发客户回收（现有 `autoReleaseCustomers` 可能是定时任务）。

### 4.5 通知栏

**建议复用现有通知中心**：`crm_notification` 表 + `HeaderBar` 通知角标已存在
（迁移 086 给所有角色授了 `reminder` 权限）。不新造轮子。

---

## 五、影响范围

| 层 | 改动 |
|---|---|
| 数据库 | 新增 `crm_customer_transfer` 表（迁移 112）；`protect_until`/`pool_type` 不再写入（**不删列**） |
| 后端服务 | `poolService`：移除保护期/私有池判断；`assignService`：补通知；新增 `transferService` |
| 后端路由 | 保留 5 条；新增转移相关 3 条（发起/同意/拒绝） |
| 权限码 | `pool:claim`、`pool:view` 保留；新增 `customer:transfer` |
| 前端 | `pool/List.vue` 改造为「客户总览」（加负责人列 + 筛选 + 认领区）；菜单改名；新增转移交互与通知 |
| 测试 | `poolService` 相关 3 个测试文件需同步（当前 11 个用例）；新增转移流程测试 |

**预估规模**：后端 ≈ 2 个服务 + 1 个迁移 + 3 条路由；前端 ≈ 1 个页面 + 1 个通知组件。
**不属于重构**，是**功能调整 + 改名**，风险可控。

---

## 六、已确认（2026-09-10 委托人答复）

> ✅ **以下 5 项已由委托人确认，方案据此进入实施。**

| # | 问题 | **确认结果** |
|---|---|---|
| **1** | 去掉保护期后，"释放到公海"的客户能否被立即认领？ | ✅ **可以立即认领**（不再设有保护期） |
| **2** | 转移申请能否撤回？ | ❌ **不能撤回** |
| **3** | 转移申请超时如何处理？ | ✅ **超过 3 天自动回流**（申请失效，客户仍归原负责人） |
| **4** | 老板直接分配时是否需要交接备注？ | ✅ **需要**（分配时填写交接备注） |
| **5** | 离职后客户归属？ | ✅ **直接回归公司（无负责人）**，再由老板分配 |
| **6** | 认领是否需要老板审批？ | ❌ **不需要审批**（认领即生效）。但老板需能看到**客户在哪些人手上、进行到什么阶段** |

### 6.1 由确认结果推导出的实现要点

| 要点 | 说明 |
|---|---|
| 保护期字段 `protect_until` | 业务逻辑下线；认领后不再写入。**保留列不删**（避免破坏历史数据） |
| 私有池 `pool_type='private'` | 下线，认领不再受限 |
| 转移状态机 | `pending` → `accepted` / `rejected` / `expired`（**无 `cancelled`**，因不可撤回） |
| 超时任务 | 新增定时任务：将创建超过 3 天的 `pending` 申请置为 `expired`（客户仍归原负责人） |
| 老板直配 | 走 `assignService`，需带**交接备注**字段，并通知原/新负责人 |
| 离职回收 | 用户停用时将其客户 `owner_id` 置 `NULL` |
| 客户总览视图 | 必须展示**负责人**与**当前业务阶段**（对应第 6 项"看到进行到什么地方"） |

## 附：原始提问记录（已答复，留档）

| # | 问题 | 为什么必须问 |
|---|---|---|
| **1** | **去掉保护期后，"释放到公海"的客户是否可以被立即认领？** | 保护期原本就是防这个（防止刚交回就被抢）。去掉后语义变了，需你确认这是期望行为 |
| **2** | 转移申请：发起人**能否撤回**？超时（如 3 天）**是否自动失效**？ | 影响表结构与状态机 |
| **3** | 老板直接分配时，原负责人的客户**是否需要交接备注**？（比如"这个客户谈到什么阶段了"） | 影响转移/分配表单字段 |
| **4** | 你说"离职后客户回归到**名下**"——是指回归到 **公司（无负责人）** 待分配，对吗？ | 「名下」有歧义，做反了就麻烦了 |
| **5** | 认领**是否需要老板审批**？还是认领即生效？ | 决定要不要再做一条审批流 |

---

## 七、执行顺序（确认后按此走）

```
1. 迁移：新增 crm_customer_transfer 表
2. 后端：下线保护期/私有池 → 新增 transferService + 路由 + 权限码
3. 后端：补测试（含转移状态机、双方同意、老板直配）
4. 前端：pool/List.vue → 客户总览（改名 + 筛选 + 负责人列 + 认领）
5. 前端：转移交互 + 通知栏接入
6. 回归：后端全量 + 前端单测 + 构建 + E2E
7. 每步按 AGENTS.md 第八章输出 13 项
```

> **在你确认这 5 个问题之前，我不会改动公海/客户总览相关的任何代码。**

---

## 八、实施进度与验证记录（David · 2026-09-10）

### 8.1 进度总览

| # | 步骤 | 状态 | 提交 | 验证方式 |
|---|---|---|---|---|
| 1 | 迁移 112：`crm_customer_transfer` + `customer:transfer` 权限码 | ✅ | `0409393` | 正向 / 幂等 / 回滚 / 回滚后重建 四项实测 |
| 2 | 后端：下线保护期与私有池 | ✅ | `f35fb81` | 单测回归 |
| 2b | **补齐 P0-1 第 2、3 套竞态实现**（首次只修了 1 套） | ✅ | `f35fb81` | 并发用例 |
| 3 | `transferService` + controller + 5 端点 + 16 用例 | ✅ | `bef1f61` | 单测 + **真库 SQL 核验（见 8.3）** |
| 4 | 前端 `pool/List.vue` → 客户总览（双视图 + 负责人列 + 操作分流） | ✅ | `6cfe1ae` | 构建 + 单测 |
| 5 | 转移弹窗 + 接收人候选接口 `/pool/transfer/candidates` | ✅ | `6cfe1ae` | 构建 |
| 6 | `expireTransfers` 挂定时任务（每日 00:45，Asia/Shanghai） | ✅ | `6cfe1ae` | 任务清单实测 7 条 |
| 7 | **通知栏「客户转移」专属待办区** | ✅ | `21408f6` | 单测 + 真库核验 + 构建 |
| 8 | 真实浏览器端到端走查 | ⏳ 未做 | — | 本机无浏览器环境，**结论未验证** |
| 9 | `path` / 权限码由 `pool:*` 改名 | ⏳ 未做 | — | 会波及已发通知里的链接与权限数据，属独立迁移 |

> ⚠️ **提交 SHA 说明**：上表为**当前仓库**（`21408f6` 所在链，324 提交）的 SHA。
> 本日 15:14 本地对象库二次受损，曾摧毁当天的另一条提交链
> （其 SHA 为 `79060c5` / `6716504` / `042d4b5` / `6a847fd` 等，**已不可恢复**）。
> 两条链**内容一致**，仅提交粒度不同。详见
> `docs/crm-git-incident-2026-09-10.md` §九。

### 8.2 第 7 步交付内容（本次）

**背景**：此前 `acceptTransfer` / `rejectTransfer` 两个接口**已实现但前端零调用** ——
即「双方同意制」在实际使用中是**死路**：申请发得出去，接收人无处可点。
这属于 `AGENTS.md` §7.8 明令排查的「API 有实现，但前端没有调用」类假功能。

**改动**：

| 层 | 文件 | 改动 |
|---|---|---|
| 后端 | `services/reminderService.js` | `getMyReminders` 增 `transfer_pending` / `transfer_pending_count`；`getReminderCenter` 增 `transferPending` |
| 后端 | `routes/reminder.js` | `/center` 输出 `todo.transfers`，并计入角标 `unread_count` |
| 前端 | `composables/useTransferTodo.js` | **新增**：同意 / 拒绝的共用逻辑（含二次确认、拒绝理由、错误上报），供两处复用 |
| 前端 | `components/layout/NotificationBadge.vue` | 顶栏铃铛「待办」新增「客户转移待处理」分组，行内同意 / 拒绝 / 查看客户 |
| 前端 | `views/notification/index.vue` | 通知中心「待办通知」新增「客户转移」页签（客户 / 发起人 / 原因 / 有效期至 / 申请时间 + 操作）；SSE 到达时刷新当前页签 |
| 前端 | `api/pool.js` | 修正过时注释（7 天保护期已下线），避免误导后续维护 |

**两处共同遵守的一条判据**：待办列表只返回 `status='pending' AND expire_at > NOW()` 的申请。
已过期但定时任务尚未扫到的申请**不展示** —— 因为 `acceptTransfer` 会以「已超过有效期」拒收，
展示出来就是点了没反应的死按钮。

### 8.3 验证结果（实测，非推断）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 后端全量单测 | `cd backend && npx jest` | ✅ **109 套件 / 1083 用例全绿**（较上轮 +2） |
| 提醒模块单测 | `npx jest tests/reminder.test.js` | ✅ 10/10（新增 2 条：转移待办为空 / 有数据 + SQL 含未过期条件） |
| 前端单测 | `cd frontend && npm run test` | ✅ 11 文件 / 44 用例 |
| 前端构建 | `npm run build -- --emptyOutDir=false` | ✅ 通过 |
| **真库 SQL 核验** | `cd backend && node scripts/verify-transfer-sql.js` | ✅ **17/17 通过**（事务内执行后 ROLLBACK，测试库未被修改） |
**为什么必须做真库核验**：`transferService.test.js` 用的是 mock pool，只验证分支逻辑，
**抓不到列名写错、约束冲突、类型不兼容**这类只在真实 MySQL 暴露的问题。
核验脚本 `backend/scripts/verify-transfer-sql.js` 已入库，可随时复现，其中包含两条关键负例：

- **归属变更守卫**：用不存在的原负责人 ID 执行 UPDATE → `affectedRows=0`（证明并发/越权覆盖拦得住）
- **重复处理拦截**：对已 `accepted` 的申请再次按 `status='pending'` 更新 → `affectedRows=0`

另外确认了 `crm_notification.type` 为 `varchar(30)` 而非 ENUM —— 否则写入 `customer_transfer` 会被截断。

**超时回流（3 天）也已真跑验证**：在事务内造一条「已过期但仍 pending」的申请 → 执行回流 SQL →
确认该行流转为 `expired`、**且客户归属未被改动**（仍归原负责人）。
回滚后已独立复核测试库：`crm_customer_transfer` 0 行残留、样本客户 `owner_id` 保持原值、`crm_pool_log` 无残留。

### 8.4 已知局限（如实声明，勿当已完成）

| # | 局限 | 影响 | 状态 |
|---|---|---|---|
| L1 | ~~未在真实浏览器走查~~ | — | ✅ **已闭环（2026-09-10 晚）**，见 §8.6 |
| L2 | 处理完转移后，**系统通知里的那条未读仍在**，角标不会自动清零 | 轻微 UX 瑕疵（待办已消失，但角标仍亮） | ⏳ 未做。需给转移通知补 `business_type/business_id` 才能按业务清理 |
| L3 | 生产库 `huakey_crm` **尚未应用迁移 112**（`crm_customer_transfer` 不存在） | 未经迁移即部署，转移功能会报错 | ⏳ 未做。**已用直连生产库确认**：`information_schema` 中该表不存在 |

> ✅ 原 L4（超时回流未实测）已闭环，见 §8.3。
> ⚠️ L1 走查同时暴露出 **3 个新缺陷（D1–D3）**，见 §8.5 —— 其中 D1 会直接导致转移功能在生产环境失效。

### 8.5 走查新发现（D1–D3，均已实测复现）

#### D1 · 部署会静默删除 `customer:transfer` 授权【严重】

**症状**：部署后，除 `manageAll` 角色外，**6 个转移端点全部返回 403**。

**证据链**（全部实测）：

1. `deploy/deploy.sh` 第 `[11/12]` 步执行 `init_role_permissions.js`
2. 该脚本第 338–357 步会执行：
   ```sql
   DELETE rp FROM sys_role_permission rp
    WHERE rp.role_id = ? AND rp.permission_id NOT IN (...硬编码清单...)
   ```
3. 其硬编码清单 `ROLE_PERMISSIONS` 中 **`customer:transfer` 出现 0 次**（`grep -c` 实测）
4. 而迁移 112 第三步本会把该权限授予「所有拥有 `customer:edit` 的角色」
5. 部署顺序是 `[9] 迁移 → [11] init_role_permissions` → **迁移的授权被第 11 步清掉**
6. 实测：手工重跑迁移 112 的授权语句后，`boss/manager/sales` 立刻恢复该权限；
   完全符合「曾被授予、后被删除」的判断

**影响面**（直连测试库实测）：拥有 `customer:transfer` 的应为 `boss(2人)/manager(3人)/sales(11人)`，
被清空后 **这 16 人全部无法发起或处理转移**。

**已修**：`backend/scripts/init_role_permissions.js` 中为 `boss / manager / sales` 三个角色补上
`customer:transfer`，并在权限定义清单中登记该权限码。选择这三个角色，是因为只有它们持有
`customer:edit`，与迁移 112 的规则完全一致（不引入新的授权口径）。

> ⚠️ 同类隐患仍在：`routes/customer/module.js` 的 `descriptor.permissions` 数组也缺 `customer:transfer`。
> 该处仅用于注册/展示，当前不影响鉴权，但属同一类「清单漏项」，建议一并补齐。

#### D2 · 转移候选人列表不校验权限，约 29% 候选人是「死按钮」【中】

`transferService.listTransferCandidates` 仅按 `deleted_at IS NULL AND status = 1` 过滤：

```sql
SELECT id, real_name, username FROM sys_user
 WHERE deleted_at IS NULL AND status = 1 AND id <> ? ORDER BY real_name ASC, id ASC
```

**不做角色或权限过滤** → 前端 `views/pool/List.vue` 会把这些人全部列进转移弹窗。

**实测**（测试库 24 个可用用户）：其中 **7 人**（hr×1、purchase×4、finance×2）没有
`customer:transfer`，被列为候选人后**同意时必然 403**。

**建议**：候选人查询应 `JOIN sys_role_permission` 过滤掉无该权限的用户；
或前端在提交前给出明确提示。**本方案未擅自改动**（涉及产品口径：采购/HR 是否可作为客户接收人）。

#### D3 · 潜客转化不写负责人，产出「无主正式客户」死区【2026-09-11 复核升级为 P1】

> **复核修正：本节的原有归因有误，已更正。**
> 原文把根因归为「`addCustomer` 不写 `pool_status` → 客户不在公海 → 认领失败」。
> 复核发现迁移 `097_customer_business_status_and_pool_enum.sql` 头部**明确规定**：
>
> ```
> 线索 = 未分配的潜客（business_status='lead'），pool_status='private'
> 公海 = 曾被跟进后被释放的客户（business_status != 'lead' 且 owner_id IS NULL），pool_status='sea'
> lead 客户即使 owner_id IS NULL，pool_status 仍为 'private'（不属于公海）
> ```
>
> ⇒ **「线索不进公海」是设计如此**，`claimPoolCustomer` 拒绝线索（报「该客户不在公海中」）**行为正确**。
> 原文把它当缺陷属误判。真正的缺陷在**线索的既定入口「转化」上**。

**真正的缺陷**：线索的既定入口是「潜客池 → 转化」，但
`customerService.convertLeadToCustomer`（`services/customerService.js:1066-1106`）
**全程不更新 `owner_id`**：

| 该函数做了什么 | 缺了什么 |
|---|---|
| UPDATE `customer_type='customer'`、`lifecycle_status='active'`、`business_status='following'`、`status='following'`、`converted_at=NOW()` | **没有 `owner_id = ?`** |
| INSERT `crm_assign_log (…, to_user_id = customer.owner_id \|\| operatorId, …)` | 日志写了「已分给 operatorId」，而 `crm_customer.owner_id` 纹丝不动 |

**实测**（在测试库内复刻该函数的两条 DML，事务内比对后 ROLLBACK，未改动任何数据）：

```
实验对象: {"id":11,"company_name":"Minister Hi-Tech Park Ltd.",
          "owner_id":null,"status":"lead","business_status":"lead","pool_status":"private"}

转换后：crm_customer.owner_id    = null   ← 转换前后都是 null
        status / business_status = following / following
        pool_status              = private
        crm_assign_log 记录       = {"from_user_id":null,"to_user_id":71,
                                     "operator_id":71,"remark":"潜客转正式客户"}

❌ 分配日志已写 to_user_id=71，但 crm_customer.owner_id 仍为 NULL —— 日志与实际数据不一致
```

**⇒ 转化后的客户落入死区**（`owner_id IS NULL` + `pool_status='private'` + `business_status='following'`）：

| 入口 | 判据 | 结果 |
|---|---|---|
| 「待认领」列表 | 仅 `owner_id IS NULL`（`customerService.js:244-246`） | **看得见** |
| 公海认领 | 要求 `pool_status='sea'`（`:1172-1177`） | **拒绝**（仍 `private`） |
| 潜客池再转化 | 要求 `business_status='lead'` | **拒绝**（已非 `lead`，报「该客户不是线索」） |
| 「正式客户」列表 | 含 `pool_status='private'` 且 `business_status IN (…)` | 出现，**但无主** |

**三个入口全对不上，客户卡死无人负责。**

**前端确认**：`views/leads/List.vue:217` 转化后**只调用 `convertLeadToFormal(row.id)` 并刷新列表**，
没有任何补充分配的调用 —— 缺陷端到端成立，非仅后端问题。

**存量实测**：

| 库 | 【死区】无主 + `private` + 已是正式阶段 | 【线索】无主 + `business_status='lead'` |
|---|---|---|
| `huakey_crm`（本地） | **1 行** | 422 行 |
| `huakey_crm_test` | 0 行 | 423 行 |

> 说明：422 行线索本身**不是缺陷**（设计如此），它们是正常待转化的潜客；
> 真正的风险是**每一次转化都会新产生一个死区客户**。生产库存量**未核实**（本机无法访问 NAS）。

> 这也是 §8.6 走查改用「admin 分配」而非「销售认领」来准备数据的原因。
> **三种修复方案与改动清单见 §8.7。**

### 8.6 L1 真实浏览器端到端走查（已闭环）

新增 `frontend/e2e/customer-transfer.spec.js`，3 条用例全部通过：

| 用例 | 验证内容 | 结果 |
|---|---|---|
| A 发起 → B 通知栏可见并可同意 → 归属变更为 B | 含真实浏览器点击「同意」+ 二次确认 + 轮询等落库 + 前端控制台无错误 | ✅ PASS |
| B 拒绝 → 归属保持 A + 记录状态为 rejected | 校验 `handle_remark`、状态、归属均正确 | ✅ PASS |
| 越权守卫：非接收人不得同意他人转移 | 用 `manageAll` 的 admin 冒充接收人，必须被拒 | ✅ PASS |

**数据库侧复核**（证明断言真实、非假通过）：

```
id=3  customer 649  accepted  71→76   handled 10:10:05   → 客户 649 owner=76（已变更）
id=2  customer 650  rejected  71→76   remark "E2E 拒绝"  → 客户 650 owner=71（未变更）
id=1  customer 651  pending   71→76                     → 客户 651 owner=71（未变更）
```

**走查同时修复了 3 处测试基建问题**（否则用例无法运行，且都属「环境/基建」而非产品缺陷）：

1. **克隆测试库因 `DEFINER` 失败**：源库含 VIEW `v_user_permissions` 与 EVENT `evt_archive_sys_log`，
   二者带 `DEFINER=\`crm_user\`@\`%\``。以非特权账号恢复需 `SUPER`/`SET_USER_ID`，本机 `crm_user` 没有
   → 导入在第 3866 行报 `ERROR 1227`。
   已在 `frontend/scripts/start-e2e-server.mjs` 的克隆流程中**流式剥离 `DEFINER` 片段**
   （含跨 chunk 边界处理，已单独单测 4 例通过），并加 `--skip-events --no-tablespaces`。
   > 注意：`--skip-events` 不足以解决，VIEW 的 DEFINER 仍会残留。

2. **`demo_roles.sql` 缺 `manager` / `sales`**：该文件自称「补齐测试库缺失的角色」，
   但 `INSERT IGNORE` 列表不含这两个角色；而 `demo_users.sql` 用
   `(SELECT id FROM sys_role WHERE LOWER(code)='sales' LIMIT 1)` 取 `role_id`，
   取不到即 NULL → `demo_sales` **无任何权限**。已补上两个角色。
   （这正是 P1-13「测试库权限数据不具代表性」的具体成因之一。）

3. **`demo_sales2` 新增**：走查需第二个具备 `customer:transfer` 的账号作为接收人；
   原 `demo_purchase` 是 purchase 角色，无该权限。已在 `demo_users.sql` 增加 `demo_sales2`。

> ⚠️ 走查环境依赖：**必须用「克隆源库」模式**（默认），不能加 `E2E_USE_MIGRATIONS=true`。
> 后者会导入 `deploy/init-complete.sql` 并把所有迁移标记为已执行，得到的测试库**没有 sales/manager 角色**，
> 无法模拟真实销售。详见 P1-13。

### 8.7 D3 修复方案（三选一，2026-09-11 出具 · **本方案未改动任何代码**）

> 前提认知（见 §8.5 D3 复核）：**线索不进公海是 097 的既定设计**，不是 bug。
> 因此修复目标不是「让线索能被公海认领」，而是**让转化后的客户有人负责**。

#### 方案对比

| 方案 | 一句话 | 改动面 | 治本? | 风险 | 建议 |
|---|---|---|---|---|---|
| **A** | 转化时补写 `owner_id = 操作人` | 1 处 SQL | ✅ | 低 | **推荐** |
| A′ | 转化时走 `autoAssignOwner`，无规则回落操作人 | 1 处 + 复用 helper | ✅ | 中 | 备选 |
| B | 收敛「待认领」列表判据，不修转化 | 1 处 SQL | ❌ 治标 | 中 | 可与 A 叠加 |
| C | 放开公海认领判据，允许认领无主客户 | 2–3 处 | ❌ 且引入错语义 | 高 | 不推荐 |

#### 方案 A（推荐）：转化时补写 `owner_id`

**为什么是「补齐」而不是「改设计」**：`convertLeadToCustomer` 已经在
`crm_assign_log` 里写了 `to_user_id = customer.owner_id || operatorId`，
说明**作者的意图本就是「转化即分给操作人」**，只是漏了同步 `crm_customer.owner_id`。

**改动清单**

| # | 文件 | 位置 | 改动 |
|---|---|---|---|
| 1 | `backend/services/customerService.js` | `1079-1092`（`convertLeadToCustomer` 的事务体） | UPDATE 增加 `owner_id = COALESCE(owner_id, ?)`、显式 `pool_status = 'private'`；参数补 `operatorId` |
| 2 | `backend/tests/`（新增或用例补充） | — | 断言「转化后 `owner_id === operatorId`」且 `crm_assign_log.to_user_id` 与之一致 |
| 3 | `frontend/e2e/`（可选） | — | 「潜客池转化 → 待认领列表不再出现该客户」 |

**回滚**：还原第 1 项 SQL 即可（无 DDL、无数据迁移）。

**验证要求**（不接受「改完看着对了」）：单测断言 `owner_id` 落库值 + 断言 `crm_assign_log` 与
`crm_customer.owner_id` **一致**（本次缺陷的本质就是两者不一致，必须有断言防回归）。

**待产品确认**：老板/管理员**代**转化时，客户应归操作人，还是留空待分配？
- 归操作人 → 用 `COALESCE(owner_id, operatorId)`（A）
- 留空待分配 → 则应去掉 `crm_assign_log` 里的 `|| operatorId`，并补 `pool_status='sea'` 让它进公海

#### 方案 A′：转化时按分配规则指派

复用既有 `autoAssignOwner(pool, { source, address })`，无规则命中时回落 `operatorId`。
优点是与「新建客户」路径口径一致；缺点是引入对分配规则表的依赖，规则误配会把客户分错人。
**若选 A′，务必先确认分配规则在生产库的实际配置。**

#### 方案 B：仅收敛「待认领」列表判据

| # | 文件 | 位置 | 改动 |
|---|---|---|---|
| 1 | `backend/services/customerService.js` | `244-246` | `AND c.owner_id IS NULL` → `AND c.owner_id IS NULL AND c.pool_status = 'sea'` |

效果：列表不再展示 422 行线索（线索改由潜客池承载，口径更清晰）。
**但治标不治本** —— 死区客户（`business_status='following'` 且无主）依旧存在。
可作为 A 的叠加项，**不单独使用**。

#### 方案 C：放开公海认领判据（不推荐）

| # | 文件 | 位置 | 改动 |
|---|---|---|---|
| 1 | `backend/services/customerService.js` | `1172-1177` | 去掉 `pool_status !== 'sea'` 拦截 |
| 2 | `backend/services/customerService.js` | `1187-1192`（P0-1 原子守卫） | **必须同步**放宽 `WHERE … pool_status = ?`，否则认领静默失败 |
| 3 | `backend/services/poolService.js` | `98`（第二处实现） | 同口径修改，否则两套实现再次发散 |

**不推荐理由**：① 违背 097 的「线索≠公海」设计；② 必须同时改 P0-1 原子守卫，
漏改即回归 P0-1 竞态漏洞；③ 项目内已有两套认领实现（P0-1 踩过坑），再动会扩大发散面。

#### 存量对账（需在生产库执行，本机不可达）

```sql
-- 死区存量：无主 + private + 已是正式阶段
SELECT COUNT(*) FROM crm_customer
WHERE owner_id IS NULL AND pool_status = 'private' AND deleted_at IS NULL
  AND business_status IN ('following','quoted','negotiating','signed');
```

**修复原则**：
- ✅ 由管理员用既有 `POST /customer/assign` 接口逐个/批量补负责人（**已有 `crm_assign_log` 留痕**）
- ❌ **不做自动改写** —— 系统无法判定这些客户当时应由谁负责，机械分配会制造错误的业绩归属
- ❌ 不删除任何行

#### 明确不做的事

1. 不自动把死区客户塞给某个销售（无依据）
2. 不修改 097 的「线索/公海」语义
3. 不在生产库执行任何 DML（需 NAS 权限 + 先备份 + 先对账）
4. 本次**只出方案，未动代码** —— 待方案确认后再进入九步循环

---

*方案由 David 出具 · 2026-09-10 · 第 7 步已实施；L1 走查已闭环，局限见 §8.4，新发现见 §8.5*
*2026-09-11 复核：D3 原归因已更正，并补齐三重修复方案与改动清单（§8.7）；本轮未动代码*

# 客户分配模型改造方案：业务目标 vs 现状差距分析（2026-11-03）

> 本文是《[assignment-logic-map-2026-11-03.md](./assignment-logic-map-2026-11-03.md)》的续篇。
> 依据业务方 2026-11-03 口述的真实分配模型，做「规则 vs 现状」对照并给出最小改造方案。
> 调研全程只读；唯一写操作是 V4 已授权的 Arcelik 数据合并（见 V4.2）。生产结论来自只读 SELECT 与代码实证。V1–V4 为过程稿，**V5 为定稿**。

---

## 结论先行

1. **"老板全局可见 + 老板改派任意客户"现状已支持**，证据充分（boss 角色 view_all/manage_all=1 + customer:assign 权限码 + manualAssign 对 manageAll 跳过归属校验）。这不是改造重点。
2. **真正缺的是三块**：① 销售自建客户不归创建人（进线索池，A1 假设与现状相反）；② 没有"回到老板手上"的载体——唯一的无主状态是公海，而公海语义是"人人可见、先到先得"；③ 离职走"释放到公海"而非"回老板"。
3. **两处现状直接与口述冲突**：Excel 导入 owner=导入人（任何销售持 customer:import 可给自己批量塞客户）；manager 也持有 customer:assign（分配权不只属于老板）。
4. 生产有 **5 个 boss 账号**（admin/Rin/lianghailin/lvcongming/heziwen）——"回到老板手上"必须先回答"回到哪个老板"，这是头号拍板问题。

---

## 一、查证：代码里的"老板"是谁

### 1.1 角色标识

| 事实 | 证据 |
|---|---|
| "老板" = `sys_role.code='boss'`（role_id=1），`view_all=1, manage_all=1` | 生产库实测（2026-11-03 SELECT）；[roles.js:43-45](file:///c:/huakey-crm/backend/config/roles.js#L43-L45) |
| 权限 bypass 集合 `ADMIN_ROLE_CODES` **只含 super_admin，不含 boss**——boss 不走特权旁路，走显式权限码 | [roles.js:41-45](file:///c:/huakey-crm/backend/config/roles.js#L41-L45)、[permission.js:21](file:///c:/huakey-crm/backend/middleware/permission.js#L21) |
| **boss 生产持有 11 个客户权限码**：customer / customer:add / customer:assign / customer:delete / customer:edit / customer:export / customer:import / customer:list / customer:release / customer:transfer / customer:view + pool:claim / pool:view | 生产库 sys_role_permission 实测 |
| **生产 boss 用户有 5 个**：admin(1)、Rin(6)、lianghailin(25)、lvcongming(27)、heziwen(33) | 生产库 sys_user 实测 |
| manager 也持有 customer:assign、customer:import、customer:release 等全套客户权限 | 生产库实测；[assign.js:83-85](file:///c:/huakey-crm/backend/routes/customer/assign.js#L83-L85) 注释自认"manager 持有该码，属有意放宽" |
| sales 持有 customer:add / customer:import / customer:transfer / pool:claim 等；purchase/finance/hr/engineer **无任何 customer/pool/leads 权限码**（部门边界现状成立） | 生产库实测 |

### 1.2 老板当前是否真能看全部客户

**能。** 链路：登录时 `manage_all/view_all` 注入 JWT 载荷（[auth.js:139-140](file:///c:/huakey-crm/backend/middleware/auth.js#L139-L140)、[auth.js:204-205](file:///c:/huakey-crm/backend/middleware/auth.js#L204-L205)）→ 客户列表路由挂 `checkDataPermission('customer','owner_id')` → boss 命中 `manageAll` 分支直接拿 `type:'all'`（[permission.js:68-69](file:///c:/huakey-crm/backend/middleware/permission.js#L68-L69)）→ `buildDataPermissionWhere` 对 all 返回 `1=1`（[permission.js:121-122](file:///c:/huakey-crm/backend/middleware/permission.js#L121-L122)）。另有 sys_data_permission 兜底配置（role_id=1 customer data_scope='all'，生产实测）。

### 1.3 老板当前能否改派任意客户

**能。** 走 `POST /api/v1/customers/assign`（[assign.js:58](file:///c:/huakey-crm/backend/routes/customer/assign.js#L58)）：

- 权限：`checkPermission('customer:assign')`（boss 有此码）+ `requireManager`（boss 命中 `ADMIN_ROLE_CODES.has(roleCode)`？否——boss 不在集合，但 requireManager 判定 `req.user.manageAll` 为 true，[admin.js:36-47](file:///c:/huakey-crm/backend/middleware/admin.js#L36-L47)，通过）。
- 数据范围：`manualAssign` 的归属校验 `if (operatorUser && !operatorUser.manageAll)` 对 boss 直接跳过（[assignService.js:237-241](file:///c:/huakey-crm/backend/services/assignService.js#L237-L241)）→ **老板可改派任何客户的归属，含从销售 A 改给销售 B**。
- 收回：同一接口 `to_user_id=null` 即"回收为待分配"（[assignService.js:246-247](file:///c:/huakey-crm/backend/services/assignService.js#L246-L247)），但注意回收后客户进的是**公海**（owner=NULL, sea），不是"回到老板手上"（见 1.4）。
- 批量改派：`POST /customers/batch-assign`（≤100，[assignService.js:274-326](file:///c:/huakey-crm/backend/services/assignService.js#L274-L326)）同样对 boss 不设归属限制。

### 1.4 是否存在"回到老板手上"这一状态

**不存在。** 全库无任何字段/枚举值表达"暂归老板待分配"：

- `crm_customer` 归属相关字段只有 `owner_id`（int，指向 sys_user 或 NULL）、`pool_status`（'private'/'sea'）、`status`、`business_status`（[poolStatus.js:22-37](file:///c:/huakey-crm/backend/constants/poolStatus.js#L22-L37)）。
- 唯一的无主形态 = `owner_id IS NULL`，且判定口径明确以 owner_id 为唯一事实源（[poolStatus.js:13-18](file:///c:/huakey-crm/backend/constants/poolStatus.js#L13-L18)）。

**两者语义差异**（这是改造的核心决策点）：

| 维度 | 公海（owner_id=NULL, sea） | 业务口述的"老板待分配" |
|---|---|---|
| 谁可见 | 所有人（pool:view 全角色持有；且 sales 数据范围 self 有公海兜底：`owner_id IS NULL AND status IN ('lead','sea')` 也可见，[permission.js:145-152](file:///c:/huakey-crm/backend/middleware/permission.js#L145-L152)） | 仅老板（A2 假设下原销售也不可见） |
| 谁能拿走 | 任何销售先到先得（claim 四层并发防护，先手赢） | 只有老板能分配 |
| 语义 | 无主资产，先占先得 | 有主（主=老板），等待指派 |
| 现状载体 | 有 | **无** |

---

## 二、口述规则表 R1–R10（每条：触发 → 动作 → 权限 → 数据影响 → 现状）

> A1/A2 为本文标注的业务假设，待业务最终确认。

| # | 规则 | 触发 → 动作 | 谁有权执行 | 数据影响 | 现状是否支持 |
|---|---|---|---|---|---|
| R1 | 老板全局可见 | 任意时刻 → 查看所有客户（含各销售名下） | boss / super_admin | 只读，无数据影响 | ✅ **支持**（1.2 节证据链） |
| R2 | 老板改派 | 老板选定客户 → 变更 owner 为任意销售 | boss（manageAll） | owner_id 变更 + crm_assign_log；已归属客户阶段不变（quoted/signed 保留） | ✅ **支持**（1.3 节，assign/batch-assign） |
| R3 | 老板收回 | 老板选定客户 → 收回待再分配 | boss | 现状：owner→NULL 进公海 | ⚠️ **半支持**：接口存在（to_user_id=null），但收回目的地是公海（人人可抢）而非老板手中——与 R6 待分配池冲突 |
| R4 | 销售/经理自建客户 | 销售填表新增 → 客户创建成功 | sales/manager（customer:add） | 现状：autoAssignOwner 未命中 → owner=NULL、status=lead 进线索池 | ⚠️ **半支持**：能建，但**不默认归属创建人**（[customerDetailService.js:179-185](file:///c:/huakey-crm/backend/services/customerDetailService.js#L179-L185)）——A1 假设与现状相反 |
| R5 | 自建客户归属创建人（A1 假设） | 新建时未走规则 → owner=创建人 | 系统自动 | owner_id=创建人，status=following | ❌ **缺失**：现状进线索池，创建人需再"认领"或"转化"才归自己（多两步操作，且线索认领前全公司可见） |
| R6 | 待分配池（老板统一分配） | 客户无主时 → 挂在老板名下等待指派 | —（状态） | owner_id=老板 或 专用状态位 | ❌ **缺失**：无此状态；现状无主=公海=人人可抢 |
| R7 | 离职收回 | 用户删除 → 名下客户回老板 | 执行删除的管理员（现状 boss/super_admin） | 现状：owner→NULL 进公海（非线索转 sea；线索保持 lead，[userRouteService.js:321-323](file:///c:/huakey-crm/backend/services/userRouteService.js#L321-L323)、[customerService.js:1478-1495](file:///c:/huakey-crm/backend/services/customerService.js#L1478-L1495)） | ❌ **冲突**：去向是公海不是老板；对比商机反而是转直属上级（[userRouteService.js:326-331](file:///c:/huakey-crm/backend/services/userRouteService.js#L326-L331)），同一流程内两种资产两种策略 |
| R8 | 调岗收回 | 调岗（不删账号）→ 客户转移 | boss | owner 变更 | ❌ **缺失**：无调岗机制；只能老板手动逐个/批量 assign（现状可行但无流程入口） |
| R9 | 收回期间原销售不可见（A2 假设） | 收回后 → 原销售失去可见性（含跟进记录） | —（数据范围） | — | ❌ **相反**：公海兜底条款令 self 范围仍可见无主客户（[permission.js:149-151](file:///c:/huakey-crm/backend/middleware/permission.js#L149-L151)）；跟进记录可见性挂在客户可见性下 |
| R10 | 部门边界 | 采购/人事/财务 → 不参与客户分配 | — | — | ✅ **支持**：purchase/finance/hr/engineer 无任何 customer/pool/leads 权限码（生产实测）；sys_data_permission 中各角色仅本模块有数据范围 |

---

## 三、与现状 15 条规则（前文 R01–R15）的对照

| 前文规则 | 判定 | 与口述模型的具体冲突点 |
|---|---|---|
| R01 新建客户（规则命中→分人，未命中→线索池） | 冲突 | 未命中应"归创建人（sales/manager）"（A1）而非线索池；规则引擎生产为空（0 条），等于 100% 进线索池 |
| R02 Excel 导入 owner=导入人 | **冲突（最严重）** | sales 持有 customer:import——任何销售可导入一批客户直接归自己，**完全绕过老板分配权**；boss 口述的"源头是老板"在此被架空 |
| R03/R04 手工/批量分配 | 符合 | 即老板改派通道，manageAll 无归属限制，有乐观锁+日志 |
| R05 自动分配按钮（不读规则，纯轮询给全体 sales） | 冲突 | 与"老板决定一切"相悖：一键把公海客户平均分光，老板不知情；且分配后无通知 |
| R06 规则匹配（priority DESC 首条命中） | 中性 | 引擎本身可用，但生产 0 规则；且轮询名单不校验在职 |
| R07/R08 公海认领（先到先得） | 冲突 | "客户回到老板手上"与"人人可抢"是两种互斥的分配哲学；若采纳口述模型，无主客户的默认去向必须改变 |
| R09/R10 释放/自动回收 → 公海 | 冲突 | 15 天未跟进回收的目的地是公海（[poolService.js:492-499](file:///c:/huakey-crm/backend/services/poolService.js#L492-L499)）——若口述模型成立，回收后应"回老板"而非"进公海"；两套目的地打架 |
| R11 转移（双方同意制） | 中性 | 销售间自愿流转仍可用；但"老板改派"无需对方同意（assign 接口），两通道并存合理 |
| R12 线索转化（管理员代转化→公海） | 冲突 | 代转化产物应挂老板（A1 延伸）而非公海 |
| R13 离职（客户→公海，商机→上级） | **冲突** | 直接对应口述 R7：客户去向错了；且与商机策略不一致 |
| R14 工作流 assign 半成品 | 缺失 | 与口述模型无直接冲突，但改造时应一并收敛（见方案 S1） |
| R15 分配无通知 | 缺失 | 老板分配后销售无感知，削弱"老板分配"的实际效果 |

**口述特别点名的四个打架点逐一回应**：

1. **15 天未跟进进公海 vs 离职回老板**：两规则目的地不同即可并存，但需统一回收语义。若"回老板"是唯一再分配入口，自动回收也应回老板（或至少回收到只有老板能分的位置），否则销售 15 天不跟进的客户会被其他销售抢走，老板失去分配权。**建议：自动回收目的地改为老板**（见 S4）。
2. **quoted/negotiating/signed 永不回收**（[poolService.js:479](file:///c:/huakey-crm/backend/services/poolService.js#L479) 只查 status='following'）：口述模型下老板有收回权（R3 手动可收），但系统不会**提醒**老板"高阶段客户长期无人跟进"——不是权限缺口是监控缺口。低风险解法：把高阶段超期客户纳入逾期报表/提醒，不动回收逻辑。
3. **经理跨团队分配**：manager 持 customer:assign + dept_and_sub 数据范围。口述"一切源头是老板"若按字面执行，应回收 manager 的 customer:assign；但小公司经理代管分配很常见。**列为拍板问题 Q4**。
4. **Excel 导入 owner=导入人**：见 R02 对照——必须改，无争议（方案 S3）。

---

## 四、最小改造方案

### 4.1 引擎收敛：三套 → 一套

| 引擎 | 处置 | 理由 |
|---|---|---|
| `assignService.autoAssignOwner`（新建时规则匹配，[assignService.js:168-212](file:///c:/huakey-crm/backend/services/assignService.js#L168-L212)） | **保留，作为唯一基座** | 唯一"规则驱动"的实现；已接入新建主链路；有单测 |
| `assignService.applyRule`（经理轮询按钮，[assignService.js:95-162](file:///c:/huakey-crm/backend/services/assignService.js#L95-L162)） | **废弃**：`/auto-assign` 端点改为内部调用规则引擎（或直接下线按钮） | 不读规则表，名实不符；一键均分与"老板分配"模型冲突 |
| `automationService.applyAssignRule`（工作流规则匹配，[automationService.js:296-343](file:///c:/huakey-crm/backend/services/automationService.js#L296-L343)） | **收敛**：改为委托 assignService 的匹配函数，删除自带的一份匹配代码 | 与基座重复实现且轮询索引语义不同（`(last+1)%len` 存回 vs `last%len` 取人存 `idx+1`），两份计数器读写交叉 |

统一轮询语义：以基座为准（`nextIndex=(lastIndex+1)%len`，先取后存回模值）；工作流委托后语义自然统一。同时给匹配加"在职过滤"（复用 [assignService.js:19-31](file:///c:/huakey-crm/backend/services/assignService.js#L19-L31) 的 validateTargetUser 查询形状，名单全失效视为未命中）。

### 4.2 "老板待分配池"落地：owner_id=老板，不加新状态位

两个候选：

| 方案 | 改动 | 评价 |
|---|---|---|
| i. 新状态位（如 pool_status='pending_boss'） | 加枚举 + 全部公海查询/回收/认领链路要排除该态 + 前端筛选 | 侵入大：poolStatus.js 注释明确 pool_status 已降级为兼容列，再加状态是开倒车；且"仅老板可见"仍要单独实现数据范围 |
| **ii. owner_id=指定老板（推荐）** | 零 schema 改动 | "客户在老板手上"字面成立：老板名下即待分配池；老板 view all + assign 全套现成；销售 self 范围自动不可见（**顺带满足 A2**，收回后原销售看不到，因 owner 已不是他且非公海态）；跟进记录可见性随客户走 |

方案 ii 的两个配套点：

- **15 天自动回收需豁免**：老板名下客户不跟进 15 天会被 [autoReleaseCustomers](file:///c:/huakey-crm/backend/services/poolService.js#L467-L525) 回收进公海，形成"回老板→又被回收→人人抢"的绕环。豁免方式：回收查询追加 `AND owner_id NOT IN (SELECT id FROM sys_user u JOIN sys_role r ON u.role_id=r.id WHERE r.code IN ('boss','super_admin'))`，或约定老板名下客户 status 置 'sea'（不在 following 回收范围）——推荐前者，语义直白。
- **回收到哪个老板**：5 个 boss 账号，必须有确定规则（拍板问题 Q1）。建议用 sys_config 加 `boss_pool_owner_user_id`，或约定"操作回收动作的那个 boss 本人"。

### 4.3 存量 425 个无归属客户【本节已作废，最终口径见 V5.2】

> **V5 定稿（2026-11-03 业务确认）**：生产 423 条 lead 是**资源**（名片名录），不是待分配客户，本来就不需要派发——**不构成数据缺陷，不做任何"补 owner"迁移**。本节选项 A/B 与 V1 的 S5 划转步骤一并作废；仅 2 条公开池（sea）客户留在公开池，由老板用现有 assign 派出即可。
>
> （历史实测数据保留）423 线索（lead/lead，owner=NULL）+ 2 公海（sea/following）。

### 4.4 离职/调岗流程接入

- **触发点**：离职 = `userRouteService.deleteUser` 事务内第 3 步（[userRouteService.js:321-323](file:///c:/huakey-crm/backend/services/userRouteService.js#L321-L323)），把 `systemReleaseOwnedCustomersOnLeave` 替换为新受控入口 `systemTransferOwnedCustomersToUser(pool, fromUserId, toBossId)`：`UPDATE crm_customer SET owner_id=?, pool_status='private', protect_until=NULL WHERE owner_id=? AND deleted_at IS NULL`（保持 business_status 不动——线索还是线索、成交还是成交，避免现状"离职释放把 signed 抹成 following"的信息损失）。同事务写 crm_assign_log（remark='离职收回'）。原子性：与删除用户同一事务，失败整体回滚，不留半条数据。权限：deleteUser 已有 assertCanManageUser 纵向越权校验（[userRouteService.js:295](file:///c:/huakey-crm/backend/services/userRouteService.js#L295)），不变。
- **调岗**（不删账号）：不建新机制——老板用现有 `/customers` 列表按负责人筛选 + `/batch-assign` 批量改派即可闭环（现状能力，缺的只是使用习惯/文档）；若要产品化，后续再议"人员变动向导"。
- **商机保持现状**（转直属上级），客户改转老板——两资产两策略，在代码注释与本文件中明示即可。

### 4.5 其他四点小改

| 改动 | 位置 | 说明 |
|---|---|---|
| 销售/经理自建客户归属创建人（A1） | [customerDetailService.js:179-185](file:///c:/huakey-crm/backend/services/customerDetailService.js#L179-L185)：autoAssignOwner 未命中时，若 operator 角色为 sales/manager → owner=operatorId, status=following；boss 新建仍走规则/进池 | 行为变化点，需公告 |
| Excel 导入归属 | [importService.js:163](file:///c:/huakey-crm/backend/services/importService.js#L163)：`owner_id: userId` → `owner_id: null`（进待分配）或走规则引擎 | 行为变化点 |
| 代转化目的地 | [customerService.js:1108-1109](file:///c:/huakey-crm/backend/services/customerService.js#L1108-L1109)：manageAll 代转化 → owner=指定老板（替代 NULL/sea） | 小改 |
| 分配通知 | assign/batch-assign/autoAssign 成功后给新负责人发站内通知（复用 [notificationService.createNotification](file:///c:/huakey-crm/backend/services/transferService.js#L113-L121) 模式） | 补齐 R15 |

---

## 五、实施顺序与风险（每步可独立上线、可回滚）

| 步骤 | 内容 | 用户可见行为变化 | 影响面 | 回滚 |
|---|---|---|---|---|
| S1 | 引擎收敛：applyAssignRule 委托基座、统一轮询语义、匹配加在职过滤；顺带修 R14（工作流 assign 走 assignmentStatusFragment + 写日志） | 无（工作流功能行为微变，用户无感） | automationService + assignService + 各自单测 | git revert，无 schema |
| S2 | 销售自建客户归创建人（A1） | **有**：新建客户从"进线索池"变为"归我名下" | customerDetailService.addCustomer 一处 + 单测 + 前端提示语 | git revert；已建客户归属不回滚（可老板批量改派纠偏） |
| S3 | Excel 导入 owner 改 null/规则 | **有**：导入客户不再归导入人 | importService.batchImport + 单测 | git revert；存量已导入归属不回滚 |
| S4 | 离职收回改转老板 + 自动回收目的地改老板 + 回收豁免老板名下 | **有**：离职客户从"公海可抢"变为"老板名下待分配" | userRouteService.deleteUser、新受控入口、poolService.autoReleaseCustomers、相关测试 | git revert + 一次性反向 UPDATE（owner=老板 → NULL）可批量纠正 |
| S6 | 分配通知 + 老板待分配池视图（前端"我名下待分配"= 现有客户列表加 owner 筛选，几乎零开发） | 增量（多了通知） | 通知服务 + 前端 | git revert |

依赖关系：S2/S3/S6 互相独立可并行；S4 依赖 Q1 拍板（老板指向）。全案**零 schema 变更**（推荐方案 ii），每步均为代码级可回滚。~~S5 存量划转~~ 已按 V5 口径**删除**（423 条 lead 是资源，无需派发，见 V5.2）。

---

## 六、需要业务拍板的问题（6 条）

| # | 问题 | 选项 A | 选项 B |
|---|---|---|---|
| Q1 | **"老板"是谁？**（生产有 5 个 boss 账号，离职收回/待分配池必须落到具体人） | 固定一个人（sys_config 配置 boss_pool_owner），离职客户全回他 | 谁执行收回操作就归谁（动态），其他 boss 可见但名下归属分散 | 
| | | 影响：A 简单可控、老板之间无争议；B 灵活但"待分配池"被拆成 5 份，全局视图要靠 view_all |
| Q2 | **存量 423 条无主线索怎么办？** | ~~全部划给老板待分配池~~（**已作废**——V5 定稿：它们是资源，不是待分配客户） | **维持现状、零迁移**（V5.2；销售可"转为客户"，老板只管新规则） |
| | | 影响：原选项 A 会清空线索池、与资源库语义冲突，已否决；零迁移对现状无任何影响 | |
| Q3 | **A2 确认：客户被老板收回后，原销售还能看到吗（含跟进记录）？** | 不可见（方案 ii 天然支持，owner 变更即失去可见性） | 仍可见但不可操作（保留背景知识，防止接手销售两眼一抹黑） |
| | | 影响：A 符合口述字面但丢失交接上下文；B 需要额外交叉可见性规则（改数据范围 SQL） |
| Q4 | **经理（manager）还要不要分配权？** | 收回 customer:assign，分配权集中老板（符合"源头是老板"字面） | 维持现状（经理可分配，老板有最终改派权） |
| | | 影响：A 严格但老板成瓶颈（4 个在职 manager 的日常分配全部上移）；B 灵活，与口述略冲突 |
| Q5 | **15 天自动回收的目的地改成老板后，销售"释放到公海"（主动 release）也改吗？** | 统一改：一切无主客户回老板（模型最一致） | 双轨：自动回收回老板、销售主动释放仍进公海（保留销售自主腾挪空间） |
| | | 影响：A 最干净但销售失去自主池；B 两个池并存，需在前端明确区分"公海=销售可抢 / 老板池=待分配" |
| Q6 | **Excel 导入的客户归属？** | owner=NULL 进老板待分配池（分配权完全收口） | 导入时即时跑规则引擎（配好规则则自动分，未命中进池） |
| | | 影响：A 简单确定；B 依赖规则配置质量（当前 0 条规则，等于 A） |

---

## 附：证据索引（本文新增查证）

| 结论 | 证据 |
|---|---|
| boss=role_id 1，view_all/manage_all=1，5 个在职 boss 用户 | 生产 sys_role / sys_user SELECT（2026-11-03） |
| boss 持 customer:assign 等 11 码；manager 持全套客户码；sales 持 add/import/transfer；purchase/finance/hr/engineer 零客户码 | 生产 sys_role_permission SELECT（2026-11-03） |
| sys_data_permission：boss(customer)=all、manager=dept_and_sub、sales=self | 生产 SELECT（2026-11-03） |
| manageAll 注入 | [auth.js:204-205](file:///c:/huakey-crm/backend/middleware/auth.js#L204-L205) |
| checkPermission bypass 仅 super_admin + manageAll | [permission.js:20-24](file:///c:/huakey-crm/backend/middleware/permission.js#L20-L24)、[roles.js:43-45](file:///c:/huakey-crm/backend/config/roles.js#L43-L45) |
| 数据范围 all → 1=1 | [permission.js:121-122](file:///c:/huakey-crm/backend/middleware/permission.js#L121-L122) |
| self 范围公海兜底可见 | [permission.js:145-152](file:///c:/huakey-crm/backend/middleware/permission.js#L145-L152) |
| manualAssign manageAll 跳过归属校验 | [assignService.js:237-241](file:///c:/huakey-crm/backend/services/assignService.js#L237-L241) |
| 自动回收仅 following | [poolService.js:475-482](file:///c:/huakey-crm/backend/services/poolService.js#L475-L482) |
| 离职释放客户（非转老板） | [userRouteService.js:321-323](file:///c:/huakey-crm/backend/services/userRouteService.js#L321-L323)、[customerService.js:1478-1495](file:///c:/huakey-crm/backend/services/customerService.js#L1478-L1495) |
| 商机转直属上级 | [userRouteService.js:326-331](file:///c:/huakey-crm/backend/services/userRouteService.js#L326-L331) |
| Excel 导入 owner=导入人 | [importService.js:155-164](file:///c:/huakey-crm/backend/services/importService.js#L155-L164) |
| 新建客户未命中规则→线索池 | [customerDetailService.js:178-185](file:///c:/huakey-crm/backend/services/customerDetailService.js#L178-L185) |
| 代转化→公海 | [customerService.js:1107-1109](file:///c:/huakey-crm/backend/services/customerService.js#L1107-L1109) |

---
---

# V2 · 按业务确认口径修订（2026-11-03 业务确认 + 资源库语义修正）

> **V1 假设作废清单**：
> - ❌ V1「老板待分配池 = owner_id=老板」方案**已否决**（口径 1：老板不是待分配池持有者）
> - ❌ V1 A1「销售自建归创建人」**假设已确认成立**，且不再经过任何池
> - ❌ V1 A2「回收后原销售不可见」**假设已确认成立**
> - ❌ V1「潜客池可被认领」**假设作废**（资源库只读 + 转化，见 V3）
> - V1 的 Q2/Q3/Q5/Q6 已由本轮口径直接回答；仅保留 Q1（5 个 boss）等少数拍板项
>
> 本节口径以业务方 2026-11-03 两轮确认为准：五条口径 + 资源库语义修正 + 方案 A 拍板。

## V2.0 结论先行

1. **五条口径中，仅"部门边界"现状已支持**；口径 1（自建归创建人）与口径 3（回收不可见）**与现状相反**，口径 2（老板分口径计数）与口径 4（资源库语义）**缺失**。
2. **生产 423 条"线索"实际就是资源库**——422 条 `source='名片'`、`customer_type='prospect'`、2026-05~09 分批录入的真实名片数据。表结构已预留 `customer_type`/`converted_at`/`original_lead_id` 三个字段，方案 A（原地保留+关联）迁移成本接近零。
3. **现有 `uk_company_phone` 唯一索引因 phone 为 NULL 形同虚设**（Arcelik A.S. 存在 3 条重复实证），"同一公司一条有效正式客户"目前无任何强制。
4. 改造核心 = 四个字：**"收紧可见"**。删掉 permission.js self 兜底中的 `'sea'` 一处 + pool 权限收紧，即同时满足口径 3（回收不可见）和"公开池仅老板可再分配"。

## V2.1 五条口径逐条对照

| # | 口径 | 现状 | 判定 | 证据 |
|---|---|---|---|---|
| 1 | 销售自建客户直接归创建人，不先进池；老板同步可见但不挂老板名下 | **相反**：`addCustomer` 规则未命中（生产 0 规则=永不命中）→ `owner=NULL, status='lead'` 进线索池（资源库），创建人需再"转化/认领"才归自己 | 需改 | [customerDetailService.js:179-185](file:///c:/huakey-crm/backend/services/customerDetailService.js#L179-L185) |
| 2 | 老板实时看到客户总数（全部/正式/潜客(资源)/公开池） | **缺失**：dashboard 权限 boss 已有，但无按 `customer_type`×`pool_status` 拆分的四口径统计 | 缺失 | 生产权限实测；需新增统计接口+前端卡片 |
| 3 | 客户被回收后原销售完全看不见（含跟进记录） | **相反**：sales 数据范围 self 的兜底条款 `owner_id IS NULL AND status IN ('lead','sea')` 使**所有销售**（含原销售）仍可见已回收客户及其跟进 | 需改 | [permission.js:149-151](file:///c:/huakey-crm/backend/middleware/permission.js#L149-L151)；跟进记录可见性随客户（挂在客户详情下） |
| 4 | 资源库=全员可见的共享名录（只读+转化，见 V3）；销售手上全部是正式客户 | **混用**：资源与客户同一张表同一套状态机，"转化"是同行 UPDATE（资源转化后消失）；`assignmentStatusFragment` 对 lead 分配不改 status（分配资源给销售会使其持有 lead，违反本口径） | 需改 | [customerService.js:1073-1117](file:///c:/huakey-crm/backend/services/customerService.js#L1073-L1117)、[customerPoolState.js:58-79](file:///c:/huakey-crm/backend/utils/customerPoolState.js#L58-L79) |
| 5 | 采购/人事/财务各司其职 | **已支持**：purchase 持 purchase+supplier 全套、hr 持 hr+system:user/dept、finance 持 finance+invoice+payment+contract，均无越界客户权限 | 已支持 | 生产 sys_role_permission 实测（见 V2.2） |

## V2.2 权限矩阵（现状实测 vs 口径应有）

现状来源：生产 `sys_role_permission` 全量导出（2026-11-03）。✅=现状已有；⚠️=冲突项；❌=现状缺失。

### 客户域（客户/资源库/公开池/分配）

| 能力 | boss | super_admin | manager | sales | finance | purchase | hr |
|---|---|---|---|---|---|---|---|
| 查看全部客户 | ✅ view_all=1 | ✅ 旁路 | ✅ dept_and_sub | 仅自己 | ❌ | ❌ | ❌ |
| 新建正式客户 | ✅ | ✅ | ✅ | ✅（但归池不归人 ⚠️口径1） | ❌ | ❌ | ❌ |
| 分配/改派 | ✅ | ✅ | ✅ ⚠️（跨团队，口径"源头是老板"下存疑） | ❌（正确） | ❌ | ❌ | ❌ |
| 回收（release） | ✅ | ✅ | ✅ | ❌（正确） | ❌ | ❌ | ❌ |
| Excel 导入 | ✅ | ✅ | ✅ | **✅ ⚠️ 架空分配权** | ❌ | ❌ | ❌ |
| 资源库查看 | ✅ | ✅ | ⚠️（dept_and_sub 无 NULL 兜底，[permission.js:130-143](file:///c:/huakey-crm/backend/middleware/permission.js#L130-L143)，经理实际看不到无主资源，疑似现存 bug） | ✅ | ⚠️ 口径 4"全员可见"下应放开 leads:view | ⚠️ 同左 | ⚠️ 同左 |
| 公开池认领 pool:claim | ✅ | ✅ | ✅ | **✅ ⚠️ 口径下应回收**（再分配只归老板） | ❌ | ❌ | ❌ |

### 其他模块（现状即合理，逐角色列出权能边界）

| 角色 | 现状权能（实测） | 判定 |
|---|---|---|
| boss | 全模块全权限（客户/商机/报价/合同/发票/回款/采购/供应商/用户/角色/系统设置/报表/备份/审批） | 符合"老板能决定一切" |
| super_admin | 显式权限码仅 7 个，但走 `ADMIN_ROLE_CODES` 旁路 = 事实全能（[permission.js:20-24](file:///c:/huakey-crm/backend/middleware/permission.js#L20-L24)、[roles.js:43-45](file:///c:/huakey-crm/backend/config/roles.js#L43-L45)） | 符合（运维后门，注意与 boss 职责区分） |
| manager | 客户全套（含 assign/import/release）+ 采购全套 + hr + invoice:view + payment + 报价合同全套 + report + 审批 | ⚠️ 采购/人事权能与"各司其职"有张力；客户 assign 是否保留见拍板 Q3 |
| sales | 客户 add/edit/delete/export/import/list/view/transfer + pool:claim/view + leads:convert/view + 商机/报价/合同 + approval:approve | ⚠️ import 架空分配（见上表）；无 report（正确） |
| finance | finance + invoice 全套 + payment:edit/view + contract:edit/view + quotation:view + report + system:log | 符合"财务干财务" |
| purchase | purchase 全套 + supplier 全套 | 符合"采购干采购" |
| hr | hr + system:user(add/delete/edit)/dept/log | 符合"人事干人事" |

**冲突项汇总（需在改造中处理）**：① `customer:import` 授予 sales/manager 架空老板分配权；② manager 持 `customer:assign` 可跨团队；③ sales 持 `pool:claim` 与"公开池仅老板再分配"冲突；④ 经理 dept_and_sub 数据范围看不到无主资源（现存疑似 bug，"资源库全员可见"口径下需修）。

## V2.3 状态机与可见性（口径 4 + V3 资源库语义）

```
┌─────────────────────────────────────────────────────────────────────┐
│  资源库（客户名片共享名录）                                          │
│  数据形态：crm_customer 行，customer_type='prospect', status='lead',   │
│            owner_id=NULL（生产现状 423 条即此形态）                   │
│  可见：全员（leads:view）；只读共享：不可认领、不可被分配              │
│  操作：任何登录用户新增名片；boss/经理可编辑；"转为客户"见 V3         │
└────────────────┬────────────────────────────────────────────────────┘
                 │ ① "转为客户"（方案 A：新建正式客户行，资源行原地保留+标记）
                 │    操作者：销售（leads:convert 已有）/老板指派时指定销售
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  正式客户（销售持有）                                                │
│  数据形态：customer_type='customer', owner_id=销售, pool_status=     │
│            'private', business_status∈following/quoted/negotiating/  │
│            signed                                                   │
│  可见：本人（self）；经理（部门）；老板（all）                        │
│  入口：转化(①)/销售自建直接归创建人(②)/老板分配(⑤)                  │
└────────────────┬────────────────────────────────────────────────────┘
                 │ ② 销售自建直接归创建人（不经过资源库）
                 │ ③ 15 天未跟进自动回收（仅 following 阶段）
                 │ ④ 老板/经理手动回收（release，任意阶段）
                 │ ⑤ 老板 assign/batch-assign 改派（owner→owner，阶段不变）
                 │ ⑥ 离职：deleteUser 名下客户批量回收
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  公开池（待分配区，原"公海"）                                        │
│  数据形态：customer_type='customer', owner_id=NULL, status='sea'      │
│  可见：仅 boss/super_admin（经理可议，见拍板 Q3）；                   │
│        原销售及所有销售不可见（口径 3）                               │
│  操作：老板 assign 再分配（⑤）——销售无 pool:claim，不可自取          │
└────────────────┬────────────────────────────────────────────────────┘
                 │ ⑤ 再分配 → 回到「正式客户」（新销售名下）
                 └──────────────────────────────────────────────────────→
```

**三字段表达口径（现状字段零增删即可表达四态）**：

| 业务概念 | customer_type | status / business_status | owner_id | pool_status |
|---|---|---|---|---|
| 资源库条目 | prospect | lead / lead | NULL | private |
| 正式客户 | customer | following~signed | 销售本人 | private |
| 公开池（待分配） | customer | sea / following | NULL | sea |
| 资源"已转为客户" | prospect（保留） | lead | NULL（不动） | private + 转化标记（V3.3） |

**可见性规则（改动点清单——哪些查询会从可见变不可见）**：

| 查询/入口 | 现状 | 改后 | 受影响用户 |
|---|---|---|---|
| [permission.js:149-151](file:///c:/huakey-crm/backend/middleware/permission.js#L149-L151) self 兜底 | `owner=NULL AND status IN ('lead','sea')` 可见 | 删 `'sea'`：只看资源（lead）；已回收客户对全部销售**不可见** | 所有 sales 的客户/线索列表：**已回收客户从列表消失**（含其跟进记录——跟进挂在客户下） |
| 公海池页面 `/pool`（pool:view） | sales/manager 均可见可认领 | 收紧为仅 boss/manager（manager 部门内）；sales 的 pool:view/pool:claim 权限码从角色回收 | sales 不再看到"公海池"菜单与认领按钮 |
| 跟进记录 | 随客户可见性 | 同上（客户不可见则跟进不可见） | 同上 |
| 15 天逾期提醒（cron） | 通知 owner | 回收后 owner=NULL 自然不再提醒，无需改 | 无 |

## V2.4 15 天未跟进回收机制的取舍

**保留，目的地不变（公开池），仅收紧可见性。** 理由：现状回收链（[poolService.js:467-525](file:///c:/huakey-crm/backend/services/poolService.js#L467-L525)）目的地 `owner=NULL/sea` 与口径"回收→待分配→再分配"完全吻合，且离职链（[userRouteService.js:321-323](file:///c:/huakey-crm/backend/services/userRouteService.js#L321-L323)）同样落 sea——两链目的地统一，无需"回老板"的额外载体（V1 方案作废后由可见性收紧替代）。回收范围仍仅 `status='following'`（[poolService.js:479](file:///c:/huakey-crm/backend/services/poolService.js#L479)）：quoted/negotiating/signed 不自动回收，老板可手动回收（assign to NULL）——高阶段滞留客户建议走逾期报表提醒老板，不动回收逻辑。

## V2.5 修订后改造步骤（替代 V1 的 S1–S6）

| 步 | 内容 | 改动文件 | 用户可见变化 | 回滚 | 数据校验 |
|---|---|---|---|---|---|
| S1 | 引擎收敛（同 V1：applyAssignRule 委托基座、统一轮询语义、在职过滤、修工作流 assign 半成品） | automationService/assignService/customerService | 无 | git revert | 现有单测全绿 |
| S2 | 自建归创建人：`addCustomer` 按 creator 角色分支——sales/manager → `owner=creator, customer_type='customer', status='following'`；boss 新建 → 入资源库（prospect）或表单指定负责人直接正式 | customerDetailService.js L179-192 | **有**：销售新建客户从"进潜客池"变为"归我名下" | git revert；已建客户可批量改派纠偏 | 新增单测：三分支归属断言 |
| S3 | 可见性收紧：self 兜底删 `'sea'`；sales/manager 的 pool:claim、sales 的 pool:view 权限码回收（数据层 sys_role_permission 变更，需迁移脚本） | permission.js L149-151 + 权限迁移 SQL | **有**：销售列表不再出现已回收客户；公海池菜单消失 | 还原权限行 + revert | 回归 E2E：客户列表/线索/公海/跟进 |
| S4 | 转化改造（方案 A 核心，见 V3.3–V3.4）：convert 从"同行 UPDATE"改为"新建正式客户行 + 资源行保留标记 + 唯一性/并发拦截" | customerService.js L1073-1146 + 一列 schema 迁移 | **有**：转化后资源仍在库、多了"已转化"标记与跳转 | revert + 数据修复脚本（合并误建的重复行） | 专项测试：并发双转、重复公司拦截 |
| S5 | 离职/再分配闭环：现状已落 sea（无需改目的地）；补 assign_log 记录"离职收回"；回答拍板 Q1 后上线 | userRouteService.js | **有**：离职客户从"人人可抢"变为"仅老板可见待分配" | revert | 离职 E2E 流程 |
| S6 | 老板统计面板（口径 2）：四口径计数接口（全部=425、正式、资源库、公开池）+ 顶栏卡片；分配成功通知新负责人 | 新增 stats 接口 + 前端 | 增量 | revert | 计数与实查一致 |

依赖：S2/S3/S4 互相独立；S5 依赖 S3（可见性先收紧）；S6 随时可做。**全案仅 S4 需要一列 schema 迁移，其余零 schema。**

## V2.6 拍板问题 → 已全部裁决（2026-11-03 业务确认，详见 V4）

| # | 问题 | 裁决 |
|---|---|---|
| Q1 | 5 个 boss 账号，离职/回收的再分配权 | **lvcongming 与 admin（梁工人）两账号共同持有待分配区分配权**，不做独占锁，先到先得（乐观锁保证唯一归属），审计记录"谁分配给了谁"，并发后手收到明确提示 |
| Q2 | 重复转化判重键 | 公司名标准化 + 电话；**电话为空时退化为纯公司名**（✅ 2026-11-03 业务复述确认，V5 定稿） |
| Q3 | manager 的 customer:assign | **收回**，经理仅只读+看团队；分配权只在 boss |
| Q4 | 资源库编辑权 | **boss 与 manager 可编辑，销售只读**（含不可新增/删除资源条目） |

术语：「潜客池/线索池」对外统一为**「客户资源库」**（✅ 命名已确认，2026-11-03）。完整术语表（**唯一口径**）见 V5.1。

---
---

# V3 · 资源库与客户分离（方案 A 已拍板）

## V3.1 现状核对：crm_customer 里的"线索"到底是什么角色

**结论：现状的 423 条"线索"就是业务口中的"资源库"（名片名录），与正式客户混在同一张表、同一套状态机里。** 证据链：

| 证据 | 数据/代码 | 结论 |
|---|---|---|
| 生产数据画像 | 423 条 `business_status='lead'` 客户：**422 条 `source='名片'`**、1 条 NULL source；`customer_type='prospect'` 全部；`owner_id=NULL` 全部；`converted_at` 全 NULL；`is_demo=0`；录入时间 2026-05-16 ~ 09-10 | 真实名片录入数据，不是测试/演示数据，也不是"待转化销售线索"的业务流——就是共享名录 |
| 表结构已预留类型字段 | `crm_customer.customer_type`（默认 'prospect'）与 `converted_at`、`original_lead_id`（[DESCRIBE 实测]） | schema 层面早有"资源 vs 客户"分离的设计意图，只是流程未用 |
| 线索列表 | `routes/leads.js` L8 注释与实现：线索列表 = `status='lead'`，支持 customer_type/lifecycle_status 筛选（L138-240） | "潜客池"页面 = 对这批名片数据的查询入口 |
| 转化 = 同行 UPDATE | `convertLeadToCustomer`（[customerService.js:1073-1117](file:///c:/huakey-crm/backend/services/customerService.js#L1073-L1117)）：同一行改 `customer_type prospect→customer`、`business_status lead→following`、`converted_at=NOW()` | **资源被转化后原条目消失**（变成客户行）——与资源库语义相反 |
| 唯一约束形同虚设 | `uk_company_phone(company_name, ...)` 唯一索引，但 phone 为 NULL 的行不受约束：Arcelik A.S. ×3、ONAYSAN ×3、PT.HARTONO ×3 等重复真实存在 | 重复录入/重复转化当前无任何拦截 |
| 供应商已有独立体系 | `crm_supplier` / `crm_supplier_contact` / `crm_customer_supplier_relation` 等表独立存在 | "客户与供应商的共享名录"中供应商半边已是独立表，客户半边挤在 crm_customer |

## V3.2 同一表混用的具体问题

1. **资源转化即消失**：`convertLeadToCustomer` 同行 UPDATE——转化后名片条目不再出现在资源库列表（status 不再是 lead），其他人查不到该名片，违背"共享名录"存在前提。
2. **资源与归属混行**：全员可见（self 兜底 `status IN ('lead','sea')`）与个人归属（owner_id）两种互斥语义靠同一行不同字段拼装，见 V2.3 改法。
3. **重复无识别**：`uk_company_phone` 因 NULL phone 逃逸，同一公司名片可无限重复录入；转化后"同一公司多条有效客户"也无约束（转化 3 次 Arcelik = 3 条正式客户理论可行）。
4. **统计口径被污染**：客户报表/漏斗把 prospect 行算进"客户总数"或漏算，四口径（全部/正式/资源/公开池）无法直接出数——口径 2 的根因。
5. **`assignmentStatusFragment` 语义重载**：线索分配分支（[customerPoolState.js:58-79](file:///c:/huakey-crm/backend/utils/customerPoolState.js#L58-L79)）把"给资源指定负责人"和"给客户改派"混在一个状态机里，V2 口径下资源不可被分配，此分支应废弃。

## V3.3 方案 A（已拍板）：原地保留 + 双向关联

**方案 A（确认采用）——共用 crm_customer 表，"转为客户"新建行 + 双向链接：**

- 资源行（prospect）**原地不动**，永远留在资源库，所有人可继续查看；
- 转化时**新建一行正式客户**（customer_type='customer', owner=指定销售, status='following', pool_status='private'）；
- 双向关联（字段均已存在或仅需一列）：
  - 新客户行写 `original_lead_id = 资源行id`（字段已存在、当前全空——正好启用）；
  - 资源行写 `converted_customer_id = 新客户行id`（**唯一新增 schema：一列 INT + 普通索引**），配合既有 `converted_at` 时间戳构成"已转为客户"标记与跳转链接；
- 资源列表筛选：`converted_customer_id IS NULL`（未转化）/ `IS NOT NULL`（已转化）。

（存档）**方案 B——独立 crm_resource 表**：资源独立建表（对齐 crm_supplier 的做法），`crm_customer.resource_id` 引用。语义最干净，但需新建表+迁移 423 行+重写 leads 全套路由/前端/权限，改动量约为 A 的 5 倍，且 A 的既有字段（customer_type/original_lead_id/converted_at）本来就是为此预留的。**已按业务拍板采用 A。**

## V3.4 "转为客户"的原子性（已确认口径：重复录入与重复转化必须拦截）

| 层 | 落点 | 实现 |
|---|---|---|
| 服务层（主拦截） | 转化事务内 | ① 事务内 `SELECT ... FOR UPDATE` 锁资源行；② 判 `converted_customer_id IS NULL`——非空则回滚并提示**「该名片已转为客户（负责人：X），请在正式客户中查看」**；③ 判重：`SELECT id, owner_id FROM crm_customer WHERE customer_type='customer' AND deleted_at IS NULL AND company_name=<归一化> AND pool_status='private' FOR UPDATE`——命中则提示**「该公司已存在有效正式客户（负责人：X），不得重复转化」**；④ 新建客户行 + UPDATE 资源行 `converted_customer_id`/`converted_at`，同事务提交 |
| 数据库层（兜底） | 唯一索引 | 资源防重复转化：资源行加 `uk_resource_once (converted_customer_id)`——**一个 converted_customer_id 只能被一个资源行指向**，并发双转第二个 UPDATE 落索引冲突即失败；公司防重复：正式客户行加生成列 `active_customer_key = CASE WHEN customer_type='customer' AND pool_status<>'sea' THEN UPPER(TRIM(company_name)) ELSE NULL END` + 唯一索引（MySQL 唯一索引对 NULL 不生效 → 非正式客户行天然豁免；软删除行需在删除时将 key 置 NULL，在软删除路径统一处理） |
| 并发窗口 | 两人同时转同一资源 | 双保险：行锁串行化 + 唯一索引兜底，后者覆盖任何锁失效场景；冲突方收到 409 + 上述文案 |
| 失败回滚 | — | 新建客户与资源标记在同一事务：任一步失败整体回滚，不留"客户建了、标记没打"的半条数据（符合项目事务铁律） |

> 注：`active_customer_key` 唯一索引会拦截现状已存在的重复（Arcelik ×3 等）——**上线前需先清洗存量重复或先上服务层拦截、索引分步上**，此为 S4 的数据校验项。

## V3.5 资源库列表默认筛选

- 默认视图 = **未转化**（`converted_customer_id IS NULL`），避免已转化条目干扰查阅（口径 4 补充）；
- 筛选器提供：全部 / 未转化 / 已转化（已转化行展示"已转为客户 → 跳负责人 X"链接）；
- 落点：`routes/leads.js` 列表查询（L138 起）加 `converted_customer_id` 过滤参数 + 前端 [leads/List.vue](file:///c:/huakey-crm/frontend/src/views/leads/List.vue) 筛选区与状态标签。

## V3.6 术语与界面文案改动清单（只列不改；**已被 V5.4 权威清单取代**，存档）

| 现文案 | 改为 | 现位置 |
|---|---|---|
| 菜单"潜客池" | "客户资源库" | [Sidebar.vue:37](file:///c:/huakey-crm/frontend/src/components/layout/Sidebar.vue#L37)（权限码 `leads:view` 不动） |
| 路由标题"潜客池" | "客户资源库" | [router/index.js:63](file:///c:/huakey-crm/frontend/src/router/index.js#L63) |
| 列表按钮"转化"及相关确认文案 | "转为客户"（确认语"转化后将进入跟进中状态"→"将为该名片创建正式客户并指定负责人，名片保留在资源库"） | [List.vue:251-263](file:///c:/huakey-crm/frontend/src/views/leads/List.vue#L251-L263) |
| 菜单"公海池" | ~~"公开池（待分配）"~~（**措辞作废**——"公开池"系自创术语，违反 V5.1 铁律；按术语表并入"客户资源库"，"待分配"视图承载于资源库内，见 V5.1 实施解释与 V5.4） | [Sidebar.vue:39](file:///c:/huakey-crm/frontend/src/components/layout/Sidebar.vue#L39)（S3 后该菜单对 sales 消失） |
| 状态标签"线索/潜在客户" | "资源" + "已转为客户"标记 | leads/List.vue 状态列（实施时定位） |
| 空态提示"暂无线索" | "资源库为空，可录入名片或导入" | leads/List.vue 空态（实施时定位） |
| 菜单"分配规则" | 保留（其管理对象 S1 后仅服务新建自动匹配） | [Sidebar.vue:40](file:///c:/huakey-crm/frontend/src/components/layout/Sidebar.vue#L40) |
| 后端权限码 leads:view / leads:convert / pool:claim / pool:view | **不改**（改码属破坏性变更，仅回收 sales 的 pool:claim/pool:view 授权） | sys_role_permission 数据层 |

## V3.7 存量 425 条数据的处理

| 存量 | 处理 | 依据 |
|---|---|---|
| 423 条名片资源（prospect/lead/无主） | **零迁移**：它们本来就是资源库数据形态（source='名片'、prospect、无主、未转化），方案 A 直接把它们当资源库读 | V3.1 画像 |
| 存量重复名片（Arcelik ×3 等 8+ 组） | 上线前人工合并/标记（V3.4 唯一索引前置清洗），或第一期仅启用服务层拦截、索引二期上 | V3.4 注 |
| 2 条公开池（customer/sea） | 留在公开池待老板分配（S3 后销售不可见，老板 view_all 可见）；老板可 batch-assign 派出 | V2.3 |
| `original_lead_id`（当前全空） | 启用为"新客户行→资源行"反向链接；历史 2 条已转化客户无需回填（converted_at 已有值） | V3.3 |

---

## 附：V2/V3 新增证据索引

| 结论 | 证据 |
|---|---|
| 423 条线索=名片资源（422 条 source='名片'，prospect，无主，未转化，is_demo=0，2026-05-16~09-10） | 生产 crm_customer SELECT（2026-11-03） |
| 唯一索引 uk_company_phone 因 NULL phone 逃逸，Arcelik A.S.×3 等重复存在 | 生产 SHOW INDEX + GROUP BY HAVING（2026-11-03） |
| 转化=同行 UPDATE，资源转化后消失 | [customerService.js:1073-1117](file:///c:/huakey-crm/backend/services/customerService.js#L1073-L1117) |
| original_lead_id / converted_at / customer_type 字段已存在且基本未用 | 生产 DESCRIBE crm_customer（original_lead_id 全 NULL，converted_at 仅 2 条） |
| 线索列表=status='lead' | [routes/leads.js:8](file:///c:/huakey-crm/backend/routes/leads.js#L8)、L138-240 |
| 前端菜单：潜客池/正式客户/公海池/分配规则 | [Sidebar.vue:37-40](file:///c:/huakey-crm/frontend/src/components/layout/Sidebar.vue#L37-L40) |
| 7 角色全量权限码 | 生产 sys_role_permission 全量导出（2026-11-03），本节 V2.2 矩阵 |
| super_admin 走旁路（显式码仅 7 个但事实全能） | [permission.js:20-24](file:///c:/huakey-crm/backend/middleware/permission.js#L20-L24)、[roles.js:43-45](file:///c:/huakey-crm/backend/config/roles.js#L43-L45) |
| 经理 dept_and_sub 无 NULL 兜底（看不到无主资源） | [permission.js:130-143](file:///c:/huakey-crm/backend/middleware/permission.js#L130-L143) |

---
---

# V4 · 口径收口与 Arcelik 数据合并执行记录（2026-11-03）

> 本节含**唯一一次已授权的生产写操作**：Arcelik A.S. 三条重复记录合并（软删除）。其余全部只读。
> 备份文件：`database/backups/pre-merge-20261103-161358.sql`（12 行数据：3 客户 + 6 联系人 + 3 池日志，权限已收紧为仅当前用户）。

## V4.0 结论先行

1. **四条拍板口径中，Q1 的并发安全现状已基本满足**——`manualAssign` 的乐观锁（`WHERE owner_id <=> 原值`）+ `crm_assign_log`（from/to/remark）正是"先到先得+谁分给谁"的现成实现（[assignService.js:252-266](file:///c:/huakey-crm/backend/services/assignService.js#L252-L266)）；改造只需对齐 lvcongming/admin 两账号的授权与冲突提示文案。**不需要新代码路径。**
2. **Arcelik 合并已完成并全量校验通过**：1 条有效（id=341）+ 2 条软删除（342/378），6 个联系人全部挂主记录，审计日志（pool_log 3 条）按历史原样保留。
3. **执行中实测一次防御机制生效**：首次合并尝试被 `uk_contact_primary_per_customer` 函数唯一索引拦截（每客户仅一个 primary 联系人），事务自动回滚零污染，调整 `is_primary=0` 后二次执行成功——数据库层兜底真实有效。
4. **生产发票数据当前为 0 条**（迁移 129/130 水位回填影响 0 行的记录佐证），发票与客户改造的交叉影响是前瞻性设计约束，不是现存数据风险。

## V4.1 四条口径的落地要点（对现有代码的映射）

| 口径 | 现状支持度 | 落地改动 |
|---|---|---|
| Q1 双 boss 待分配区 | `assign` 接口已有乐观锁+assign_log（[assignService.js:252-266](file:///c:/huakey-crm/backend/services/assignService.js#L252-L266)）；乐观锁失败已抛"客户归属刚被他人修改，请刷新后重试"类错误 | ①权限配置：customer:assign 收敛到 boss（lvcongming/admin/Rin 等 boss 角色）；②冲突提示文案对齐口径（后手明确知道是另一位 boss 已分）；③assign_log 的 remark 规范记录"谁分配给了谁"（from_user_id/to_user_id 字段已在 [baseline schema](file:///c:/huakey-crm/database/migrations/000_real_baseline.sql#L155-L169) 中） |
| Q2 判重键 | 无实现 | 公司名标准化（UPPER+TRIM）+电话；电话空退化纯公司名（✅ 已确认，V5.1）。落点在转化事务判重查询（V3.4） |
| Q3 经理只读 | manager 持 customer:assign（生产实测） | 权限迁移 SQL：回收 manager 的 customer:assign；连带核对 requireManager 中间件（[admin.js:36-47](file:///c:/huakey-crm/backend/middleware/admin.js#L36-L47)）不再对 manager 放行分配路由 |
| Q4 资源编辑权 | leads 路由现按 customer:add 等码控制（[leads.js:49-55](file:///c:/huakey-crm/backend/routes/leads.js#L49-L55)） | 资源新增/编辑/删除路由加角色门（boss/manager），sales 仅 view+convert |

## V4.2 Arcelik A.S. 合并执行记录

**差异分析（合并前）**：

| 维度 | 341（主，选定） | 342（从） | 378（从） |
|---|---|---|---|
| 联系人 | Orcun Yurdusen（Purchasing Manager） | Yavuz Tortum（Senior Executive-Purchasing） | 刘志淼（模具工程师） |
| 地址 | 土耳其总部（Karaağaç OSB） | 土耳其总部（同地址） | 深圳分公司 |
| 创建时间 | 05-16 23:14:17 | 05-16 23:14:17 | 05-16 23:14:18 |
| 电话/邮箱 | 完整 | 完整 | 完整（深圳号码） |
| 联系人记录 | 2（336 主+851 冗余） | 2（337 主+852 冗余） | 2（371 主+886 冗余） |
| 池日志 | 1（auto_release） | 1 | 1 |
| 其他关联（跟进/商机/合同/报价/发票等 18 表） | 0 | 0 | 0 |

**主记录选择依据**：341 为公司总部名片（342 同为总部但 id 更大；378 为深圳分部），创建时间相同，故取 id 最小的总部记录 341。

**执行过程**（顺序合规）：

1. 差异分析（只读）✅ 上表；
2. 定向备份 ✅ `database/backups/pre-merge-20261103-161358.sql`（mysqldump 三表 --where 定向导出，244 行，含 CREATE+INSERT+完成标记，12 行数据全量回验在文件内，权限 600 等价）；
3. 事务合并：首次尝试被 `uk_contact_primary_per_customer` 唯一索引拦截（函数索引 `if(is_primary=1 AND deleted_at IS NULL, customer_id, NULL)`，主记录已有 primary 联系人 336）→ 事务自动回滚（回滚状态经查询确认：各计数未变、零污染）→ 调整为改挂时置 `is_primary=0` 二次执行成功；
4. 校验 ✅ 见下表。

**合并前后对照**：

| 校验项 | 合并前 | 合并后 | 结果 |
|---|---|---|---|
| Arcelik 有效（deleted_at IS NULL） | 3 | **1**（id=341） | ✅ 唯一有效 |
| Arcelik 软删除 | 0 | 2（342/378） | ✅ |
| 主记录 341 名下联系人 | 2 | 6（337/852/371/886 改挂，is_primary=0） | ✅ 4 条迁移 |
| 从记录残留联系人 | — | 0（customer_id IN (342,378) 有效行） | ✅ 无孤儿 |
| 341 的 primary 联系人 | 1（336） | 1（336，唯一） | ✅ 约束保持 |
| crm_pool_log（审计历史） | 3 条 | 3 条（customer_id 原样保留 341/342/378 各 1） | ✅ 有意不改挂（审计完整性优先） |

**回滚方式**（如需）：备份文件按表恢复，或反向事务（342/378 `deleted_at=NULL` + 4 条联系人按备份改回原 customer_id 并恢复 is_primary）。

## V4.3 其余重复组清单（只报告，不动手，供业务决策）

按公司名标准化（UPPER+TRIM）扫描有效记录（deleted_at IS NULL），剩余 8 组重复（均为 lead/资源形态，合并可参照 V4.2 流程）：

| 标准化公司名 | 条数 | 记录 id |
|---|---|---|
| ONAYSAN | 3 | 353, 354, 355 |
| PT.HARTONO ISTANA TEKNOLOGI (POLYTRON) | 3 | 334, 335, 337 |
| MALLORY | 2 | 347, 348 |
| PT.ASTRA OTOPARTS | 2 | 364, 365 |
| PT.SANGO CERAMICS INDONESIA | 2 | 351, 369 |
| 东莞市中旺精密仪器有限公司 | 2 | 254, 312 |
| 深圳市和久科技有限公司 | 2 | 395, 398 |
| 群基精密工业（苏州）有限公司 | 2 | 253, 314 |

注：标准化合并了大小写差异（如 PT.Astra/PT.ASTRA）；Arcelik 组已处理完毕不在表中。

## V4.4 可执行排期（S1–S7，替代 V2.5 概览）

| 步 | 内容 | 改动文件 | schema | 用户可见变化 | 回滚 | 验收判据 | 工作量 | 风险 |
|---|---|---|---|---|---|---|---|---|
| S1 | 引擎收敛：applyAssignRule 委托 autoAssignOwner、统一轮询语义、在职过滤、修工作流 assign 半成品（R14） | automationService/assignService/customerService | 无 | 无 | revert | 单测全绿+工作流 assign 后四字段一致且写 assign_log | 小 | 低 |
| S2 | 新建/导入归属：sales/manager 自建→owner=creator、customer_type='customer'；boss 新建→资源库；Excel 导入 owner 不再=导入人（统一走同一分支） | customerDetailService.js L179-192、importService.js L163 | 无 | **有**：销售新建即归自己；导入客户不再归导入人 | revert+批量改派纠偏 | 三分支归属单测；import 行为断言（此前无 owner 断言——补测试） | 中 | 中 |
| S3 | 可见性收紧+权限调整（含 Q3/Q4）：self 兜底删 'sea'；manager 收 customer:assign；sales 收 pool:claim/pool:view；资源编辑限 boss/manager | permission.js L149-151 + 权限迁移 SQL + leads 路由角色门 | 无（数据层权限行） | **有**：销售看不到已回收客户；经理无分配按钮；公海菜单消失 | 还原权限行+revert | 权限矩阵 E2E（7 角色×核心动作）；已回收客户对销售 404 | 中 | 中 |
| S4 | 转化改造（方案 A）：新建客户行+原行保留标记（converted_customer_id 列）+判重（Q2 口径）+并发拦截；唯一索引分两步（服务层先行，存量清洗后上索引） | customerService.js L1073-1146 + 迁移（1 列+1 函数索引） | **有** | **有**：转化后名片仍在库+"已转为客户"标记 | revert+合并误建行修复脚本 | 并发双转仅一成功；重复公司拦截提示；资源行不动断言 | 大 | 高 |
| S5 | 离职/再分配闭环（Q1）：确认现释放链落 sea 正确；assign_log 补"离职收回"remark；冲突提示文案对齐 | userRouteService.js | 无 | **有**：离职客户仅双 boss 可见待分配 | revert | 离职 E2E：客户落 sea、原销售不可见、assign_log 有记录 | 小 | 低 |
| S6 | 老板面板（口径 2）+分配通知：四口径计数接口+卡片；assign/转化成功通知新负责人 | 新 stats 接口+前端 | 无 | 增量 | revert | 计数与实查一致；通知送达 | 中 | 低 |
| S7 | 存量清洗：V4.3 的 8 组重复按 Arcelik 流程逐组合并（需业务逐组确认主记录） | 数据操作（参照 pre-merge 备份模式） | 无 | 名片库去重 | 每组定向备份+反向事务 | 每组前后对照表 | 小×8 | 低 |

上线顺序建议：S1 →（S2、S3、S5 可并行）→ S4 → S6 常态迭代 → S7 随业务节奏。S4 是唯一 schema 变更与高风险点，放在可见性收紧（S3）验证之后。

## V4.5 「发票前端」与「资源库/客户分离」交叉影响说明

**结论：客户归属改造不影响开票权限；发票可见性与客户可见性解耦。** 依据：

1. **发票数据范围基于 create_by，不基于客户归属**：发票全套路由挂 `checkDataPermission('invoice', 'create_by')`（[invoice.js:60-120](file:///c:/huakey-crm/backend/routes/invoice.js#L60-L120)）——行级门是"发票创建人"，与客户的 owner_id 无关。客户回收/改派/离职转移均不改发票的 create_by，发票可见性不变。
2. **开票权限由权限码决定**：invoice:add 为 finance/boss/manager 持有（生产实测），销售本就无开票权；客户归谁不进入开票判定链。
3. **资源库分离对发票零影响**：发票挂在正式客户行的 customer_id 上；方案 A 下资源行（prospect）永远不会被开票，转化新建的正式客户行才是合法开票对象。生产发票数据当前为 0 条（迁移 129/130 回填影响 0 行佐证），无存量挂错风险。
4. **两个需要注意的前端联动点**（实施 S3/S4 时一并核对）：
   - 发票列表/详情页如显示客户名称（JOIN crm_customer），已回收客户（owner=NULL/sea）对无 customer 数据范围的财务用户，客户名可能显示为空或脱敏——需在发票页面对客户 JOIN 做只读豁免（发票本身可见即可，客户名作为展示字段）；
   - 转化新建客户行后，新客户 id 与资源 id 不同——发票创建时的客户选择器必须只允许选择 customer_type='customer' 的行（过滤资源行），避免把发票挂到资源上。

## V4.6 残留待办（V5 后更新）

- ~~Q2 判重键"电话空退化纯公司名"~~——✅ 已确认（2026-11-03，见 V5.1）；
- ~~「客户资源库」命名~~——✅ 已确认（2026-11-03，见 V5.1）；
- V4.3 的 8 组重复合并——**唯一残留业务前置**：待业务逐组指定主记录后执行（S7，流程见 V5.3）；
- 8 组之外的近似重复（如子公司后缀差异 "Arcelik A.S." vs "Arcelik China"）未做模糊匹配扫描，如需补充需业务定义相似度规则（备案，不阻塞）。

---
---

# V5 · 定稿（2026-11-03 业务最终确认）

> 本节为全文收口：四条历史待办全部关闭（Q2 判重键、命名、423 定性、休眠账号）、术语表定为唯一口径、S1–S7 排期定稿。**本节之后无任何待拍板项**；唯一业务前置输入 = S7 的逐组主记录确认。V1–V4 与本节冲突处，一律以本节为准。

## V5.0 结论先行

1. **存量零迁移**：生产 423 条 lead 定性为**资源**（不是待分配客户、不构成数据缺陷），任何"给存量客户补 owner"的动作已从全部 S 系列删除；V1 §4.3 / V1-S5 / V1-Q2 选项 A 同步标注作废。此前文档中"425 个无归属/活跃客户待处置"类表述一律以 V5.2 口径为准。
2. **术语唯一口径**：V5.1 术语表为唯一口径；铁律——**不得自行发明新术语，新增术语需业务方确认**（V3.6 曾建议的"公开池（待分配）"即因违反此条作废）。
3. **S1–S7 最终顺序**：S1 →（S2、S3、S5 并行）→ S4a →（S6、S7 并行）→ S4b（唯一索引最后上）。全程仅 S4 涉及 schema（一列 + 函数索引），其余零 schema。
4. **总工作量约 74–106 人时**（含单测/E2E/回归）：S3 承担全部术语文案集中改造，避免文案散落多步漏改；S4（转化改造）约占 1/3、唯一高风险步。
5. **每步均有业务自验动作**（V5.3"业务验收动作"列 + V5.5 总清单），上线后无需开发陪同即可验收。

## V5.1 术语表（唯一口径，2026-11-03 用户确认）

| 原术语 | 统一后 | 含义 |
|---|---|---|
| 潜客池 / 线索池 / 公海池 | 客户资源库 | 共享查阅区，所有人只读，不可占用 |
| 领取 / 认领 | 转为客户 | 不是拿走；资源条目原地保留，新建正式客户并关联 |
| 销售手上的 | 我的客户 / 正式客户 | 归属某人的正式客户 |
| 回收 | 收回到待分配（或"收归公司"） | 回到老板待分配区，原销售不可见 |

**铁律：不得自行发明新术语；新增术语需业务方确认。**（"待分配"取自本表"收回到待分配"，属已确认表述；派生措辞如"资源""新增资源""未转化/已转化"若上界面，须随验收请业务方过目，见 V5.4 标注。）

**三条实施解释**（不新增术语，仅消歧；均不改变已确认口径）：

1. **「公海池」并入「客户资源库」的方式**：原"潜客池""公海池"两个菜单合一为"客户资源库"。资源库页内提供筛选视图"全部 / 未转化 / 已转化 / **待分配**"；其中"待分配"视图按数据权限渲染——双 boss 可见并可分配，普通销售不可见（口径 3 由 S3 数据范围保证）。**术语统一 ≠ 放开可见性**："所有人只读"指名片资源条目；已回收客户仍只对老板可见。
2. **「领取/认领」两个场景分开处理**：作用于资源条目的"认领线索"→ 改为"转为客户"（S4a）；作用于已回收客户的"认领公海客户"**功能随 S3 权限回收下线**（销售不再能抢），老板侧对应动作叫"分配"（assign）。
3. **代码层不动**：表名、路由、权限码（leads:view / leads:convert / pool:claim / pool:view）一律不改，仅改用户可见文案与 sys_permission 的显示名（name 列）。

## V5.2 存量 423 条 lead 的最终定性（替代 V1 §4.3）

**它们是资源库的正常数据形态——不是"全在公海待分配的活跃客户"，不需要业务确认处置，也不需要任何迁移。**

- 数据画像（V3.1 实测）：422 条 source='名片'，全部 prospect / lead / 无主 / 未转化、is_demo=0——即名片名录本体；
- 方案 A（V3.3）上线后，它们原地成为「客户资源库」内容，`converted_customer_id IS NULL` 即"未转化"默认视图，**零迁移、零改写**；
- 唯一相关存量动作是 **S7 重复清洗**（8 组重复名片合并，V4.3），与"补 owner"无关；
- 其余 2 条公开池（sea）客户维持 V2.3 处理：留在待分配视图，由老板用现有 assign 派出。

## V5.3 S1–S7 最终排期定稿

> 人时为含单测/E2E/回归的工程估算（熟悉本仓库的 1 后端为主，前端按步介入）。"可见变化"= 普通用户能否感知；"连带文案"= 该步需同步完成的 V5.4 清单项（防止文案散落漏改）。

| 步 | 内容（定稿） | 预计工作量 | 依赖与并行 | 可见变化 | 业务验收动作（业务方自验） | 连带文案 | 回滚 |
|---|---|---|---|---|---|---|---|
| S1 | 引擎收敛：applyAssignRule 委托 autoAssignOwner、统一轮询语义、在职过滤、修工作流 assign 半成品（R14） | 6–8 人时 | 无前置；可与 S2/S3/S5 并行 | **否** | 无界面变化，业务方不参与；开发侧验收=单测全绿 + 测试库工作流 assign 演练（四字段一致 + 写 assign_log） | 无 | git revert，零 schema |
| S2 | 新建/导入归属：sales/manager 自建→owner=创建人、customer_type='customer'；boss 新建→资源库；Excel 导入不再归导入人 | 8–12 人时 | 无前置；与 S1/S3 并行 | **是** | ① 销售账号新建客户 → 立即出现在"我的客户"，负责人=自己；② 销售账号 Excel 导入 2 条 → 导入人名下**不**新增客户（落资源库）；③ 老板账号新建名片 → 出现在客户资源库 | B7 | git revert + 批量改派纠偏 |
| S3 | 可见性收紧 + 权限调整 + **术语文案集中改造** | 12–16 人时 | 无硬前置；建议先于 S4 上线（唯一索引前必须已收紧防抢客）；与 S1/S2 可并行 | **是** | ① 销售登录：已回收客户从列表/详情/跟进中消失、无"待分配"视图入口；② 经理登录：无分配按钮、资源库可编辑可新增；③ 采购/人事/财务登录：可见资源库但只读无操作按钮；④ 销售直调已回收客户详情/认领 API → 403/404；⑤ 全站界面搜不到旧词（潜客池/线索池/公海/认领/领取） | **文案主战场**：A1–A8、A10（标签改口）、A11、A12、B1–B6、C1、C3 | 还原 sys_role_permission 行 + revert；权限显示名/状态字典走独立迁移（带 _down） |
| S5 | 离职/再分配闭环：确认现释放链落 sea；assign_log 补"离职收回"remark；双 boss（lvcongming/admin）冲突提示文案 | 4–6 人时 | 与 S2/S3 并行（纯后端小改）；"原销售不可见"效果依赖 S3 | **是** | ① 离职一个测试销售账号 → 其名下客户出现在待分配视图；② 另一销售账号查 → 不可见；③ lvcongming 与 admin 均可见可改派，后手收到"已被分配"明确提示；④ 分配日志出现"离职收回"记录 | B4 | git revert |
| S4a | 转化改造·服务层拍：判重（Q2 口径）+ 并发拦截 + converted_customer_id 列迁移 + "转为客户"前端全套 | 16–20 人时 | **依赖 S3 上线并回归通过** | **是** | ① 资源库挑一张名片点"转为客户" → 正式客户出现新行、原条目保留并带"已转为客户"标记可跳转；② 同一条目二次转化 → 拦截提示（含负责人姓名）；③ 转化一家已有有效正式客户的公司（同名同电话）→ 被判重拦截；④ 两账号同时转化同一名片 → 仅一人成功，后手收到 409 文案 | A9、A10（"已转为客户"标记）、B5-③ | revert + 合并误建行修复脚本 |
| S7 | 存量清洗：V4.3 的 8 组重复按 Arcelik 流程逐组合并（定向备份→事务合并→前后对照） | 8–16 人时（每组 1–2 人时） | **唯一业务前置**：逐组确认主记录；确认后即可执行，可与 S4a/S6 并行，**仅须在 S4b 前完成** | **是**（资源库去重） | 资源库逐家搜索 8 组公司名 → 每家仅剩 1 条有效记录，各原记录联系人（姓名/电话/邮箱）在主记录下齐全 | 无 | 每组定向备份 + 反向事务（Arcelik 模式，参照 V4.2） |
| S4b | 转化改造·索引拍：转化判重唯一索引上线（服务层拦截之上的兜底） | 8–12 人时 | **依赖 S7 全部完成**（存量清洗后才可上索引） | **否**（S4a 已上线拦截提示，索引仅兜底） | 业务无感；开发侧验收=测试库构造重复被数据库拒绝、_down 可回滚 | 无 | drop index（迁移带 _down） |
| S6 | 老板面板 + 分配通知：四口径计数（全部/正式/资源库/待分配）接口 + 顶栏卡片；assign/转化成功通知负责人 | 12–16 人时 | 依赖 S4a（"已转化"口径需 converted_customer_id 列）；其余无前置 | **是**（增量功能） | ① 老板登录 → 四口径卡片数字与四个列表实际条数一致（现场点数核对）；② 老板分配一个客户 → 新负责人登录收到站内通知；③ 资源被"转为客户" → 指定负责人收到通知 | 新增通知文案直接按 V5.1 术语编写 | git revert |

### 最终顺序与关键路径

```
S1 ──┬── S2 ──┐
     ├── S3 ──┼──→ S4a ──→（ S6 ∥ S7 ）──→ S4b ──→ 终验
     └── S5 ──┘   （S7 主记录确认后可提前执行，仅须在 S4b 前完成）
```

- 第一批（可同周并行开工）：**S1、S2、S3、S5**；
- 关键路径：**S3 → S4a → S7 → S4b**（唯一索引最后上）；
- S7 是唯一需要业务方持续输入的步骤（逐组主记录确认），建议定稿后即启动认领，不阻塞其他步；
- 总工作量约 **74–106 人时**（S1–S6 代码改造 66–90 人时 + S7 数据操作 8–16 人时）。

## V5.4 UI 文案改动总清单（权威版，按 V5.1 术语表逐词对齐；取代 V3.6）

> 已全仓 grep 复核（frontend/src + backend + database + tests），含易漏点：空态文案、按钮/tooltip、错误提示、API 返回文案（前端 toast 直显）、消息通知模板、权限管理页的权限显示名、状态字典、AI 提示词、**前端单测断言**。标"派生措辞"的条目实施后须请业务方过目（铁律）。

### A. 前端（用户可见）

| # | 旧词→新词 | 现文案与位置 | 场景 | 归属 |
|---|---|---|---|---|
| A1 | 潜客池→客户资源库 | 菜单"潜客池" [Sidebar.vue:37](file:///c:/huakey-crm/frontend/src/components/layout/Sidebar.vue#L37)；路由标题 [router/index.js:63](file:///c:/huakey-crm/frontend/src/router/index.js#L63)；页面标题"潜客池（共 N 条）" [leads/List.vue:46](file:///c:/huakey-crm/frontend/src/views/leads/List.vue#L46)；API 文案"获取潜客池列表成功" [customerController.js:362](file:///c:/huakey-crm/backend/controllers/customerController.js#L362)（toast 直显） | 菜单/标题/提示 | S3 |
| A2 | 潜客→资源（派生措辞） | 按钮"新增潜客" [leads/List.vue:38](file:///c:/huakey-crm/frontend/src/views/leads/List.vue#L38)、[61](file:///c:/huakey-crm/frontend/src/views/leads/List.vue#L61)；空态"暂无潜客" [leads/List.vue:54](file:///c:/huakey-crm/frontend/src/views/leads/List.vue#L54)（**易漏**）；错误提示"加载潜客列表失败" [leads/List.vue:198-204](file:///c:/huakey-crm/frontend/src/views/leads/List.vue#L198-L204)（**易漏**） | 按钮/空态/错误 | S3 |
| A3 | 公海池→客户资源库（菜单合一，见 V5.1 解释 1） | 菜单"公海池" [Sidebar.vue:39](file:///c:/huakey-crm/frontend/src/components/layout/Sidebar.vue#L39)；路由注释"客户总览" [router/index.js:75-76](file:///c:/huakey-crm/frontend/src/router/index.js#L75-L76)；API 文案"获取公海池列表成功" [customerController.js:382](file:///c:/huakey-crm/backend/controllers/customerController.js#L382) | 菜单/提示 | S3 |
| A4 | 待认领→待分配 | 筛选按钮 [pool/List.vue:40](file:///c:/huakey-crm/frontend/src/views/pool/List.vue#L40)；空态"暂无待认领客户" [pool/List.vue:55](file:///c:/huakey-crm/frontend/src/views/pool/List.vue#L55)、[64](file:///c:/huakey-crm/frontend/src/views/pool/List.vue#L64)（**易漏**）；标签 [pool/List.vue:99](file:///c:/huakey-crm/frontend/src/views/pool/List.vue#L99)；错误文案 label [pool/List.vue:226](file:///c:/huakey-crm/frontend/src/views/pool/List.vue#L226) | 筛选/空态/标签 | S3 |
| A5 | 认领→功能下线（非改名） | 按钮"认领" [pool/List.vue:114](file:///c:/huakey-crm/frontend/src/views/pool/List.vue#L114)；确认/成功/失败文案 [pool/List.vue:345-357](file:///c:/huakey-crm/frontend/src/views/pool/List.vue#L345-L357)；API"认领客户成功" [customerController.js:283-284](file:///c:/huakey-crm/backend/controllers/customerController.js#L283-L284)、"批量认领" [293-294](file:///c:/huakey-crm/backend/controllers/customerController.js#L293-L294)、"领取公海客户" [421-423](file:///c:/huakey-crm/backend/controllers/customerController.js#L421-L423) | 按钮/确认 | S3（销售端随权限回收整组消失） |
| A6 | 释放（到公海）→收回到待分配 | 按钮"释放公海" [Detail.vue:22](file:///c:/huakey-crm/frontend/src/views/customer/Detail.vue#L22)；确认"释放到公海" [Detail.vue:739](file:///c:/huakey-crm/frontend/src/views/customer/Detail.vue#L739)；成功提示 [Detail.vue:742](file:///c:/huakey-crm/frontend/src/views/customer/Detail.vue#L742)；标签"公海客户" [Detail.vue:69](file:///c:/huakey-crm/frontend/src/views/customer/Detail.vue#L69)、筛选 [504](file:///c:/huakey-crm/frontend/src/views/customer/Detail.vue#L504)；API"释放客户到公海" [customerController.js:304](file:///c:/huakey-crm/backend/controllers/customerController.js#L304)、[314](file:///c:/huakey-crm/backend/controllers/customerController.js#L314)、[409](file:///c:/huakey-crm/backend/controllers/customerController.js#L409)、[411](file:///c:/huakey-crm/backend/controllers/customerController.js#L411) | 按钮/确认/标签 | S3 |
| A7 | 状态标签"公海"→待分配 | 前端字典 [constants/customer.js:49](file:///c:/huakey-crm/frontend/src/constants/customer.js#L49)；后端字典"公海客户" [constants/customerStatus.js:21](file:///c:/huakey-crm/backend/constants/customerStatus.js#L21)；DB 状态字典见 C3 | 状态标签/筛选 | S3 |
| A8 | AI 提示词（**易漏**） | "公海客户，无负责人的客户…" [AiChat.vue:58](file:///c:/huakey-crm/frontend/src/components/ai/AiChat.vue#L58) | AI 助手上下文 | S3 |
| A9 | 转化→转为客户 | 确认弹窗"转化为正式客户吗？…进入跟进中状态" / 按钮 / 成功失败提示 [leads/List.vue:251-263](file:///c:/huakey-crm/frontend/src/views/leads/List.vue#L251-L263)；API"潜客转正式客户成功（已置入公海，待认领或分配）" [customerController.js:395-398](file:///c:/huakey-crm/backend/controllers/customerController.js#L395-L398) → 改为"已转为客户（负责人：X）" | 确认/提示 | S4a |
| A10 | 资源条目状态标签（派生措辞） | "线索/潜在客户"标签 → "资源"，另加"已转为客户"跳转标记（依赖 S4a 列） [leads/List.vue:142](file:///c:/huakey-crm/frontend/src/views/leads/List.vue#L142) 状态列 | 标签 | 标签改口归 S3，"已转"标记归 S4a |
| A11 | 前端单测断言（**易漏，不改必红**） | 断言菜单名"潜客池""公海池" [customerLevelOptions.test.js:23-24](file:///c:/huakey-crm/frontend/tests/unit/views/customerLevelOptions.test.js#L23-L24) | 测试 | S3 |
| A12 | 菜单分组名核对 | Sidebar 客户分组无旧词（已核），路由 name/title 仅 A1/A3 两处 | — | S3 |

### B. 后端 API 文案 / 消息通知模板（用户经 toast/通知可见）

| # | 现文案与位置 | 场景 | 归属 |
|---|---|---|---|
| B1 | "该客户不在公海中" [poolService.js:159](file:///c:/huakey-crm/backend/services/poolService.js#L159)、[271](file:///c:/huakey-crm/backend/services/poolService.js#L271)；"已被他人认领" [192](file:///c:/huakey-crm/backend/services/poolService.js#L192)、[226](file:///c:/huakey-crm/backend/services/poolService.js#L226)、[285](file:///c:/huakey-crm/backend/services/poolService.js#L285)；"线索客户不能释放到公海，请使用'放弃'操作" [334](file:///c:/huakey-crm/backend/services/poolService.js#L334) | API 错误 | S3（认领链下线后部分文案随之消失，余下按"待分配"改写） |
| B2 | 超期通知"因超期未跟进已自动释放到公海" [poolService.js:511](file:///c:/huakey-crm/backend/services/poolService.js#L511) | **消息通知模板（易漏）** | S3 → "已自动收回到待分配" |
| B3 | "⚠️ 客户即将被释放到公海"/"将于明天自动释放到公海" [cronService.js:108-117](file:///c:/huakey-crm/backend/services/cronService.js#L108-L117) | **消息通知模板（易漏）** | S3 → "即将被收回到待分配" |
| B4 | 离职提示"N 个客户已释放到公海池" [user.js:86](file:///c:/huakey-crm/backend/routes/user.js#L86) | **消息通知模板（易漏）** | S5 → "已收回到待分配" |
| B5 | 认领成功文案见 A5；释放文案见 A6；代转化提示见 A9 | API 成功返回 | ①② S3、③ S4a |
| B6 | 管理触发接口"公海回收完成" [cronJobs.js:78](file:///c:/huakey-crm/backend/routes/cronJobs.js#L78) | 内部接口返回 | S3 |
| B7 | Excel 导入状态映射含 '公海客户'/'公海' [importService.js:119](file:///c:/huakey-crm/backend/services/importService.js#L119) | **导入模板兼容（易漏）** | S2：**保留为兼容映射**（旧模板可能仍写旧词）+ 注释标注；导入说明文案按术语表对齐 |

### C. 权限显示名 / 状态字典（DB 数据，走新迁移 UPDATE，历史迁移文件与 id/码不动）

| # | 数据 | 位置 | 处理 | 归属 |
|---|---|---|---|---|
| C1 | sys_permission 显示名：'潜客池'(menu) [098:49](file:///c:/huakey-crm/database/migrations/098_leads_pool_permissions.sql#L49)；'公海池'(menu) [098:55](file:///c:/huakey-crm/database/migrations/098_leads_pool_permissions.sql#L55)、[seeds:24](file:///c:/huakey-crm/database/seeds/permission_data.sql#L24)；'认领线索' [098:82](file:///c:/huakey-crm/database/migrations/098_leads_pool_permissions.sql#L82)；'查看公海' [098:111](file:///c:/huakey-crm/database/migrations/098_leads_pool_permissions.sql#L111)；'认领公海客户' [098:119](file:///c:/huakey-crm/database/migrations/098_leads_pool_permissions.sql#L119)；'分配公海客户' [098:127](file:///c:/huakey-crm/database/migrations/098_leads_pool_permissions.sql#L127)；'释放到公海' [098:140](file:///c:/huakey-crm/database/migrations/098_leads_pool_permissions.sql#L140)；'客户池认领接口' [020:38](file:///c:/huakey-crm/database/migrations/020_seed_api_permissions.sql#L38)；'线索认领接口' [020:67](file:///c:/huakey-crm/database/migrations/020_seed_api_permissions.sql#L67) | **权限管理页显示（易漏）** | 新迁移 UPDATE name → "客户资源库 / 转为客户 / 待分配"口径；码与 id 不变；附 _down | S3 |
| C2 | sys_role 角色描述（[004](file:///c:/huakey-crm/database/migrations/004_roles.sql)、[029](file:///c:/huakey-crm/database/migrations/029_role_permission_links.sql) 的 INSERT） | 角色描述文案（易漏） | **经全库核对不含旧术语，无动作** | — |
| C3 | sys_customer_status 行 ('sea','公海客户') [070:34](file:///c:/huakey-crm/database/migrations/070_fix_customer_status_dict.sql#L34) | 状态字典显示（筛选/标签） | 新迁移 UPDATE → '待分配'，附 _down | S3 |

### D. 明确不改（避免误伤）

| # | 项 | 理由 |
|---|---|---|
| D1 | 代码注释中的旧词（[poolService.js:135](file:///c:/huakey-crm/backend/services/poolService.js#L135)、[customerPoolState.js:24-37](file:///c:/huakey-crm/backend/utils/customerPoolState.js#L24-L37)、[pool.js:135](file:///c:/huakey-crm/backend/routes/pool.js#L135)、[CustomerFormDialog.vue:168](file:///c:/huakey-crm/frontend/src/components/customer/CustomerFormDialog.vue#L168) 等大量） | 非 UI；建议实施时顺手对齐，不属验收项 |
| D2 | database/migrations 历史文件与回滚脚本（含 [111_down](file:///c:/huakey-crm/database/migrations/111_remove_dead_permission_codes.sql)） | 迁移链不可改 |
| D3 | 导出文件名 customers.xlsx；leads 页无导出按钮（已核） | 无旧术语 |
| D4 | "C级 - 潜在客户"（[customer/List.vue:231](file:///c:/huakey-crm/frontend/src/views/customer/List.vue#L231)、[Detail.vue:496](file:///c:/huakey-crm/frontend/src/views/customer/Detail.vue#L496)、[pool/List.vue:198](file:///c:/huakey-crm/frontend/src/views/pool/List.vue#L198)、[leads/List.vue:142](file:///c:/huakey-crm/frontend/src/views/leads/List.vue#L142)） | 客户等级标签（D 级客源语义），**不属本次术语替换** |
| D5 | 表名 / 路由 / 权限码 / 状态枚举值（status='sea' 等） | 按 V5.1 实施解释 3，代码层不动 |

## V5.5 上线后总验收清单（业务方自验；对应 AGENTS.md 第十章流程）

| # | 验收动作 | 预期 | 覆盖 |
|---|---|---|---|
| 1 | 销售新建客户 | 归创建人，进"我的客户" | S2 |
| 2 | 销售 Excel 导入 | 不归导入人 | S2 |
| 3 | 各部门账号看资源库 | 采购/人事/财务可见只读；经理可见可编辑；销售可见只读、无操作按钮 | S3 |
| 4 | 已回收客户对销售不可见（列表/详情/跟进） | 消失或 403/404 | S3 |
| 5 | 经理无分配入口 | 界面无按钮，直调 API 403 | S3 |
| 6 | 全站旧词清零 | 菜单/标题/按钮/标签/空态/提示/通知中"潜客池/线索池/公海/认领/领取"均不再出现 | S3 |
| 7 | 名片"转为客户" | 正式客户新增、原条目保留带"已转为客户"可跳转 | S4a |
| 8 | 重复转化拦截（同条目二次转 / 同名同电话已有正式客户） | 明确提示（含负责人） | S4a |
| 9 | 双账号同时转化同一名片 | 仅一人成功 | S4a |
| 10 | 离职测试账号 | 客户落待分配、原销售不可见、双 boss 均可派、日志含"离职收回" | S5 |
| 11 | 老板四口径卡片点数 | 与四个列表实际条数一致 | S6 |
| 12 | 分配/转化后新负责人收到通知 | 站内通知可点开 | S6 |
| 13 | 资源库搜索 8 组重复公司名 | 各剩 1 条有效记录、联系人齐全 | S7 |

## V5.6 范围外记录（备案，不再等待）

- **13 个休眠账号**：2026-11-03 业务确认**不禁用**，与本方案无关，不纳入任何 S 步；
- **近似重复模糊扫描**（如 "Arcelik A.S." vs "Arcelik China" 子公司后缀差异）：需业务先定义相似度规则，未启动、不阻塞本方案；
- V2.5 S6 中"全部=425"为当时快照数，最终以 V5.3 S6 的动态四口径计数为准。

---

**V5 定稿完毕。实施启动条件：业务方对 S1–S7 排期点头即开工；S7 的 8 组主记录确认可先行提交，与代码改造并行。**

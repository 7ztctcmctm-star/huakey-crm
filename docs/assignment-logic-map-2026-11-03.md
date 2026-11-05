# 客户/线索分配逻辑测绘图（2026-11-03）

> 严格只读测绘：全部结论基于代码实测 + 生产库只读 SELECT（2026-11-03）。
> 未实测处均已标注「存疑」。

---

## 一句话结论

**这套分配逻辑的核心问题是：存在三套互不相通、口径不一致的"分配引擎"（新建时规则匹配 `autoAssignOwner`、经理端轮询按钮 `applyRule`、工作流 `applyAssignRule`），而生产库 `crm_assign_rule` 表为空、425 个客户 0 个有负责人——整台规则引擎从未真正运转，当前系统实际处于"全靠人工认领"的状态，且 Excel 导入会把客户直接归到导入人名下、绕过一切规则。**

生产实测（2026-11-03，只读查询）：

- `crm_assign_rule`：**0 条规则**（自动分配引擎在产线完全休眠）
- `crm_customer`：共 425 条 = 423 条线索（lead/lead，无负责人）+ 2 条公海（sea/following）
- **`owner_id IS NOT NULL` 的客户数 = 0**（尚无任何已分配客户）
- `sys_config`：`recycle_days=15`、`overdue_days=15`、`near_recycle_days=7`、`followup_reminder_enabled=1`

---

## 一、入口链路（客户/线索从哪里进来）

| 入口 | 实际路径 | 归属结果 | 代码位置 |
|---|---|---|---|
| 表单新增客户 | `POST /customers` → `addCustomer` → `autoAssignOwner` 规则匹配 | 命中规则 → 归规则指定人（status=following）；未命中 → `owner_id=NULL`、status=lead 进线索池 | [customerDetailService.js:151-258](file:///c:/huakey-crm/backend/services/customerDetailService.js#L151-L258)（autoAssignOwner 调用在 L179） |
| Excel 导入（异步） | `POST /customers/import` → 队列 `customer_import` → worker → `batchImport` | **`owner_id = 导入操作人`（`job.userId`），完全绕过分配规则**；status 按 Excel"状态"列映射，缺省 following | [import.js:65-78](file:///c:/huakey-crm/backend/routes/customer/import.js#L65-L78)、[importService.js:152-164](file:///c:/huakey-crm/backend/services/importService.js#L152-L164)、[batchWorker.js:13-21](file:///c:/huakey-crm/backend/workers/batchWorker.js#L13-L21) |
| Excel 导入（同步确认） | `POST /customers/import-confirm` → `importCustomers` → 同 `batchImport` | 同上，归导入人 | [customerController.js:342-354](file:///c:/huakey-crm/backend/controllers/customerController.js#L342-L354) |
| 线索池转化 | `POST /leads/convert` → `convertLeadToCustomer` | 本人转化 → 归操作人；**有 manageAll 的管理员"代转化" → `owner_id=NULL`、pool_status=sea 进公海待分配** | [leads.js:58-63](file:///c:/huakey-crm/backend/routes/leads.js#L58-L63)、[customerService.js:1093-1146](file:///c:/huakey-crm/backend/services/customerService.js#L1093-L1146)（代转化判定 L1108-1109） |
| 公海认领 | `POST /pool/claim` 或 `POST /customers/claim` | 归当前登录用户（两条路由、两个 service 函数，行为一致） | [pool.js:70-75](file:///c:/huakey-crm/backend/routes/pool.js#L70-L75)、[assign.js:128-131](file:///c:/huakey-crm/backend/routes/customer/assign.js#L128-L131) |
| 转介绍 | **无独立入口**。"转介绍"仅是 `source` 字段的一个取值，走表单新增同一条路 | 同表单新增 | [customerDetailService.js:45](file:///c:/huakey-crm/backend/services/customerDetailService.js#L45) |
| 问卷调查回复 | 不创建客户。`surveyService` 只对已存在客户（status='following'）投放问卷 | 不适用 | [surveyService.js:174](file:///c:/huakey-crm/backend/services/surveyService.js#L174) |

## 二、触发方式（自动 vs 手工）

| 触发 | 入口 | 说明 | 代码位置 |
|---|---|---|---|
| 自动（新建时） | `addCustomer` 内联调用 `autoAssignOwner` | 新建客户瞬间按规则匹配；规则表为空时永远返回 null → 全部落线索池 | [customerDetailService.js:179](file:///c:/huakey-crm/backend/services/customerDetailService.js#L179)、[assignService.js:168-212](file:///c:/huakey-crm/backend/services/assignService.js#L168-L212) |
| 手工（单条/批量分配） | `POST /customers/assign`、`/batch-assign` | 主管手工指派；需 `customer:assign` 权限码 + `requireManager` | [assign.js:58-61](file:///c:/huakey-crm/backend/routes/customer/assign.js#L58-L61) |
| 手工（轮询分配按钮） | `POST /customers/auto-assign` → `applyRule` | **注意：此"自动分配"完全不读 `crm_assign_rule` 规则**，只做"公海客户按 create_time 均匀轮询分给全体 sales 角色" | [assignService.js:95-162](file:///c:/huakey-crm/backend/services/assignService.js#L95-L162)（客户查询 L102-107、销售名单 L114-119） |
| 手工（工作流动作） | 自动化工作流 `assign` 动作 → `systemAssignOwner` | 只改 `owner_id`，**不同步 pool_status/status/business_status、不写 crm_assign_log** | [automationService.js:89-93](file:///c:/huakey-crm/backend/services/automationService.js#L89-L93)、[customerService.js:1342-1351](file:///c:/huakey-crm/backend/services/customerService.js#L1342-L1351) |
| 定时任务 | **没有任何定时任务做分配**。cron 只做：转移申请超期回流（00:45）、公海自动回收（01:00） | 自动分配只在"新建瞬间"或"人工点按钮"发生 | [scheduler.js:118-144](file:///c:/huakey-crm/backend/cron/scheduler.js#L118-L144) |

## 三、匹配条件（规则引擎实际判定什么）

`crm_assign_rule` 表结构（[000_real_baseline.sql:155-169](file:///c:/huakey-crm/database/migrations/000_real_baseline.sql#L155-L169)）：`assign_type` 枚举仅三种。

| 条件 | 是否实现 | 实际行为 | 代码位置 | 判定 |
|---|---|---|---|---|
| round_robin | ✅ | 无条件匹配，按 `last_assigned_index` 轮询取人 | [assignService.js:178-179](file:///c:/huakey-crm/backend/services/assignService.js#L178-L179) | 符合常理 |
| by_source（按来源） | ✅ | `customer.source === rule.source_value` **全等精确匹配** | [assignService.js:180-181](file:///c:/huakey-crm/backend/services/assignService.js#L180-L181) | 符合常理 |
| by_region（按区域） | ✅ | `customer.address.includes(region_value)` **子串模糊匹配**——"华东"会命中"华东师范大学"；且依赖自由文本 address 字段，没有结构化省市区 | [assignService.js:182-183](file:///c:/huakey-crm/backend/services/assignService.js#L182-L183) | **存疑**（易误匹配；地址是自由文本） |
| 行业 industry | ❌ | 表单有 industry 字段，但规则引擎判定中完全未使用 | — | 空洞 |
| 客户等级 level | ❌ | 同上，未参与匹配 | — | 空洞 |
| 销售负载/在手客户数 | ❌ | **全代码库无任何负载均衡概念**（除 `applyRule` 的取模均匀轮询外） | — | 空洞（若业务期望"按空闲分配"，未实现） |
| 关系人/归属人偏好 | ❌ | 未实现 | — | 空洞 |
| 标签 tags | ❌ | 未实现（标签系统存在但与分配无关联） | — | 空洞 |
| 部门/区域路由到团队 | ❌ | 规则里的 `user_ids` 是硬编码用户 ID 列表（JSON），不含部门概念；**不校验这些用户离职/停用后是否仍有效** | [assignService.js:187-194](file:///c:/huakey-crm/backend/services/assignService.js#L187-L194) | **明显问题**（规则引用的用户停用后轮询会把客户分给离职销售，`autoAssignOwner` 不校验 status=1） |

## 四、优先级与冲突

| 规则 | 实际行为 | 代码位置 | 判定 |
|---|---|---|---|
| 多规则命中谁赢 | 规则按 `priority DESC, id ASC` 排序，**循环内第一条匹配即 return/break**。同优先级时靠 id 升序（即建规则的时间顺序）定胜负——这是明确的比较逻辑，不是偶然顺序 | [assignService.js:170-175](file:///c:/huakey-crm/backend/services/assignService.js#L170-L175)、[automationService.js:300-338](file:///c:/huakey-crm/backend/services/automationService.js#L300-L338) | 符合常理（有明确排序键） |
| 但存在两套匹配实现 | `assignService.autoAssignOwner` 与 `automationService.applyAssignRule` 是**两份独立实现**，且轮询索引语义不同：前者 `(last+1)%len` 后存回，后者 `last%len` 取人后存 `idx+1`（不取模，靠下次读取时取模自纠）。两者共用同一 `last_assigned_index` 计数器，混用不崩但轮转顺序会跳 | [assignService.js:196-204](file:///c:/huakey-crm/backend/services/assignService.js#L196-L204)、[automationService.js:323-332](file:///c:/huakey-crm/backend/services/automationService.js#L323-L332) | **明显问题**（同一规则两份代码，行为已有细微分歧） |
| 经理"自动分配"按钮 vs 规则 | `applyRule` 不读规则表，直接 `客户[i] % 销售[j]`。若业务以为"配了规则后点自动分配会按规则来"——不会 | [assignService.js:128-151](file:///c:/huakey-crm/backend/services/assignService.js#L128-L151) | **明显问题**（与功能名"轮询自动分配"的注释一致，但与"分配规则"管理页同屏出现，易被误解） |

## 五、状态机（四字段如何互相影响）

单一事实源：[customerPoolState.js](file:///c:/huakey-crm/backend/utils/customerPoolState.js)，常量定义 [poolStatus.js](file:///c:/huakey-crm/backend/constants/poolStatus.js)。

**核心口径（poolStatus.js L13-18）：`owner_id` 是公海/归属的唯一事实源；`pool_status` 已降级为只读兼容列。**

| 操作 | owner_id | pool_status | status | business_status | 代码位置 |
|---|---|---|---|---|---|
| 认领 claim | NULL→user | private | following | following（线索认领后同步转正） | [customerPoolState.js:24-31](file:///c:/huakey-crm/backend/utils/customerPoolState.js#L24-L31) |
| 释放 release | user→NULL | sea | sea | **following（注意：释放会把 quoted/signed 的阶段抹回 following）** | [customerPoolState.js:37-43](file:///c:/huakey-crm/backend/utils/customerPoolState.js#L37-L43) |
| 分配 assign（`assignmentStatusFragment`） | 指定人 | private | 线索→**不改**（留在线索池）；公海→following；已归属转移→**不改** | 同左 | [customerPoolState.js:58-79](file:///c:/huakey-crm/backend/utils/customerPoolState.js#L58-L79) |
| 回收（to_user_id=null） | →NULL | sea | sea | following | 同上 |
| 工作流 assign 动作 | 指定人 | **不改（残留 sea）** | **不改** | **不改** | [customerService.js:1342-1351](file:///c:/huakey-crm/backend/services/customerService.js#L1342-L1351) |

状态流转链（实际存在的边）：

```
新建(无规则命中) ──→ lead/lead（线索池，owner可空）
lead ──认领──→ following/following（归人）
lead ──本人转化──→ following（归自己）        [customerService.js:1093]
lead ──管理员代转化──→ sea/following（公海）  [customerService.js:1108-1109]
following ──释放/自动回收──→ sea/following（公海，owner=NULL）
sea ──认领/分配──→ following/following（归人）
quoted/negotiating/signed ──释放──→ sea/following（阶段被抹平）
  （⚠️ 已成交客户 release 后 business_status 从 signed 退回 following，报表统计口径受影响，属有意设计但需业务知晓）
线索(lead) ──释放──→ ❌ 被拒绝（"线索不能释放到公海，请使用放弃"）  [poolService.js:333-335]
```

## 六、回收与保护期

| 项 | 实际行为 | 代码位置 | 判定 |
|---|---|---|---|
| 回收周期 | `sys_config.recycle_days`，生产实测 = 15 天（默认 15，[config.js:39-42](file:///c:/huakey-crm/backend/utils/config.js#L39-L42)） | — | 符合常理 |
| 回收范围 | **仅 `status='following'` 且有负责人的客户**。`quoted/negotiating/signed` 客户**永远不会被回收**（哪怕 100 天不跟进）；线索（lead）也不回收 | [poolService.js:475-482](file:///c:/huakey-crm/backend/services/poolService.js#L475-L482) | **存疑**（高阶客户无人跟进无限滞留，可能是业务盲区） |
| 回收后去哪 | 直接回公海（owner=NULL, sea/following），写 `crm_pool_log` action='auto_release'，SSE 通知原负责人（失败仅记日志不重试） | [poolService.js:492-516](file:///c:/huakey-crm/backend/services/poolService.js#L492-L516) | 符合常理 |
| 调度 | 每日 01:00（Asia/Shanghai），带 3 次指数退避重试，失败触发 critical 告警 | [scheduler.js:129-144](file:///c:/huakey-crm/backend/cron/scheduler.js#L129-L144)、[scheduler.js:25-68](file:///c:/huakey-crm/backend/cron/scheduler.js#L25-L68) | 符合常理 |
| 释放前预警 | 回收前 1 天（threshold-1）发站内通知 `notifyPreReleaseCustomers` | [cronService.js:76-80](file:///c:/huakey-crm/backend/services/cronService.js#L76-L80) | 符合常理 |
| 保护期 | **已下线**（2026-09-10 产品决策）：`protect_until` 恒为 NULL，释放到公海立即可被认领，无 7 天等待。字段保留但不写有效值 | [poolService.js:163-170](file:///c:/huakey-crm/backend/services/poolService.js#L163-L170) | 符合常理（有明确决策记录） |
| 并发防护 | ①认领：事务外快判 + 事务内 `SELECT ... FOR UPDATE` 复判 + **UPDATE 自带 `owner_id IS NULL` 守卫**（最后防线）+ 幂等键；②分配：乐观锁 `WHERE owner_id <=> 原负责人`；③自动分配：`WHERE owner_id IS NULL` 条件更新；④批量认领逐条行锁 | 认领 [poolService.js:152-238](file:///c:/huakey-crm/backend/services/poolService.js#L152-L238)、分配 [assignService.js:252-259](file:///c:/huakey-crm/backend/services/assignService.js#L252-L259)、批量认领 [poolService.js:263-295](file:///c:/huakey-crm/backend/services/poolService.js#L263-L295) | 符合常理（有专项并发测试） |
| 唯一索引 | **无**。并发防护全部依赖条件 UPDATE，数据库层无"一客户一归属"唯一约束（`crm_customer` owner_id 可空，无法直接加唯一索引；`crm_customer_transfer` 防重复 pending 靠事务内 `SELECT FOR UPDATE`，无 `(customer_id,status)` 部分唯一索引） | [000_real_baseline.sql:547-568](file:///c:/huakey-crm/database/migrations/000_real_baseline.sql#L547-L568)、[transferService.js:93-101](file:///c:/huakey-crm/backend/services/transferService.js#L93-L101) | 符合常理（条件 UPDATE 足够，但缺兜底约束） |
| 转移申请 | 双方同意制：pending→accepted/rejected/expired；**3 天**未处理自动过期（00:45 定时任务），归属不变；同一客户同时只允许一个 pending | [transferService.js:24-32](file:///c:/huakey-crm/backend/services/transferService.js#L24-L32)、[scheduler.js:118-126](file:///c:/huakey-crm/backend/cron/scheduler.js#L118-L126) | 符合常理 |

## 七、人员变动

| 场景 | 实际行为 | 代码位置 | 判定 |
|---|---|---|---|
| 离职（删除用户） | 名下客户**全部释放到公海**（非线索→sea；线索→仅清归属保持 lead）；名下**商机则优先转给直属上级** manager_id，无可用上级才置空。客户与商机处理策略不对称（代码注释表明是有意的） | [userRouteService.js:274-347](file:///c:/huakey-crm/backend/services/userRouteService.js#L274-L347)（客户 L323、商机 L326-331）、[customerService.js:1478-1495](file:///c:/huakey-crm/backend/services/customerService.js#L1478-L1495) | 存疑（客户直接进公海 = 任何销售可抢，可能造成离职销售的高价值客户被随机认领；是否应像商机一样优先转上级，需业务拍板） |
| 请假/调岗 | **无任何机制**。没有"暂停分配""工作代理"概念；请假者的客户继续算他的，15 天不跟进会被正常回收 | —（全库无相关实现） | 空洞 |
| 孤儿客户 | 离职释放走 `systemReleaseOwnedCustomersOnLeave`，owner 置 NULL，不会留孤儿；但**离职后 pending 状态的转移申请不清理**（接收人 3 天不处理自动过期兜底，存疑点：发起人已删，accepted 时 `systemAcceptTransfer` 会因原归属已变而中止——路径闭环） | [transferService.js:174-183](file:///c:/huakey-crm/backend/services/transferService.js#L174-L183) | 基本符合常理 |

## 八、通知

| 事件 | 通知谁 | 渠道 | 失败处理 | 代码位置 |
|---|---|---|---|---|
| 转移申请发起 | 接收人 | 站内通知（crm_notification） | 事务外发送，失败不回滚申请 | [transferService.js:113-121](file:///c:/huakey-crm/backend/services/transferService.js#L113-L121) |
| 转移同意/拒绝/过期 | 发起人 | 站内通知 + 消除旧通知 | 同上 | [transferService.js:204-214](file:///c:/huakey-crm/backend/services/transferService.js#L204-L214)、[276-284](file:///c:/huakey-crm/backend/services/transferService.js#L276-L284) |
| 公海自动回收 | 原负责人 | **仅 SSE**（在线才收得到；离线则错过） | catch 后只写 error 日志，不重试 | [poolService.js:505-516](file:///c:/huakey-crm/backend/services/poolService.js#L505-L516) |
| 回收前 1 天预警 | 原负责人 | 站内通知 | — | [cronService.js:76](file:///c:/huakey-crm/backend/services/cronService.js#L76) |
| **手工分配/批量分配** | **谁都不通知** | 只有审计日志（sys_log）+ crm_assign_log | — | [customerController.js:175-190](file:///c:/huakey-crm/backend/controllers/customerController.js#L175-L190) |
| **新建自动分配** | **被分配人不通知** | 只写 crm_assign_log | — | [customerDetailService.js:235-240](file:///c:/huakey-crm/backend/services/customerDetailService.js#L235-L240) |
| 公海认领 | 无通知 | — | — | [customerController.js:277-288](file:///c:/huakey-crm/backend/controllers/customerController.js#L277-L288) |
| 工作流 assign 动作 | 无通知（除非工作流另配 notify 动作） | — | — | [automationService.js:89-93](file:///c:/huakey-crm/backend/services/automationService.js#L89-L93) |

**判定：分配完成后的"告知新负责人"环节整体缺失（P1 级体验问题）。** 邮件渠道在分配链路完全未使用。

## 九、权限与数据范围对分配的影响

| 规则 | 实际行为 | 代码位置 | 判定 |
|---|---|---|---|
| 谁能手工分配 | `customer:assign` 权限码 + `requireManager`（manager/boss/super_admin 或 manageAll）。**普通 sales 无权分配他人** | [assign.js:58-61](file:///c:/huakey-crm/backend/routes/customer/assign.js#L58-L61)、[admin.js:36-47](file:///c:/huakey-crm/backend/middleware/admin.js#L36-L47) | 符合常理（后端强制，非仅前端隐藏） |
| 分配对象校验 | 目标人必须是 `status=1` 在职且角色 ∈ sales/manager/boss/super_admin（防止分给 HR/禁用账号） | [assignService.js:19-31](file:///c:/huakey-crm/backend/services/assignService.js#L19-L31) | 符合常理 |
| 主管只能分给下级？ | **不限制**。`manualAssign` 的归属校验只管"操作者对客户是否有权"，对目标人无团队/部门限制——**任何经理可把客户分给任何销售（跨团队）**。`getMySubordinates` 仅是下拉候选接口，非强制约束 | [assignService.js:237-241](file:///c:/huakey-crm/backend/services/assignService.js#L237-L241)、[388-398](file:///c:/huakey-crm/backend/services/assignService.js#L388-L398) | 存疑（若业务期望"经理只能管自己团队"，当前实现过宽） |
| 非 manageAll 者分配 | 只能分配"自己负责的或公海"客户；他人客户抛错（批量场景静默跳过） | [assignService.js:237-241](file:///c:/huakey-crm/backend/services/assignService.js#L237-L241)、[293-295](file:///c:/huakey-crm/backend/services/assignService.js#L293-L295) | 符合常理 |
| 释放权限 | 数据范围控制（all/self/dept/dept_and_sub/custom），行锁内复判，缺 dataPermission 时 fail-closed | [poolService.js:36-51](file:///c:/huakey-crm/backend/services/poolService.js#L36-L51) | 符合常理 |
| 转移候选人 | 必须自身持有 `customer:transfer` 权限且在职（保证"候选人⊆可接受人"，无死按钮） | [transferService.js:363-375](file:///c:/huakey-crm/backend/services/transferService.js#L363-L375) | 符合常理 |

## 十、测试覆盖

| 模块 | 测试 | 覆盖情况 |
|---|---|---|
| assignService | [tests/unit/services-assignService.test.js](file:///c:/huakey-crm/backend/tests/unit/services-assignService.test.js)（13 个 describe）+ [tests/assign.test.js](file:///c:/huakey-crm/backend/tests/assign.test.js)（路由级） | ✅ 全函数覆盖（规则 CRUD、applyRule、autoAssignOwner、manualAssign、batchAssign） |
| 分配并发 | [tests/db/assignConcurrency.test.js](file:///c:/huakey-crm/backend/tests/db/assignConcurrency.test.js)（真连库） | ✅ 并发 onlyUnassigned 恰好一方成功、已归属客户不被改走 |
| 认领并发 | [tests/db/poolClaimConcurrency.test.js](file:///c:/huakey-crm/backend/tests/db/poolClaimConcurrency.test.js) | ✅ |
| 状态一致性 | [tests/db/poolStateConsistency.test.js](file:///c:/huakey-crm/backend/tests/db/poolStateConsistency.test.js)（六条写路径逐一断言四字段） | ✅ |
| 转移 | [tests/transferService.test.js](file:///c:/huakey-crm/backend/tests/transferService.test.js) | ✅（含超时回流） |
| 新建 business_status | [tests/db/customerCreateBusinessStatus.test.js](file:///c:/huakey-crm/backend/tests/db/customerCreateBusinessStatus.test.js) | ✅ |
| **未覆盖** | Excel 导入"owner=导入人"这一行为无专项断言（存疑：`importService.batchImport` 测试未见 owner 归属断言）；工作流 assign 动作不同步状态的缺陷无测试暴露 | ⚠️ |

---

## 冲突与空洞清单

1. **三套分配引擎互不相通**：`autoAssignOwner`（新建时，[assignService.js:168](file:///c:/huakey-crm/backend/services/assignService.js#L168)）读规则表；`applyRule`（经理按钮，[assignService.js:95](file:///c:/huakey-crm/backend/services/assignService.js#L95)）**不读规则表**；`applyAssignRule`（工作流，[automationService.js:296](file:///c:/huakey-crm/backend/services/automationService.js#L296)）又是独立一份规则匹配代码。三者轮询索引语义还不一致（见第四节）。
2. **Excel 导入绕过一切规则**：导入客户 `owner_id=导入人`（[importService.js:163](file:///c:/huakey-crm/backend/services/importService.js#L163)），不查重负责人是否是销售、不走规则、不写 crm_assign_log。若导入人是管理员，423 条线索式积压会变成"管理员名下 400 个客户"。
3. **规则引擎在生产为零配置**：`crm_assign_rule` 0 行——所有"自动分配"路径当前等价于"不分配"。前端有完整的规则管理页（automation.js API），但没人配过。
4. **工作流 assign 动作是半成品**：只改 owner_id，不写 pool_status（残留 sea）、不同步 status/business_status、不写分配日志（[customerService.js:1342-1351](file:///c:/huakey-crm/backend/services/customerService.js#L1342-L1351)）——恰好踩中 `customerPoolState.js` 开头注释描述的历史缺陷（"各写各的字段"）。
5. **`update_field` 白名单含幽灵列 `assignee`**：`crm_customer` 无此列，工作流命中即 SQL 报错。代码注释自认是"历史笔误，刻意不改"（[customerService.js:1355-1359](file:///c:/huakey-crm/backend/services/customerService.js#L1355-L1359)、[automationService.js:109](file:///c:/huakey-crm/backend/services/automationService.js#L109)）。
6. **by_region 子串匹配** + 依赖自由文本 address（[assignService.js:182](file:///c:/huakey-crm/backend/services/assignService.js#L182)）。
7. **规则引用的用户不做在职校验**：`autoAssignOwner` 直接轮询 `user_ids`，若名单里的人已离职/停用，客户照分不误（对比：`manualAssign` 有 `validateTargetUser`）。
8. **分配完成无通知**（见第八节）——新负责人不知道自己多了客户。
9. **回收只盯 following**：quoted/negotiating/signed 阶段客户超期不跟进永不回收（[poolService.js:479](file:///c:/huakey-crm/backend/services/poolService.js#L479)）。
10. **释放抹平阶段**：成交客户释放后 business_status 退回 following，历史报表口径受影响（[customerPoolState.js:39-43](file:///c:/huakey-crm/backend/utils/customerPoolState.js#L39-L43)，有意设计但有信息损失）。
11. **硬编码常量**：转移有效期 3 天（[transferService.js:32](file:///c:/huakey-crm/backend/services/transferService.js#L32)）、批量认领上限 20 / 批量分配·释放上限 100（[assign.js:19](file:///c:/huakey-crm/backend/routes/customer/assign.js#L19)、[poolService.js:249](file:///c:/huakey-crm/backend/services/poolService.js#L249)、[368](file:///c:/huakey-crm/backend/services/poolService.js#L368)）、applyRule 单批 500（[assignService.js:106](file:///c:/huakey-crm/backend/services/assignService.js#L106)）——均无 sys_config 出口。
12. **经理可跨团队分配**：无部门/下属约束（见第九节）。
13. **双路由双实现的认领**：`/pool/claim`→`claimPoolCustomer` 与 `/customers/claim`→`poolService.claimCustomer` 并存，行为一致但代码两份（长期维护负担）。

---

## 端到端举例：两个销售同时领取同一个公海客户

场景：公海里有客户 X（owner_id=NULL，sea/following），销售 A（userId=101）和销售 B（userId=202）同时点"认领"。

1. 两人都过前置检查：登录态 → `pool:claim` 权限码 → Joi 校验（[assign.js:128](file:///c:/huakey-crm/backend/routes/customer/assign.js#L128) / [pool.js:70-75](file:///c:/huakey-crm/backend/routes/pool.js#L70-L75)）。
2. 各自的 `claimCustomerOnce` 事务外快判（[poolService.js:154-159](file:///c:/huakey-crm/backend/services/poolService.js#L154-L159)）：两人都读到 `owner_id=NULL`，都放行。
3. 两人进入 `withClaimLock`（[poolService.js:212-238](file:///c:/huakey-crm/backend/services/poolService.js#L212-L238)）：`SELECT ... FOR UPDATE` 抢同一行的行锁。**假设 A 先拿到**：
   - A 复判 owner_id 仍为 NULL → 执行 `UPDATE ... SET CLAIM_SET_SQL WHERE id=? AND owner_id IS NULL`（[poolService.js:183-188](file:///c:/huakey-crm/backend/services/poolService.js#L183-L188)）→ affectedRows=1 → 同事务写 `crm_pool_log`('claim') → commit。客户 X 变为 101/private/following/following，`last_follow_time=NOW()`。
   - B 在 A 的行锁上**阻塞**；A commit 后 B 拿到锁，重读发现 `owner_id=101 ≠ NULL` → 抛「该客户已被他人认领，请刷新后重试」（[poolService.js:225-227](file:///c:/huakey-crm/backend/services/poolService.js#L225-L227)）→ rollback。
4. 兜底：即便行锁因任何原因失效（如不同索引路径），UPDATE 自带的 `owner_id IS NULL` 条件保证后手 0 行——并发正确性的最后防线（[poolService.js:129-130](file:///c:/huakey-crm/backend/services/poolService.js#L129-L130) 注释明确说明）。
5. 事后：无人收到任何通知（B 只有报错提示；A 认领成功，原负责人为空也无从通知）；审计日志各自记录（claim 成功一条；B 的失败**不留痕**）。

**结论：恰好一人成功，有事务+行锁+条件 UPDATE+幂等键四层防护，且有真连库并发测试佐证（[poolClaimConcurrency.test.js](file:///c:/huakey-crm/backend/tests/db/poolClaimConcurrency.test.js)）。此环节是全链路中工程质量最高的部分。**

---

## 需要业务拍板的问题清单

| # | 问题 | 选项 A（维持现状） | 选项 B（改动） |
|---|---|---|---|
| 1 | **Excel 导入的客户归谁？** | 归导入人（现状，[importService.js:163](file:///c:/huakey-crm/backend/services/importService.js#L163)）。影响：谁导谁背 400 个客户；管理员导入则客户全部堆在管理员名下 | 导入后统一进线索池（owner=NULL, lead）走统一分配；或导入时跑 `autoAssignOwner` 规则。影响：需要补规则配置 + 转化流程，但归属干净 |
| 2 | **"自动分配"按钮要不要遵守分配规则？** | 不遵守：纯轮询均分（现状）。影响：规则形同虚设，规则页有误导嫌疑 | `applyRule` 改为按 `crm_assign_rule` 匹配（复用 `autoAssignOwner`）。影响：需处理规则未命中客户的去向（留公海 or 兜底轮询） |
| 3 | **by_region 匹配精度** | address 子串包含（现状）。影响：误匹配（"华东"命中任何含"华东"的地址） | 引入结构化省/市字段或精确匹配。影响：需数据迁移清洗存量 address |
| 4 | **分配后要不要通知新负责人？** | 不通知（现状）。影响：销售需主动刷新才知道多了客户，分配延迟感知 | 分配/自动分配/认领成功后发站内通知+SSE（复用转移流程的通知模式）。影响：小改动，无风险 |
| 5 | **回收范围要不要覆盖高阶客户？** | 仅回收 following（现状）。影响：报价/谈判/成交阶段客户长期无人跟进永不回收，老板看不到滞留 | quoted/negotiating 超期也回收（或超期告警给老板）。影响：回收逻辑加状态集合即可，但"已成交客户被回收"业务上需接受 |
| 6 | **离职销售的名下客户去哪？** | 全部进公海先到先得（现状，[userRouteService.js:323](file:///c:/huakey-crm/backend/services/userRouteService.js#L323)）。影响：高价值客户可能被随机销售抢走 | 与商机对齐：优先转直属上级再分配。影响：删除用户流程加一步归属决策（是否人工挑接收人） |
| 7 | **经理能否跨团队分配？** | 可以，任何经理分给任何销售（现状）。影响：灵活但可能越界管别的团队 | 限定只能分给 `getMySubordinates` 返回的下属。影响：需产品确认组织模型（强矩阵 or 弱矩阵） |
| 8 | **工作流 assign 动作的字段不同步问题修不修？** | 不修（现状是已知半成品）。影响：工作流分配的客户 pool_status 残留 sea、无分配日志 | 工作流 assign 改走 `assignmentStatusFragment` + 写 crm_assign_log。影响：小改动，消除状态脏数据 |
| 9 | **规则轮询名单含离职用户怎么办？** | 现状：照分不误（`autoAssignOwner` 不校验 status）。影响：客户分给离职账号变孤儿 | 匹配前过滤在职用户，名单全失效则视为规则未命中。影响：小改动 |
| 10 | **转移有效期 3 天 / 批量上限等硬编码** | 固定值（现状）。影响：改策略要改代码 | 迁入 sys_config。影响：低优先级，顺手做 |

---

## 附：规则总表（编号索引）

| 编号 | 环节 | 触发条件 | 实际行为 | 代码位置 | 测试 | 判定 |
|---|---|---|---|---|---|---|
| R01 | 新建客户 | 表单提交 | 规则匹配命中→分人；未命中→线索池 | customerDetailService.js:179 | ✅ | 符合（规则为空时全部进线索池——即生产现状） |
| R02 | Excel 导入 | 上传文件 | 归导入人，绕过规则 | importService.js:163 | ⚠️ 部分 | **明显问题** |
| R03 | 手工分配 | 经理点分配 | 乐观锁变更归属+写日志 | assignService.js:220-269 | ✅ | 符合 |
| R04 | 批量分配 | 经理批量操作 | 事务+逐条乐观锁，≤100 | assignService.js:274-326 | ✅ | 符合 |
| R05 | 自动分配按钮 | 经理点"轮询分配" | 公海客户按 create_time 轮询给全体 sales，≤500 | assignService.js:95-162 | ✅ | 存疑（不读规则表） |
| R06 | 规则匹配 | assign_type 三选一 | priority DESC 首条命中即赢 | assignService.js:170-206 | ✅ | 符合 |
| R07 | 公海认领 | 销售点认领 | 四层并发防护，先到先得 | poolService.js:140-238 | ✅ 并发专项 | 符合 |
| R08 | 批量认领 | 销售批量操作 | 行锁逐条，≤20 | poolService.js:245-305 | ✅ | 符合 |
| R09 | 释放到公海 | 销售/经理主动释放 | 数据范围校验+行锁+事务；线索禁止释放 | poolService.js:315-359 | ✅ | 符合 |
| R10 | 自动回收 | 每日 01:00 | 仅 following+超 15 天 → 公海+SSE | poolService.js:467-525 | ✅ | 存疑（高阶客户不回收） |
| R11 | 转移 | 销售发起，对方同意 | 双方同意制，3 天过期，pending 唯一 | transferService.js:44-130 | ✅ | 符合 |
| R12 | 线索转化 | convert 接口 | 本人→归己；管理员代转化→公海 | customerService.js:1093-1146 | ✅ | 符合 |
| R13 | 离职 | 删除用户 | 客户→公海；商机→上级 | userRouteService.js:274-347 | ✅ | 存疑（策略不对称） |
| R14 | 工作流分配 | 工作流 assign 动作 | 只改 owner，状态不同步无日志 | customerService.js:1342-1351 | ❌ | **明显问题** |
| R15 | 分配通知 | — | 分配后无人被通知 | （缺失） | ❌ | **明显问题** |

---

*测绘范围：backend/services/{assignService,poolService,customerService,customerDetailService,transferService,userRouteService,importService,automationService,cronService}.js、backend/routes/{customer/assign.js,customer/import.js,pool.js,leads.js}、backend/cron/scheduler.js、backend/utils/customerPoolState.js、backend/constants/poolStatus.js、backend/middleware/{admin,permission}.js、database/migrations/000_real_baseline.sql、backend/tests/（assign、pool、transfer 系列）。生产库只读查询于 2026-11-03 执行。*

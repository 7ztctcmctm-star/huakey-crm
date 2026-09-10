# HUAKEYCRM 全面体检报告 V1

> **日期**：2026-09-10
> **负责人**：David
> **依据**：`AGENTS.md` 第十二章（Phase 0 十步扫描）
> **性质**：扫描阶段**只读，未修改任何业务代码**。
> P0 修复为扫描**之后**的独立动作，状态见 §一 开头表格。
> **证据原则**：关键结论均经**二次实测复核**；未复核项已显式标注

---

## 〇、总体健康度

**评级：C+（可运行，但存在生产级阻断项）**

| 维度 | 评级 | 说明 |
|------|------|------|
| 架构合理性 | **B** | 分层清晰（route→controller→service），无过度架构 |
| 权限与安全框架 | **B-** | RBAC + 数据范围机制**健全**，但存在绕过路径 |
| 数据可靠性 | **C** | 软删除到位，但**并发竞态**与**时区/字符集漂移**未解决 |
| 业务正确性 | **C+** | 主链路可用，但**金额浮点**与**字段三状态发散**埋雷 |
| 部署与运维 | **C** | 编排完善，但**备份脚本与生产编排错配**（致命） |
| 测试覆盖 | **C** | 单测厚实（1034 用例），**E2E 缺营收主链路** |
| 前后端一致性 | **C+** | 主体一致，存在**分页参数错配**与**静默失败** |

**结论：当前状态【不具备直接投产条件】。** 3 个 P0 必须先清零。

---

## 一、P0 级问题（生产阻断，必须清零）

> ### ✅ 修复状态（2026-09-10 更新）
>
> | 编号 | 问题 | 状态 | 提交 | 验证方式 |
> |------|------|------|------|----------|
> | P0-1 | 公海认领竞态 | ✅ **已修复** | `e791bd6` | **双并发实测**：修复后 1 成功/1 失败；旧写法 2 成功（竞态复现）；新增 7 个回归用例 |
> | P0-2 | 测试/生产共用 JWT 密钥 | ✅ **已修复** | `80c448c` | 双向行为验证（相同→FATAL，不同→通过）；新增 3 个单测 |
> | P0-3 | 备份脚本容器名错配 | ✅ **已修复** | `80c448c` | 行为验证（容器不存在→报错退出 1）；⚠️ 本机无 docker，端到端未实跑 |
>
> **回归**：全量 107 套件 / 1044 用例通过。
>
> **遗留（如实声明）**：P0-2 仅拆分了 JWT 密钥；两环境仍共用 `MYSQL_PASSWORD`。
> 改库凭据需在运行中的部署上执行 `ALTER USER`，属有数据面风险的操作，**未擅自变更**。
> 另：P0-3 的端到端（真实备份 + 恢复演练）仍需在 NAS 上执行。
>
> **且注意**：委托人已提出「取消公海客户板块」的产品方向，若该方向落地，P0-1 的修复对象
> 将整体下线（修复本身仍然正确，只是不再需要）。

### P0-1　公海客户认领存在竞态 —— 两人可同时抢到同一客户

**证据（已复核）**：`backend/services/poolService.js`

```js
// 第 89-92 行：先 SELECT 校验
'SELECT id, pool_status, ..., owner_id, ... FROM crm_customer WHERE id = ? AND deleted_at IS NULL'

// 第 123-125 行：再 UPDATE —— 注意 WHERE 条件只有 id
'UPDATE crm_customer SET pool_status = ?, owner_id = ?, protect_until = ?, ... WHERE id = ?'
```

**问题**：`UPDATE` 的 `WHERE` **只有 `id`**，没有 `owner_id IS NULL` 或 `pool_status` 的原子条件。
两个并发请求都能通过前置 `SELECT` 校验，然后**都执行 UPDATE，后者覆盖前者**。

**违反**：任务书 §22（并发问题）明确要求——"不能出现销售A看到空闲、销售B也看到空闲，然后两人同时领取成功"、"必须使用数据库事务/行锁/唯一约束"。

**影响**：客户归属错乱、`crm_pool_log` 出现双条 claim 记录、后续跟进与业绩归属争议。

**同类**：`batchClaimCustomers`（同文件）、`poolService.js` 释放逻辑同模式。

---

### P0-2　测试环境与生产环境共用 JWT_SECRET

**证据（已复核）**：
```
deploy/docker-compose.prod.yml:94   JWT_SECRET: ${JWT_SECRET}
deploy/docker-compose.test.yml:76   JWT_SECRET: ${JWT_SECRET}
```

**问题**：两个环境引用**同一个环境变量名**，而项目部署文档规定二者均由同一份
`.env.secrets` 注入（`deploy.sh` 的 `source inject-secrets.sh`）。
**→ 测试环境签发的 token 在生产环境有效。**

**违反**：任务书 §31——"测试 Token ≠ 生产 Token"、"绝对禁止测试操作污染生产数据"。

**影响**：测试环境的账号/令牌可直接访问生产数据，隔离形同虚设。

---

### P0-3　NAS 备份脚本与生产编排容器名错配 —— 备份静默失败

**证据（已复核）**：
```
deploy/nas-backup.sh:29        docker exec huakey-mysql mysqldump ...
deploy/docker-compose.prod.yml:10   container_name: crm-prod-mysql
```

**问题**：备份脚本指向的容器名 `huakey-mysql` **在生产编排中不存在**（实际名为 `crm-prod-mysql`）。
脚本内 `2>/dev/null` 吞掉了错误输出，`docker exec` 失败后管道产出空文件。

**违反**：任务书 §32——"必须验证：备份文件到底能不能恢复"。

**影响**：**运维以为每天在备份，实际备份为空且无人知晓**——直到需要恢复的那一天。
这是本报告中最隐蔽、后果最严重的一项。

> 注：`nas-backup.sh` 已有 `gzip -t` 与「文件非空」校验（本项目当日刚补），
> 因此空文件会被拦截并 `exit 1`——**但仍需先修正容器名，否则备份持续失败**。

---

## 二、P1 级问题（核心业务错误）

| 编号 | 问题 | 证据 | 影响 |
|------|------|------|------|
| **P1-1** | **金额用 JS 浮点数计算** | `quoteService.js:61,62,76,294,295,308`（`quantity * unitPrice`、`totalAmount * (1 - disc)`） | 违反任务书 §18「必须避免 JS 浮点数误差」。折扣相乘与累加会累积误差，报价/合同金额可能与实际不符 |
| **P1-2** | **`/ai/query` 绕过数据范围控制** | `backend/routes/ai.js:166` 直接 `executeReadOnlyQuery`，全文件**无** `buildDataPermissionWhere` | 普通销售可通过自然语言查询读到全库客户（仅屏蔽 `sys_*`），构成**越权数据泄漏** |
| **P1-3** | **迁移编号断裂 064 / 065 缺失** | `database/migrations/` 中 `063_*` 后直接 `066_*` | 违反任务书 §30 迁移可追溯性；且 `111_*.sql` 注释自曝生产曾应用未入库的 109 → **仓库与产线版本错位** |
| **P1-4** | **前后端分页参数错配** | 前端 13 处发 `page_size`（如 `report/custom.vue:167`、`email/inbox.vue:144`、`hr/commission.vue:191`），后端 36 处用 `pageSize` | 参数被服务端忽略，**分页静默失效**（可能返回默认条数），用户以为看到了全部数据 |
| **P1-5** | **dev / test 库 schema 漂移** | `sys_operation_log` 仅存在于 `huakey_crm_test`，`huakey_crm` 无此表 | 环境不可比，测试通过 ≠ 生产可用 |
| **P1-6** | **客户「状态」有三个并存字段** | `status`（`constants/customerStatus.js:7-16`）、`business_status`（`constants/poolStatus.js:25-32`）、`lifecycle_status`（`customerDetailService.js:308`） | 违反任务书 §6「禁止同一概念用不同字段」。已实际发散：`customerService.js:67-83` 会把 `sea/paused` 映射成 `business_status='following'` 而 `status` 仍为 `sea` |
| **P1-7** | **建合同 / 公海回收 / 逾期提醒判定字段不一致** | `contractService.js:191` 用 `status`；`cronService.js:39,66,121` 用 `status`；列表筛选走 `business_status`（`customerService.js:889`） | P1-6 的直接后果：状态一旦发散，**能否建合同、是否被回收、是否收到提醒三个判定互相矛盾** |
| **P1-8** | **客户删除不校验关联单据** | `customerDetailService.js:272-288` 仅校验归属与权限，未查是否存在报价/合同 | 违反任务书 §20。客户软删后合同 `customer_name` 因 `LEFT JOIN ... deleted_at IS NULL` 变为 NULL（`contractService.js:70-72`）→ **悬挂引用** |
| **P1-9** | **关键多表写操作缺事务** | `poolService.js:123/128`、`poolService.js:221/225`、`assignService.js:214/217`、`contractCrudService.js:239-241` | 违反任务书 §23。中途失败会产生**半条数据**（如认领成功但日志未写） |
| **P1-10** | **报价转合同无幂等** | `quoteService.js:372-394` 未校验是否已转合同 | 违反任务书 §24。重复调用会**生成多份合同** |
| **P1-11** | **前端空 catch 吞掉异常** | 全项目 `catch {}` 空块 **10 处**（已复核） | 违反任务书 §13「网络请求错误」检查项。API 失败用户无任何提示 |
| **P1-12** | **E2E 缺营收主链路** | `frontend/e2e/` 9 个 spec，覆盖 login/customer/leads/quotation/approval/opportunity/navigation/responsive/cross-browser | 缺失：**采购→入库、收款/回款、报表看板、合同全生命周期、客户公海回收**——营收主链路无自动化防护 |

---

## 三、P2 级问题（一般功能与质量）

| 编号 | 问题 | 证据 |
|------|------|------|
| P2-1 | **11 张重要表缺 `deleted_at` 软删除字段** | `crm_user_permission`、`sys_permission`、`sys_role_permission`、`crm_customer_tag`、`crm_opportunity_stage_log`、`crm_approval_record` 等；违反任务书 §20 |
| P2-2 | **孤儿数据风险**：无外键的逻辑关联 | 删 `sys_role` 残留 `sys_data_permission`；删 `sys_permission` 残留 `crm_user_permission`；删客户残留 `crm_customer_tag.customer_id=NULL` |
| P2-3 | **时区配置不统一** | `docker-compose.synology.yml` 有 `TZ=Asia/Shanghai`，但 `docker-compose.prod.yml` / `test.yml` 的 app **无 TZ**、所有 mysql 服务均无 TZ → 实际运行 UTC；且时间字段混用 `DATETIME`（本地墙钟）与 `TIMESTAMP`（UTC） |
| P2-4 | **连接未显式设时区** | `backend/config/database.js:19,84` 仅设 `charset`，无 `timezone` → 跨表时间比较可能差 8 小时，直接影响**逾期判断** |
| P2-5 | **`init-complete.sql` 字符集漂移** | 该文件混用 `utf8mb4_unicode_ci`（第 47/180 行等）与 `utf8mb4_0900_ai_ci`，与迁移默认不一致 |
| P2-6 | **关键列缺索引** | `crm_opportunity.create_time`、`crm_payment.create_time` 无索引 |
| P2-7 | **前端硬编码色值** | 约 20 个文件（`components/dashboard/SalesChart.vue:218+`、`views/email/inbox.vue:226+`、`views/survey/fill.vue:119+` 等），违反项目规范「颜色走 `var(--color-*)`」 |
| P2-8 | **前端无覆盖率门禁** | `frontend/vitest.config.js` **无** `coverageThreshold`；后端 `backend/jest.config.js:4-10` 有（30/40/40/40） |
| P2-9 | **聚合/报表接口多数未挂数据范围** | `analysis`、`report`、`teamDashboard` 等聚合接口未调用 `buildDataPermissionWhere` |
| P2-10 | **CI 的 E2E 不在 PR 触发** | `ci.yml:120` `if: github.event_name == 'push'` → PR 阶段无 E2E 闸门 |
| P2-11 | **备份无异地副本、无恢复验证** | `deploy/nas-backup.sh` 有日备/周备与保留策略，但**无异地备份、无定期恢复演练**；违反任务书 §32 |

---

## 四、P3 级问题（UX / 性能 / 代码质量）

| 编号 | 问题 |
|------|------|
| P3-1 | 冗余索引（`idx_contract_cust_status` 等重复 2–3 次） |
| P3-2 | 迁移备份残留表 `_migration_097_backup` 未清理 |
| P3-3 | 部分列表页未使用 `TableSkeleton`（`leads/List.vue`、`pool/List.vue`、`supplier/list.vue` 等） |
| P3-4 | `layout/index.vue:86` 只有 768 断点常量，缺 1024 平板断点 |
| P3-5 | `backup` 服务无 healthcheck；nginx 无 `logging` 块 |
| P3-6 | 日志无独立 `SECURITY` / `AUDIT` 级别（审计走 DB `sys_log`，可接受） |
| P3-7 | Trivy 扫描 `exit-code:'0'` → 永不影响流水线 |
| P3-8 | `customer/Detail.vue:721` 空函数 `onOppSelect`（有注释说明，属设计） |

---

## 五、做得好的部分（不应在整改中破坏）

| 项 | 证据 |
|----|------|
| **数据范围机制健全** | `buildDataPermissionWhere`（`middleware/permission.js:103`）+ `checkDataPermission`（:55），默认 `self`；客户/商机/合同/报价/跟进/采购**列表接口均已挂载** → IDOR 在核心列表**已被拦截** |
| **无 roleId 硬编码** | 前端统一 `manageAll`/`viewAll` 且有显式注释；`permission.js:196` 比对的是 `ROLES.ADMIN` **常量**而非字面数字 |
| **CSRF / 验证码 / 登录限流达标** | 双提交 cookie + `sameSite:strict`；`SKIP_CAPTCHA` 生产被启动拦截（`app.js:124`）；`authLimiter` + `captchaLimiter` |
| **文件上传配置严谨** | `upload.js:50` `memoryStorage`、10MB 限制、扩展名白名单 + MIME + **magic bytes 二次校验**；不落盘到 web 可执行目录 |
| **错误响应不泄漏内部信息** | `errorHandler.js:101` 对 5xx 只回「服务器内部错误」，stack 仅入内部日志（:86） |
| **软删除已落地** | 客户/合同/报价/商机**均无物理 DELETE** |
| **客户信息复用正确** | 选客户后自动带出联系人/电话（`quotation/edit.vue:408`、`quoteService.js:214`） |
| **前端规范执行度高** | 直接 `console.error/warn` **0 处违规**；`el-empty` **0 处业务使用**；全局错误边界存在（`App.vue:3`） |
| **部署脚本健壮** | `deploy.sh` 采用 `DEPLOY_FAILURES` 累积 + 末态非零退出（避免半成品即中止） |
| **日志轮转已实现** | `config/logger.js` DailyRotateFile 50m × 30d + 压缩归档 |
| **登录日志脱敏** | `middleware/logger.js` 经 `maskLogParams` 处理 params / 变更字段 / 新旧值 |

---

## 六、P0/P1/P2/P3 清单汇总

| 等级 | 数量 | 编号 |
|------|------|------|
| **P0** | **3** | P0-1 公海竞态 · P0-2 测试/生产共用 JWT · P0-3 备份容器名错配 |
| **P1** | **12** | P1-1 ~ P1-12 |
| **P2** | **11** | P2-1 ~ P2-11 |
| **P3** | **8** | P3-1 ~ P3-8 |
| **合计** | **34** | |

---

## 七、修改优先级与实施路线图

### 第一批（P0，立即，不修不投产）

| 顺序 | 动作 | 验证方式 |
|------|------|----------|
| 1 | `claimCustomer` / `batchClaimCustomers` 改为**原子更新**：`UPDATE ... SET owner_id=? WHERE id=? AND owner_id IS NULL AND pool_status='sea'`，并校验 `affectedRows===1` | 并发 E2E：两请求同时领取，断言仅一个成功 |
| 2 | 测试环境改用**独立** `JWT_SECRET`（环境变量名拆分或独立 secrets 文件） | 用测试 token 请求生产接口，断言 401 |
| 3 | 修正 `nas-backup.sh` 容器名（或改为读环境变量），并做**一次真实恢复演练** | 备份后解压还原到临时库，比对表数/行数 |

### 第二批（P1，投产前）

4. **金额精度**：报价/合同/收款改整数分或 `DECIMAL` + 应用层 decimal 运算，并补回归测试
5. **字段统一**：确立唯一客户状态字段，编写**迁移 + 数据回填**，同步全部读写点
6. **`/ai/query` 补数据范围**（或改为受限视图）
7. **分页参数统一**：前端 13 处 `page_size` → `pageSize`
8. **补事务**：claim / release / manualAssign / deleteContract 四组
9. **补幂等**：报价转合同加前置校验 + 唯一约束
10. **客户删除加关联守卫**：有报价/合同则拒绝或改为「禁用」
11. **补迁移 064/065 说明**或补齐编号，核对产线 `schema_migrations`
12. **前端空 catch** 补用户提示（10 处）
13. **补 E2E**：采购→入库、收款/回款、合同全生命周期、公海回收

### 第三批（P2/P3，迭代中）

14. 补软删除字段（11 张表）、补缺索引、统一时区、消除字符集漂移
15. 前端硬编码色值 token 化、补覆盖率门禁、CI 加 PR-E2E 闸门
16. 异地备份 + 定期恢复演练

---

## 八、本次报告的取证方式与局限（如实声明）

### 取证方式
- Phase 0 十步扫描 → 5 路并行只读探查（数据库 / 权限安全 / 业务模块 / 前端 / 运维测试）
- **关键结论二次实测复核**，并**纠正了探查中的 3 处偏差**：

| 探查结论 | 实测结果 |
|---|---|
| `表数 96` | **104（dev）/ 105（test）** |
| `.env.test` 明文密钥**已入库** | **未入库**，`.gitignore:15` 覆盖（该项不成立） |
| 前端空 catch **38 处** | 严格空块 **10 处** |

### 局限（未验证项，不作结论）
- **未执行**渗透测试、压力测试、真实恢复演练
- **未验证**生产数据量下的性能表现（所有实测基于测试库）
- **未逐页**人工走查前端 93 个路由的渲染效果
- 部分 P2 索引/孤儿数据判断基于静态分析，**未在真实数据量下 EXPLAIN 验证**
- 多浏览器兼容性本机不可信，须以 CI 为准

### 合规声明
> 本次体检**严格遵循 `AGENTS.md` 第十二章**：**未修改任何业务代码**，
> 仅产出本报告。P0 清零前不进入修复阶段。

---

*报告由 David 出具 · 2026-09-10 · Phase 0 输出物*

# HuakeyCRM 全面审计与企业级优化方案（2026-10-16）

> 审计方式：4 路并行只读代码核查（后端安全权限 / 数据库迁移 / 前端 / 测试·CI·部署），所有结论均有 `文件:行号` 证据，未实测项显式标注。
> 使用方式：按 Phase 顺序执行；每个步骤内的【AI 提示词】可整段复制给 AI 助手直接执行。

---

## 一、审计结论总览

| 域 | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| 后端安全与权限 | 2 | 4 | 2 | 0 |
| 数据库与迁移 | 3 | 3 | 3 | 0 |
| 前端 | 1 | 3 | 3 | 4 |
| 测试 / CI / 部署 | 1 | 6 | 8 | 4 |
| **合计** | **7** | **16** | **16** | **8** |

### P0 清单（必须先修）

| # | 问题 | 证据 |
|---|---|---|
| P0-1 | 报价审批端点无任何权限校验，任意登录用户可审批/驳回报价并推进商机 | `backend/routes/quote.js:332`；`init_role_permissions.js` 无 `quotation:approve` 码 |
| P0-2 | 工单数据权限自造轮子且参数丢失：dept 分支占位符无人回填，过滤失效或报错 | `backend/services/serviceOrderService.js:18-38,47`；`routes/service.js:71-72` |
| P0-3 | 迁移链无法在空库重建系统：001 是空壳，~40 张核心表只存在于 `deploy/init-complete.sql` | `database/migrations/001_init_baseline.sql:1-16` |
| P0-4 | 前端权限编码不存在导致死页面：`payment:view`/`purchase:approve`/`leads:add`/`customer:export` 后端永不签发，回款/财务四页面对普通角色全死 | `frontend/src/router/index.js:142-160,226`；`Sidebar.vue:84-87` |
| P0-5 | `crm_invoice.invoice_no` 无唯一约束，发票号可重复 | `deploy/init-complete.sql:1058,1073` |
| P0-6 | 5 处缺外键（跟进→商机、商机→来源、回款提醒→合同/计划、发票→合同），删主表留孤儿数据 | init-complete.sql:984,1247,1394,1074,1006 |
| P0-7 | 部署无回滚、无部署前自动备份：迁移改写库后失败无任何回切机制；迁移失败仅计数不中止，新代码在坏库上对外服务数分钟 | `deploy/deploy.sh:141-151,189-196` |

---

## 二、分阶段实施方案

> 总顺序：**Phase A（P0 止血）→ Phase B（数据完整性）→ Phase C（权限一致性）→ Phase D（工程可靠性）→ Phase E（体验与性能）**。
> 每个 Phase 完成后：跑测试 → commit → push →（涉生产）走 deploy.sh 部署并核对。

---

## Phase A · P0 止血（预计 1-2 天）

### 步骤 A1：报价审批加权限门

**【AI 提示词】**
```
在 C:\huakey-crm 项目中修复报价审批权限漏洞（P0）：
1. 在 backend/scripts/init_role_permissions.js 中新增权限码 quotation:approve，授予 boss 和 manager（sales 不授予），并确认该脚本的清理逻辑不会误删它。
2. 修改 backend/routes/quote.js:332 的 POST /approve 路由，挂载 checkPermission('quotation:approve') + requireManager（保持项目既有成对约定）。
3. 同文件 GET /detail/:id（约 :320）补 checkPermission('quotation:view')。
4. 新增/扩展测试：无权限用户（sales）调用 /api/v1/quote/approve 必须 403，manager 200；断言被拒后不触发 advanceStage。
5. 遵守项目约定：先跑 node backend/node_modules/eslint/bin/eslint.js --max-warnings=0 检查改动文件，再跑相关 jest 测试，全绿后交付。禁止 --no-verify。
```

### 步骤 A2：工单数据权限改标准实现

**【AI 提示词】**
```
修复 C:\huakey-crm\backend\services\serviceOrderService.js 的数据权限缺陷（P0）：
1. 删除自造的 buildServicePermissionClause（:18-38），改用 backend/utils/dataScope.js 的标准 buildDataPermissionWhere(dp, alias)，调用方正确回填参数数组；dept_and_sub 必须递归子部门。
2. 检查 routes/service.js 所有工单端点均已挂 checkDataPermission('service')（或对应模块名），核对 DATA_PERMISSIONS 配置中 service 域的默认 fail-closed 行为。
3. 补测试：dept 范围用户列表只返回本部门工单；dept_and_sub 含子部门；无配置角色 fail-closed 为 self。
4. eslint --max-warnings=0 + 相关 jest 全绿后交付。
```

### 步骤 A3：前端权限编码对齐（消灭死页面）

**【AI 提示词】**
```
对齐 C:\huakey-crm 前后端权限编码（P0，消灭死页面/死按钮）：
1. 先全量提取后端 routes/*.js 中所有 checkPermission('...') 编码作为事实源清单。
2. 修正前端错误编码：router/index.js 的 payment:view（142/148/154/160 行，回款四页面，对齐后端实际编码 contract 或新增 payment:view 权限码并入库）、purchase:approve(:226)、settings(:479)、system:tag(:551→tag)、system:integration(:557)、opportunity 路由(:100→opportunity:view)；Sidebar.vue 的 payment:view(84-87)、competitor(163→competitor:view)、scoring:view/approval:view(166/171/181/186→scoring/approval)；CustomerTable.vue:6 的 customer:export；leads/List.vue:38/61/91 的 leads:add（对齐 leads 域实际编码，编辑与新增如需区分则在 init_role_permissions.js 补码）。
3. 每个新增权限码都必须同步进 backend/scripts/init_role_permissions.js 并明确授予角色矩阵。
4. 报价转合同按钮对齐：frontend/src/views/quotation/list.vue:122 的 contract:add 与后端 quote.js:329 的 quotation:edit 统一（建议前后端都用 quotation:edit + 服务层再校验 contract:add）；contract/list.vue:81 回款按钮 contract:edit 与后端 payment.js:62 的 contract 统一。
5. 跑 frontend 目录下 vitest（templateBindings 全量 SFC 编译测试）+ 后端 jest 全绿后交付。
```

### 步骤 A4：发票号唯一约束 + 关键外键补齐（迁移）

**【AI 提示词】**
```
在 C:\huakey-crm 新建迁移 123_integrity_constraints.sql（P0，含 up/down）：
1. up：① 先查重（SELECT invoice_no, COUNT(*) ... GROUP BY 1 HAVING c>1），若有重复则迁移 fail 并输出清单待人工处理；无重复则给 crm_invoice.invoice_no 加 UNIQUE。② 补外键：crm_follow_up.opportunity_id→crm_opportunity.id、crm_opportunity.source_id→来源表、crm_payment_reminder.contract_id/plan_id、crm_invoice.contract_id、crm_follow_up_reminder.follow_plan_id——加 FK 前先用 LEFT JOIN 查孤儿行，存在孤儿则 fail 输出清单（不静默改数据）。③ crm_payment_plan 加 UNIQUE(contract_id, plan_date)（同样先查重）。
2. down：按项目约定用 information_schema + PREPARE/EXECUTE 条件化 DDL（MySQL 8.0 不支持 DROP ... IF EXISTS）。
3. 同步更新 deploy/init-complete.sql 使并集一致（项目约定：CI 只导入 init-complete.sql）。
4. 用本机测试库验证：node 跑迁移 up→down→up 往返，再跑 tests/db/migrationGuard.test.js 与 migration-roundtrip（显式命令：npx jest tests/db/migration-roundtrip.test.js --testPathIgnorePatterns="/node_modules/" --testTimeout=600000，需设 DB_USER/DB_PASSWORD 环境变量）。
```

### 步骤 A5：部署加备份与回滚

**【AI 提示词】**
```
改造 C:\huakey-crm\deploy\deploy.sh（P0，部署安全）：
1. 在 [4/12] down 之前新增步骤：① mysqldump 快照到 database/backups/predeploy-$(date +%Y%m%d-%H%M%S).sql（密码走 MYSQL_PWD 环境变量，stderr 不并入 dump 文件）；② 给当前 app 镜像打 tag :prev。
2. 迁移执行改为硬门禁：迁移失败立即执行回滚——docker tag :prev 回切镜像 + 启动旧容器 + 输出 dump 路径提示人工恢复库，脚本 exit 1；不允许新代码在未知库状态上继续服务。
3. 健康检查改真实探针：[8/12] 用 docker inspect 查 app 容器 healthcheck 状态（compose 已定义），保留日志检查作辅助；部署末尾调用 deploy/smoke-test.sh 请求 https://localhost:8443/api/v1/health 做端到端冒烟。
4. .env 加载前做 sanitization（拒绝含 $( 或反引号的行），前置检查 .env.secrets 权限位非 600 则警告。
5. 在 NAS 上实测一次完整部署验证（ssh nas-crm 'cd /volume1/docker/crm-stack && bash deploy/deploy.sh'），部署后核对迁移日志与冒烟结果。
```

---

## Phase B · 数据完整性与金额精度（预计 2-3 天）

### 步骤 B1：金额计算收敛到 money.js（剩余 6 处）

**【AI 提示词】**
```
将 C:\huakey-crm 中剩余浮点金额计算收敛到 backend/utils/money.js（BigInt）：
1. backend/services/hrService.js:280 提成计算 baseAmount * rate / 100 改 money.mul/percentOf。
2. backend/services/purchaseService.js:133 采购计划明细 amount 改 money.mul（对照同文件 :433-448 已合规写法）。
3. backend/services/customerDetailService.js:490-495 客户360汇总 4 处 parseFloat 累加改 money.sum 分桶收集。
4. backend/services/reportAnalyticsService.js:574-577,770 利润/回款率、:243,989 的 toFixed(2) 字符串截断改 money 精确舍入。
5. backend/services/invoiceService.js:86-103,129-130 createInvoice/updateInvoice 不信任客户端 amount/tax_amount，用 money.percentOf(amount, tax_rate) 服务端校验税额一致性，不一致则 422。
6. 每处补单测（含 0.1+0.2 类精度用例）；eslint --max-warnings=0 + jest 全绿后交付。Excel 导出展示类 14 处 parseFloat 维持不动（已拍板）。
```

### 步骤 B2：事务与幂等补全

**【AI 提示词】**
```
补全 C:\huakey-crm 的事务与幂等（P1）：
1. 事务：backend/services/quoteService.js approveQuote(:347-370) 三步写包 getConnection+beginTransaction；opportunityService.js advanceStage(:213+) 多次 UPDATE 包事务。
2. 幂等：用 utils/idempotency.js 的 runIdempotent 接入 quoteService.convertToContract、poolService 的 claim/transfer、invoiceService.createInvoice、purchaseRequestService 提交；路由层从 req.headers['idempotency-key'] || req.body.idempotency_key 取 key，注意 Joi stripUnknown 必须在 schema 显式声明 idempotency_key 字段。
3. 并发：poolService 公海认领补 SELECT ... FOR UPDATE 行锁（:122/168/263/357 四处事务内）。
4. crm_idempotency 表加定期清理：cronService.js 新增任务清理 30 天前记录。
5. 补并发测试（两个请求同时认领同一公海客户，仅一个成功）与幂等测试（同 key 重放返回首个结果不产生重复行）。
```

### 步骤 B3：时区统一

**【AI 提示词】**
```
统一 C:\huakey-crm 三层时区为 Asia/Shanghai（P1）：
1. backend/config/database.js:4-20,72-85 主池与只读池加 timezone:'+08:00' 与 dateStrings 评估（注意评估对现有读取代码的影响）。
2. docker-compose.yml、docker-compose.ci.yml、两个 Dockerfile 补 TZ: Asia/Shanghai（对齐 docker-compose.synology.yml:125,176）。
3. 消灭 UTC 混用：contractService.js:219、paymentService.js:102,338、opportunityService.js:46 的 new Date().toISOString() 改本地时区格式化（抽一个 utils/dateCode.js 统一编号日期生成）。
4. 11 张 timestamp 类型表评估收敛 datetime（出评估清单，不强制改）。
5. 补测试：北京时间早 8 点前生成合同编号日期与 create_time 同日。
```

### 步骤 B4：迁移链基线与治理

**【AI 提示词】**
```
治理 C:\huakey-crm 迁移链（P0-3 衍生，P1）：
1. 新建 000_real_baseline.sql 或在 001 中补齐核心表建表语句（来源 deploy/init-complete.sql 并集），使空库仅靠迁移链可重建；与 init-complete.sql 的一致性由 tests/db/migrationGuard.test.js 双向校验守护。
2. 补齐编号断档说明：064/065/115 确认是跳号还是遗失——若遗失找回脚本，若跳号在 README/迁移索引中显式标注"故意跳号"。
3. 核对 090/108/109 等 down 脚本自述"依赖手动核对"的项，改为可自动执行的条件化 DDL。
4. 清理冗余：crm_contract 重复 FK（init-complete.sql:537/538）与冗余索引 idx_contract_no(:524)、crm_follow_up 双份 FK(:986-989)、crm_payment :1321/1322、crm_payment_plan :1366-1369、crm_customer :664/669——新建迁移去重（先确认无依赖）。
5. 全部用显式命令跑 migration-roundtrip 验证往返，CI migration-test job 同步覆盖。
```

---

## Phase C · 权限与功能一致性收口（预计 2 天）

### 步骤 C1：裸奔端点补权限

**【AI 提示词】**
```
为 C:\huakey-crm\backend 以下仅 authenticateToken 的端点补权限（P1），全部遵循 checkPermission('码') + 数据权限的既有模式：
routes/log.js:57,70（log/detail、log/modules→system:log）；routes/invoice.js:69（invoice/detail→invoice:view 并确认 invoiceService.getInvoice 按归属过滤）；routes/procurement-plan.js:44,55,142（三个读端点→purchase 域读权限）；routes/target.js:39（target/list→target）；routes/integration.js:71（email-log）；routes/product.js:196,247（价格读权限评估，成本价是否对 sales 开放需与我确认）；routes/contract/export.js:42（import-template）；routes/currency.js:20,31、routes/config.js:25、routes/service.js:203/218/230、routes/customer/assign.js:70 逐个评估是否可保持公开（字典类）并在代码注释写明结论。
另：routes/cronJobs.js 4 个 GET 触发写操作改为 POST + 权限码（或迁往内部调度）。
每补一个码同步 init_role_permissions.js + 角色矩阵，补 403/200 双向测试。
```

### 步骤 C2：前端高危按钮补 v-permission + 权限刷新机制

**【AI 提示词】**
```
C:\huakey-crm\frontend 权限收口（P1/P2）：
1. 补 v-permission：system/user.vue:40(删除)/:85(保存)、system/dept.vue:33、system/tags.vue:42、competitor/index.vue:68、competitor/detail.vue:52,73、product/index.vue:187——编码对齐后端。
2. 权限缓存失效：composables/useUser.js 模块级缓存增加失效机制——utils/request.js 收到 403 时触发一次 verifyAuth 强制刷新权限后再提示；管理员改角色后后端通过 SSE 推送权限变更事件（后端 utils/sse.js 已有通道）。
3. 前端 package.json 移除未使用的 pinia 依赖（main.js 从未 use）。
4. frontend 目录跑 vitest 全绿后交付。
```

### 步骤 C3：删除逻辑治理

**【AI 提示词】**
```
C:\huakey-crm 删除逻辑治理（P2）：
1. deptRouteService.js:48 删部门、roleRouteService.js:67 删角色前加占用检查（有用户/有权限配置则 409 拒绝）。
2. approvalService.js:455 物理删 pending 审批记录改为状态取消（保留审计痕迹）；scoringRouteService.js:163 评分历史清表改为软删或快照归档。
3. 41 张无 deleted_at 的业务表出清单评估（crm_payment_reminder/crm_approval_record/crm_approval_step/crm_notification/crm_customer_score_log 等优先补软删），逐表新建迁移加列+改删除路径。
4. 补测试：删除被占用部门返回 409；审批取消后记录仍可查。
```

---

## Phase D · 工程可靠性（测试 / CI / 部署加固，预计 2-3 天）

### 步骤 D1：测试盲区补全 + 覆盖率门槛

**【AI 提示词】**
```
补全 C:\huakey-crm 测试盲区（P1/P3）：
1. 新建 tests 覆盖：routes/leads.js 路由层（列表/转化/权限过滤）、routes/metrics.js、routes/sse.js（鉴权与连接管理）；pool.js 补路由级 HTTP 测试（分页/权限）；contractExportService/contractPaymentService 补独立测试。
2. jest.config.js 覆盖率门槛收紧到 lines/statements 55（当前实际 57.64%，留缓冲），并建立只升不降约定写进 AGENTS.md 或 CONTRIBUTING。
3. 新增 npm script test:security 并把 tests/security 六套件接入 CI（ci.yml backend-test 或独立 job）。
4. 全量 jest 跑绿后交付（判结果禁 tail 截断）。
```

### 步骤 D2：CI 一致性与去重

**【AI 提示词】**
```
治理 C:\huakey-crm\.github\workflows（P1/P2）：
1. Trivy 门禁统一：ci.yml:285-291 image-scan 与 trivy-scan.yml:56-57 对齐（CRITICAL,HIGH + exit-code 1），消除重复构建——ci.yml 的 image-scan 改为复用 trivy-scan 产物或直接删除其一；trivy-scan.yml:79 文件系统扫描也改阻断。
2. 安装命令统一 npm ci --legacy-peer-deps（ci.yml:52,65 改掉 npm install）。
3. frontend 增加 lint 步骤：先给 frontend/package.json 配 ESLint（vue3 + 项目风格），门槛与后端一致 --max-warnings=0。
4. 四个 job 重复的「Import baseline schema + verify invariants」约30行步骤抽成 composite action（.github/actions/），seed/init-permissions 同理。
5. MySQL 等待循环加失败 exit 1 兜底（ci.yml:90-99 等4处）；缓存 key 加 node 版本与 OS；frontend-build needs: frontend-test。
6. 顶层 permissions 显式声明 contents: read。
7. push 后用 gh run view 验证全绿。
```

### 步骤 D3：nginx / compose / 备份加固

**【AI 提示词】**
```
C:\huakey-crm 部署层加固（P1/P2）：
1. nginx/nginx.conf：收紧 CSP（移除 script-src unsafe-inline，如前端确有内联脚本需求改用 nonce/hash）；删废弃的 X-XSS-Protection；HSTS 加 preload 评估；加 Permissions-Policy；ssl_session_timeout 改 10m-1h；加 limit_req_zone 对 /api/v1/auth 限流。
2. docker-compose.synology.yml：nginx(:187-206) 与 backup(:155-181) 服务补 logging json-file 10m×3；MySQL innodb_buffer_pool_size 改为按 NAS 内存自适应（启动脚本探测）；资源限制问题出评估报告（DSM CFS 限制的替代方案：守护脚本监控+告警）。
3. 备份：uploads-backup.sh 与 config-backup.sh 补与 mysql-backup.sh:101 同级的完整性校验；config 备份含明文密钥，产物必须加密（gpg 对称加密，密钥不入库）或排除 .env.secrets；评估 offsite 副本方案（如定期同步到第二盘位/对象存储）。
4. 恢复演练自动化：restore-test.sh 接入 NAS cron（月执行）并在仓库内留可验证载体（如 deploy/cron/ 目录 + 安装脚本），执行结果写日志文件并可被检查。
```

---

## Phase E · 体验与性能（预计 1-2 天，可与 D 并行）

### 步骤 E1：前端图表配色修复

**【AI 提示词】**
```
修复 C:\huakey-crm\frontend 图表配色（P1/P2）：
1. components/dashboard/SalesChart.vue:226：PARENT_SOURCE_COLORS 的 var(--*) 字符串直接喂 ECharts 无效——改用 utils/chartTheme.js 的 cssVar() 解析为实际颜色值，或把 constants/source.js:95-101 改为存语义键、渲染时经 chartTheme 转换。
2. SalesChart.vue:253-254、views/supplier/ranking.vue:117、views/survey/analytics.vue:125 写死 HEX 全部改走 chartPalette()（survey/analytics 的 Element 旧配色 #f56c6c 等换成 apple.css 主题色）。
3. chartTheme.js:28-41 模块级 chartColors 改函数式惰性求值。
4. 跑 vitest + 人工截图核对三个页面渲染。
```

### 步骤 E2：列表分页与杂项

**【AI 提示词】**
```
C:\huakey-crm\frontend 性能与一致性收尾（P2/P3）：
1. system/user.vue:167 pageSize:100 无分页——补 el-pagination 并接后端分页；knowledge/faqs、scripts、documents、scoring/ranking、competitor/index、system/role、dept、tags、target/index、automation/workflows、approval/pending、follow-up/TodayTasks 逐个补分页（数据量小的可前端分页，scoring/ranking 与 approval/pending 必须后端分页）。
2. views/layout/index.vue:240-242 两分钟轮询 fetchReminders 与 SSE 双通道合并为 SSE 单通道。
3. 客户等级选项 4 处硬编码（pool/List.vue:196-198、customer/List.vue:229-231、Detail.vue:494、leads/List.vue:141-143）收敛进 constants/customer.js。
4. vitest 全绿后交付。
```

---

## 三、执行纪律（每步通用）

1. 动手前 `git ls-remote git@github.com:7ztctcmctm-star/huakey-crm.git refs/heads/main` 对一下 HEAD（David 可能并行推送）。
2. 改动文件先过 `node backend/node_modules/eslint/bin/eslint.js --max-warnings=0 <files>`。
3. 涉及迁移的：必须本机测试库 up→down→up 往返 + migrationGuard + 显式跑 migration-roundtrip；同步更新 `deploy/init-complete.sql`。
4. 涉及权限码的：只信 `backend/scripts/init_role_permissions.js`，新增码必须入库并跑一遍该脚本验证。
5. 每个 Phase 完成：commit（禁 --no-verify）→ push → 在当日日志记录。
6. 涉生产的（A4/A5/B3/D3）：走 `ssh nas-crm` 部署流程，部署前 dump，部署后冒烟。
7. 未实测的结论一律标「未验证」。

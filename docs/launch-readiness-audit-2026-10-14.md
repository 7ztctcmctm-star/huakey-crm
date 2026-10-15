# HUAKEYCRM 上线前全盘审计报告（2026-10-14）

> **审计对象**：`main` @ `1d69658`（= origin/main，全长 SHA 一致）+ 工作区 27 个未提交改动
> **审计方式**：本机全量实测 —— 后端官方 `npm test`（含覆盖率门禁）、ESLint、前端 vitest / vite build、
> e2e（integration 配置）、security 套件、MySQL 直查（测试库全量状态）、迁移器实跑、git 祖先链核实、
> GitHub Actions 公开 API（check-runs / jobs / annotations）、部署脚本与配置文件走查
> **审计边界**：未修改任何生产代码（唯一 DB 动作 = 修复测试库，见 §2.4）；NAS 生产环境与 CI 作业日志
> （需 admin 权限）未在本机验证，相关结论显式标注「未验证」
> **结论：当前不具备「直接上线」条件** —— 4 个 P0（其中 3 个本轮实测复现）、9 个 P1、7 项产品拍板

---

## 一、给负责人的一句话结论

代码底子好（官方门禁全绿：后端 133 套件/1345 用例、前端 145 用例、build 通过、lint 0 error），
但**「改动未收口」集中在四处**：① 10-09 的两轮安全修复（14 个源码文件）至今只存在于工作区，未提交未部署；
② CI 三处检查持续红色（依赖漏洞 / iPhone 作业死配置 / Trivy 镜像扫描）且从未被处理；
③ 公海池页面恒空（09-29 已诊断的 P0-1 原样未修）；④ 迁移回滚链会在本地毁库且「静默通过」。
外加 7 个需要你拍板的产品决策（hr 角色、迁移 120 范围等）。

---

## 二、本轮实测通过项（可直接作为验收证据）

| # | 项 | 实测命令/方式 | 结果 |
|---|---|---|---|
| 1 | 后端官方测试门禁 | `cd backend && npm test`（默认配置，含覆盖率阈值） | ✅ **133 套件 / 1345 用例全过**，覆盖率 53.9% / 36.46% / 52.72% / 57.1%（阈值 40/30/40/40 全过） |
| 2 | 后端 ESLint | `eslint backend --max-warnings=0` | ✅ **0 error**；2 warning 均为历史已知项（`customerService.js` loadStatusConfig、`audit-role-permission-drift.js` totalAdded，均为有意保留） |
| 3 | 前端单元测试 | `vitest run`（frontend 目录，串行） | ✅ **23 文件 / 145 用例全过**（并行重负载下有 4 个 30s 钩子超时，串行复跑全绿——负载抖动，非代码缺陷） |
| 4 | 前端生产构建 | `vite build --emptyOutDir=false` | ✅ exit 0 |
| 5 | e2e 集成测试 | `jest --config jest.integration.config.js`（带测试库凭据） | ✅ tests/e2e/* 全过（143 套件中 6 个失败全为 migrationGuard，根因见 P0-4，非 e2e 自身） |
| 6 | security 套件 | `jest tests/security/` | ✅ 6 套件 90 过 1 败（唯一失败 = M-007 断言类型脆弱，见 P1-8） |
| 7 | 测试库迁移链（修复后） | `run_migrations.js` 实跑 + migrationGuard | ✅ 118 记账 = max 121；`crm_contract_item`/`crm_approval_rule` 在；manager 105 = boss 105；knowledge 8 角色；`api_platform`/`log:delete`/`log:export` 在；守卫 10/10 绿 |
| 8 | 版本控制 | `git ls-remote origin refs/heads/main` vs `rev-parse HEAD` | ✅ 全长 SHA 一致（1d69658…）；`refactor/v1.1-data-perm-unify`（2f87d64）已全量并入 main（4fb7ed2 合并点在祖先链上） |
| 9 | CI（10-12 定时运行，#193） | check-runs / jobs / annotations API | ✅ frontend-test、frontend-build、security-scan(CodeQL)、integration-test、migration-test(8m47s)、image-scan、cross-browser(chromium/firefox/webkit) 全过；e2e-test 按设计 skip。❌ 4 个红见 P0-1 |
| 10 | 密钥与生产配置 | `.env.secrets` / `.env` 走查 | ✅ 9 个密钥键齐全、0 占位符；`NODE_ENV=production`、`SKIP_CAPTCHA=false`、`ENABLE_SWAGGER=false`、`CORS_ORIGIN=https://crm.huakey.local`、`REDIS_ENABLED=true` |
| 11 | 部署编排 | `deploy/deploy.sh` 走查 | ✅ 12 步：secrets 注入 → 环境校验（validate-env.js）→ 构建 → 启动 → 迁移 → 迁移结果验证 → 权限初始化（init_role_permissions.js） |
| 12 | 备份体系 | `deploy/backup/` 走查 | ✅ mysql/uploads/config 三件套 + restore-test.sh + 宿主机兜底脚本齐备（生产 09-30 验收确认调度在跑） |

---

## 三、P0：上线前必须闭环（4 项）

### P0-1 CI 三处检查持续红色（10-05、10-12 两次定时运行均红，从未处理）

| 检查 | 根因（本轮已实测定位） | 证据 |
|---|---|---|
| **backend-test** | `npm audit --audit-level=high --production` 发现 **3 high + 1 critical**（共 12 漏洞）：proxy-addr <2.0.8（**critical**，IPv4-mapped IPv6 信任子网 IP 欺骗，经 express 传递）、compression <1.8.2（high，响应提前关闭致内存泄漏 DoS）、brace-expansion（high，DoS）、nodemailer ≤10.0.8（high，SMTP 凭据跨租户泄漏/多个 DoS）、qs（moderate） | jobs API：步骤 9 `npm audit` conclusion=failure（npm test 本身 17s 通过）；本机同命令复现同样 12 漏洞 |
| **cross-browser-test (iPhone 12 Pro)** | `npx playwright install --with-deps iPhone 12 Pro` **1 秒即败**——`playwright install` 只接受浏览器名（chromium/firefox/webkit），"iPhone 12 Pro" 是**设备名**。⇒ 该作业自创建以来**从未真正执行过测试**（与 9 月修掉的「cross-browser 触发器死配置」同族） | jobs API：步骤 12 install failure（1s），步骤 13 Playwright tests skipped；ci.yml:296 matrix `browser: [chromium, firefox, webkit, 'iPhone 12 Pro']` |
| **scan-images ×2（Trivy）** | 镜像扫描失败（severity CRITICAL/HIGH 门禁，trivy.yaml）。注解仅 "exit code 1"，**具体漏洞清单未获取**（作业日志需 admin 权限）⇒ 根因未验证 | annotations API ×3；与 backend-test 的 npm audit 可能同源（基础镜像内漏洞） |

**影响**：项目自己的 CI 闸门是红的；生产镜像带 critical 依赖漏洞；移动端兼容性零覆盖。
**修法**：① 在可安装依赖的环境执行 `npm audit fix`（升级 express/body-parser/compression/nodemailer/proxy-addr/qs；本机沙箱有 wsl 黑名单，可能需换环境）→ 重跑 `npm run lint && npm test` 回归 → 提交；② iPhone matrix 改为安装 webkit + 用 Playwright device 描述符跑（或删掉该条目并在 webkit 作业内覆盖移动 device）；③ 取得 Trivy 作业日志定位漏洞后升级基础镜像或加 trivy ignore（需评审）。

### P0-2 公海池页面恒空（09-29 P0-1 原样未修，本轮实测复现）

- `customerService.js:904` `listPoolCustomersNew` 仍以 `c.pool_status = 'sea'` 为唯一公海判据；
- 本轮实测测试库：`owner_id IS NULL` 426 行，其中 `pool_status='sea'` **0 行**（423 行 = `0`、3 行 = `private`）
  ⇒ `POST /api/v1/pool` 恒返回空，423 条无主客户无法认领；
- 09-29 报告已给出修法（数据回填迁移 + 判据统一 `owner_id IS NULL` + 不变量测试），**至今无对应提交**；
- ⚠️ 生产库同源迁移，**极可能同样错位**（未验证，须上 NAS 核对）。
- 另注意 `poolService.js:33` 的 `owner_id IS NULL` 实现是正确的但被架空（09-29 已记）。

**修法**：按 09-29 报告 §三-P0-1 三条执行；生产执行前必须先 NAS 核对并按「一次性数据修复迁移需拍板」流程走。

### P0-3 42 项变更未提交——10-09 两轮安全修复（14 个源码文件）不在任何提交里

> **✅ 2026-10-14 已闭环（入库 + 推送，尚未部署 NAS）**：分 3 个提交推上 origin/main
> （`833519d` 安全修复+测试 / `c9bd4ed` 测试基建+迁移守卫 / `9ef6983` slowQuery 修复+审计报告），
> remote = local = `9ef6983`（全长 SHA 已验证）。**剩余动作：纳入下次 NAS 部署**（生产当前运行的代码仍不含这些修复）。

- 工作区共 **42 项变更 = 30 个修改 + 12 个未跟踪**（初始快照曾因 `head -30` 截断误报为 27，特此更正）；
- 未提交源码 14 文件 + `docker-compose.yml` + 14 个测试文件改动 + 5 个新测试文件
  （`migrationGuard` / `securityFixes20261009` / `securityFixes20261009b` / `securityFixesE2E` / 本次新增 `slowQuery`）+ 6 份报告；
- 内容 = 10-09 两轮安全修复（1 Critical + 5 High + 7 Medium + 2 Low）：验证码 key 改密码学随机（M-002，`authService.js`）、分配/转移目标用户校验（H-002，`assignService/transferService`）、报表 filter 白名单（`customReportService.js`）、compose 加固（Redis 不暴露端口 M-006 / backend 健康检查 + uploads 持久化 M-007）等；
- **HEAD（1d69658，09-30）不包含它们；生产 NAS 运行的代码也不包含**（最后一次部署为 08-31，09-30 验收只覆盖权限/迁移/数据）；
- ⇒ 若从 HEAD 重建镜像，全部安全修复丢失；且这些修复的 57 个回归测试（+14 个真库 E2E）也未入库。

**修法**：review → 本地全量回归（已完成，见 §二）→ 提交 → push → 纳入下次 NAS 部署。这是上线前第一优先动作。

### P0-4 迁移回滚链毁库 + 静默通过（09-29 P0-3 未修，本轮实测三次复现）

**机制（已完全定位）**：`tests/db/migration-roundtrip.test.js` 的 `beforeAll` 执行
`run_migrations.js --rollback 002`（深回滚，跑遍 003~121 全部 down 脚本）再正向重放。
本机实测：回滚执行到 `097_down` 必崩（`Incorrect integer value: 'private' for column 'pool_status'`——09-29 已记载此缺陷）→ `exit(1)` → 非严格模式仅 `console.warn` + `return` → **55 个往返用例全部「被跳过」而套件报告 PASS**，而 121/120/118/117/116/114/115 的 down 脚本已跑完（删 2 张表、清空 manager 全部权限、删 7 条记账）。

**本轮实测时间线**（三次触发，两次是我亲手修）：
1. 审计开始时测试库已处于被毁状态（112 记账、`crm_contract_item`/`crm_approval_rule` 不存在、manager 权限 0 条）——即 10-13「修复后全绿」的尾巴已被此机制二次毁掉；
2. 我的第一次全量跑（带 DB 凭据）再次触发；用官方迁移器修复 → 118 记账、守卫 10/10 绿；
3. e2e 跑（integration 配置含 tests/db）第三次触发；e2e 套件自身的 setup-integration 在后续套件前重跑迁移自动修复，最终库健康、守卫复测 10/10 绿。

**触发条件**：仅当「jest 全量 + 显式 DB 环境变量（DB_USER/DB_PASSWORD）」同时满足。官方 `npm test`（不带 DB 变量）时 roundtrip 因 root 认证失败自动跳过，**不毁库**；CI backend-test 无 MySQL 跳过；CI migration-test 以 strict 模式在全新库上单独跑该文件（10-12 通过，8m47s）。
**影响**：本地「带凭据跑全量」会产生假红（migrationGuard 报警）并留下烂库直到有人重跑迁移；「全绿」结论的尾巴不可信。
**修法**（09-29 已给，仍未做）：① 按 version 前缀匹配 down 文件（不依赖 `schema_migrations.name` 后缀，本机 112 行里大量无后缀）；② 修复 `097_down`（去掉 `deleted_at IS NULL` 限定或 ELSE 兜底）；③ 跳过必须显式失败或 `--force` 才允许；④ roundtrip 的 beforeAll 改为「快照→回滚→重放→恢复快照」，避免共享库被毁。

---

## 四、P1：上线前应闭环（9 项）

| # | 问题 | 实测状态 | 修法 |
|---|---|---|---|
| P1-1 | **slowQuery.js 无参慢查询必崩**：`JSON.stringify(undefined)` 返回 undefined → `.slice` TypeError。第 44 行（成功路径，经 `maskFieldValue` 原样返回 undefined）与第 57 行（失败路径）**均中招** | 本轮 transaction.integration 3 例失败即此（重负载下无参查询超 1000ms 阈值触发）；隔离复跑因未超阈值掩盖。生产同理会把慢查询的日志代码搞挂、甚至顶替原始 DB 错误 | 两处改 `JSON.stringify(x ?? null)`，补无参慢查询回归用例 |
| P1-2 | **/cron/*、/metrics/client、/platform/* 仍 404**（09-29 P0-2 只修了 customers/pool/leads）：`app.js:421/512` 的 require 仍在 `app.js:357` 的 registry 快照循环之后；前端 `api/system.js` 11 处仍调 `/platform/*` 而后端注册 `/api-platform` | 代码走查确认；/metrics/client 是前端性能上报入口（sendBeacon 静默失败，生产性能数据一直在丢）；/cron 4 个运维端点失效（node-cron 进程内调度不受影响） | 把两个 require 移到循环前（同 8c246df 修法）；/platform 与 /api-platform 二选一；加静态回归检查 |
| P1-3 | **followup / quote 模块无数据权限配置行**（09-29 P1-4 部分未修）：`init_role_permissions.js` 的 DATA_PERMISSIONS 有 analysis（boss=all/manager=dept_and_sub）但**无 followup、无 quote**（已配的是 quotation，与路由模块名 quote 不一致） | 脚本走查确认 ⇒ manager 在这两个模块被 fail-closed 静默降级为 self（表现为「没数据」而非报错） | 脚本补 followup/quote 配置行 + 启动自检（路由 module 必须有配置行） |
| P1-4 | **hr.js 17 端点把 hr 角色挡在自己模块外**：`checkPermission('hr') + requireManager` 双挂，hr 角色 manage_all=0 且非 manager（已核实其持有 hr 码） | 代码走查确认（routes/hr.js 18 处 requireManager） | 需拍板，见 §六-4 |
| P1-5 | **MySQL 容器无时区设置**（09-29 P1-3 未修）：`docker-compose.synology.yml` 的 mysql 无 `TZ`、无 `--default-time-zone`（app/backup 有 `TZ: Asia/Shanghai`） | compose 走查确认 ⇒ NOW()/CURDATE() 与业务时区可能不一致 | 加 `TZ` + `command: --default-time-zone=+08:00`，核对既有时间字段 |
| P1-6 | **前端无 ESLint + vitest 负载抖动**：frontend 无 lint 配置；本轮并行重负载下 4 个用例 30s 超时（串行全绿） | 实测（09-29 P1-2 同结论） | 补 ESLint 配置；CI 串行化或调超时阈值 |
| P1-7 | **security 套件 CI 从不运行**：`tests/security/` 被 jest.config.js 与 jest.integration.config.js **双双排除** ⇒ cors/rateLimit/headers/upload/securityFixes*（91 用例）只在本地跑 | 配置走查确认；本轮本地跑 90/91 过 | CI 增加 security-test job（或并入 integration-test） |
| P1-8 | **M-007 断言类型脆弱**：`docker compose config` 解析出的 `mem_limit` 是字符串 `"536870912"`，测试断言数字 ⇒ 该用例在能解析 compose 的环境必红 | 本轮实测失败（securityFixes20261009b:264） | 改 `Number(...)` 或字符串比较 |
| P1-9 | **迁移 120 与权限唯一年事实源冲突未消账**：120（复制 boss 全部功能权限给 manager）已 executed 于生产（09-30，manager 105 码），但与 `init_role_permissions.js:253` 的 manager=dept_and_sub 定位冲突；文档未更新 | 09-29 P0-4 的文档债；本轮确认 120 文件仍在迁移目录且会被自动执行 | 见 §六-2 拍板后更新文档/脚本 |

---

## 五、P2 / 建议项（不阻塞上线，建议随版处理）

1. **仓库卫生**：12 个 `tmp_*` 脚本曾进 HEAD（09-29 P1-6），当前工作区显示为未提交的删除（未提交）；`.agent-kernel/` 未跟踪；`.gitignore` 建议加 `tmp_*`。
2. **同一业务动作两条链路**（09-29 P1-7 未处置）：`POST /pool/release` vs `POST /customers/release`；两个 `claimCustomer` 语义互斥（`poolService` 按 owner_id、`customerService:519` 按 pool_status，后者仅测试引用）。
3. **零调用端点**：静态比对约 100 个后端端点前端从未调用（`/invoice` 6/6 等），未逐条复核，需业务确认预留还是废弃。
4. **金额精度债**：仅 `quoteService` 完整采用 `utils/money.js`（BigInt），合同/回款/发票/财务多为 `parseFloat`。
5. **IMAP 收信未实现**（邮件域 #14）：缺依赖且本机装不了，需产品决策是否阻塞。
6. **文档过时**：`DEPLOYMENT_BLOCKERS.md`（2026-07-23）已被 `crm-deployment-blockers-verification-2026-09-10.md` 取代，建议归档；多份文档数字过期（09-29 L-3）。
7. **CI 基建告警**：Node 20 弃用警告（actions 被强制跑在 Node 24）、CodeQL v3 将于 2026-12 弃用、ubuntu-latest 10-19 迁移 Ubuntu 26——建议随下次 CI 维护一并升级。

---

## 六、需你拍板的产品决策（7 项，非技术问题）

| # | 事项 | 背景与选项 |
|---|---|---|
| 1 | **公海判据与数据修复** | P0-2：`pool_status` 降级为只读兼容字段（判据统一 `owner_id IS NULL`）还是彻底废弃？生产是否允许执行 423 行回填的一次性迁移？ |
| 2 | **迁移 120 的范围** | manager 是否应持有 boss 的系统级权限（角色权限分配/备份恢复/用户管理）？若否，120 的设计需修正而非补跑（其 down 脚本 `DELETE WHERE role_id=2` 会清空 manager 原有权限，本身就是缺陷） |
| 3 | **boss 是否绕过功能权限** | 代码现状绕过（`middleware/permission.js` manageAll 白名单），MASTER_SPEC §5.1 写「不绕过」——文档与实现必须二选一 |
| 4 | **hr.js 处置** | 方案 A（倾向）：去掉 `requireManager` 只留 `checkPermission('hr')` + 配 hr 域数据范围；方案 B：中间件纳入 `ROLE_CODES.HR`（会同时放开 hr 到所有挂 requireManager 的模块，风险大） |
| 5 | **零调用端点去留** | 约 100 个端点前端零调用，逐条业务确认 |
| 6 | **休眠账号治理** | 生产 13 个 last_login=NULL 账号（09-30 已记），离职的置 status=0 |
| 7 | **依赖升级窗口** | P0-1 的 express 等升级可能触及行为变更，是否批准在发版前做（还是接受风险上线后修） |

---

## 七、未验证清单（不得当作已通过）

1. **NAS 生产环境实时状态**：容器健康、备份三件套最近生成、cron 最近执行——09-30 验收后未复核；
2. **生产库 `pool_status` 错位**（P0-2 同源风险）——须上 NAS 核对；
3. **CI 失败作业的完整日志**（backend-test 已定位到 npm audit 步骤；iPhone/scan-images 需日志细节）——需 admin 权限；
4. **Trivy 具体漏洞清单**（scan-images 两次失败的 CVE 明细）；
5. **灾备端到端恢复演练**（restore-test.sh 有文档记录，最近一次未在本轮复核）；
6. **生产运行的应用代码版本**（最后一次 NAS 部署的确切 commit 未核实）。

---

## 八、上线操作清单（建议顺序）

```markdown
第 0 步（今天就能做）
■ 1. 提交 42 项变更 + NAS 部署   [P0-3] ✅ 2026-10-15 闭环：833519d 等 4 提交入库；NAS 从 8c246df 快进至 91574e1 并部署成功（12 步 DEPLOY_EXIT=0，迁移 0 失败，5 容器 healthy，health 200，新代码指纹验证齐）
■ 2. 修复 slowQuery.js 两处 `?? null` + 补回归用例（P1-1，1 行级改动）✅ 2026-10-14 已完成：safeSlice() 修复 + 4 回归用例（变异验证 3/4 报警），随 9ef6983 入库

第 1 步（发版阻塞项）—— ✅ 2026-10-15 全部完成，四个 P0 闭环
■ 3. 依赖升级 + CI 验证   [P0-1a] ✅ 2026-10-15 闭环：npm audit 0 漏洞（原 3 high + 1 critical）；CI 实测 backend-test/scan-images×2/Trivy 工作流全 success
■ 4. iPhone matrix 修复 + 实跑验证   [P0-1b] ✅ 2026-10-15 闭环：matrix 拆 browser/project 两维；workflow_dispatch 四矩阵全绿，iPhone 12 Pro 装 webkit + device project 实跑 4m23s 通过
■ 5. Trivy 镜像扫描   [P0-1c] ✅ 2026-10-15 闭环：依赖升级后镜像内 npm 漏洞消除，两 scan-images + Trivy 工作流自行转绿（无需 admin 日志）
■ 6. 公海判据 + 生产数据核对   [P0-2] ✅ 2026-10-15 闭环：判据统一 owner_id（含第四处死代码 claimCustomer 遗漏）+ 回归 4/4；生产库 SSH 实测数据本就一致（423 无主全是 lead/2 条 following 均 sea）⇒ 拍板#1 定案不建回填；已随 NAS 部署生效
■ 7. 迁移回滚链   [P0-4] ✅ 2026-10-15 闭环：version 前缀查找 + 097/070/002 down 修复 + 补 119_down + 破坏性套件隔离 + roleCode 化 + afterAll 完整重建序列；CI migration-test 绿
  · run_migrations.js：down 文件按 **version 前缀**匹配（不再依赖 name 后缀——本机 112 行记账大量无后缀）；缺 down 文件默认**显式失败**（exit 1），仅 `--force` 允许跳过
  · 修复三个数据依赖型 down 缺陷（均被 name 后缀 bug 掩盖、本轮逐一暴露）：**097_down**（软删无备份行留 'private' 撞 ALTER）、**070_down**（先 ALTER TINYINT 再恢复值，顺序颠倒 + 无备份行无兜底）、**002_down**（重加旧 5 值 CHECK 前不收敛来源值）
  · migration-roundtrip.test.js：rollback/replay **分离**——回滚失败也必须重放（重放即修复）；afterAll 强制重放（用例失败不留烂库）；down 覆盖审计改白名单断言（缺失必须=已知清单）；结构对比剔除 AUTO_INCREMENT；per-case 回滚加 --force
  · 120/121 up+down 改按 **roleCode** 定位（原硬编码 role_id=1/2/6/3——finance 在测试库是 31，硬编码授权曾静默丢失）；migrationGuard 测试同步改 roleCode
  · 实测：带凭据跑 roundtrip（原毁库触发器）⇒ 深回滚 121→002 全程走通、重放成功、用例通过、**库存活**（118 记账/表齐全/manager=boss）；守卫 10/10 绿

第 2 步（应闭环，0.5–1 天）
□ 8. /cron、/metrics/client、/platform 404 修复 + 静态回归检查   [P1-2]
□ 9. init_role_permissions.js 补 followup/quote 数据权限行 + 启动自检   [P1-3]
□ 10. MySQL 容器时区   [P1-5]；M-007 断言修类型   [P1-8]
□ 11. CI 增 security-test job   [P1-7]；前端 ESLint + 测试超时核对   [P1-6]

第 3 步（拍板后执行）
□ 12. 7 项产品决策逐条落账（§六），hr.js 按定稿实施   [P1-4/P1-9]

第 4 步（发布）
□ 13. 全量回归：后端 npm test + 前端 test/build + e2e + security 全绿
□ 14. CI 全绿（含手动触发 cross-browser 全 matrix）
□ 15. NAS 部署（deploy.sh）→ 生产核对：迁移台账、权限脚本执行、备份三件套、冒烟（登录/客户/报价→合同）
□ 16. 打 tag（v1.0.2 或按版本策略），24h 观察项按 crm-v1.0.1-release-checklist §四执行
```

---

## 九、本轮审计的附带修复（仅测试库，无生产代码改动）

- 审计开始时实测测试库 `huakey_crm_test` 处于被毁状态（112 记账 / 2 表缺失 / manager 权限清零），
  用官方 `run_migrations.js` 修复两次，最终态：**118 记账 = max 121、两表在、manager 105 = boss 105、
  knowledge 8 角色、守卫 10/10 绿**；
- 修复前备份：`C:/Users/a8466/huakey_crm_test-backup-2026-10-14-audit.sql`（3.28 MB）；
- 全程未改任何生产代码、未动生产库、未提交任何 git 变更。

---

## 十、结论

**放行判定：不通过。** 官方质量门禁（测试/lint/构建）本身是绿的，证明代码底子达标；
但 P0-3（安全修复未提交未部署）、P0-1（CI 红 + 生产镜像带 critical 漏洞）、
P0-2（公海池不可用）、P0-4（回滚链毁库）四项闭环前，不具备「直接上线」条件。
按 §八 顺序执行，第 0+1 步完成后可进入发布评审；第 3 步拍板项不依赖技术排期，可并行推进。

---

*审计：AI 助手（本机实测）｜日期：2026-10-14｜依据：官方 npm test / eslint / vitest / vite build /
jest(integration+security) / run_migrations.js 实跑 / MySQL 直查 / git 祖先链核实 /
GitHub check-runs·jobs·annotations API / deploy·compose·nginx·ci.yml 走查。
NAS 生产环境与 CI 作业日志未验证项已在 §七 显式列出。待 David 复核。*

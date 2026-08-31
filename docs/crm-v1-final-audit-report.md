# 铧旗CRM v1.0.1 最终审计报告（Final Audit）

> 审计时间：2026-08-31
> 审计分支：`fix/v1.0.1-security-patch`（HEAD = `20fc2a4`，工作区含未提交修复）
> 审计方式：八维度只读审计（历史对账 / 回归验证 / 代码安全 / 全量用户权限 / 数据库 / 部署配置 / 前端 / 交付就绪），生产库经 SSH + 容器内凭据只读查询
> 审计约束：未修改任何业务代码、数据库结构与冻结模块

---

## 一、审计结论（TL;DR）

| 维度 | 结果 |
|---|---|
| 回归验证 | ✅ 后端 105 套件/1028 用例全过、前端 44/44、构建成功、ESLint 0 error、路由扫描 0 缺失 |
| 依赖安全 | ✅ 前后端 npm audit（官方源）均 0 漏洞 |
| SQL 注入（上轮唯一高危） | ✅ 修复已在**生产容器实际运行**（customReportService.js L126 白名单已验证） |
| 全量用户权限（维度八） | ✅ 体系健康：路由 86 码/前端 43 码全部有定义、无用户级越权、数据权限矩阵与代码一致 |
| 历史问题闭环 | ✅ 2026-08-18 审计 11 项高危全部闭环；上轮最终审计 22 项中 19 项闭环 |
| 数据库 | ✅ 禁用语法清零、schema_migrations 107 条与迁移文件结构吻合 |
| 备份灾备 | ✅ **已修复（2026-08-31）**：backup 服务重写为三合一调度器，MySQL/uploads/config+证书 每日 02:00/02:30/02:45 全覆盖，已在生产验证 |
| 交付一致性 | ✅ **已修复（2026-08-31）**：全部 34 个文件变更分 5 批提交并推送（36c525b…a6950b0），Git 与生产一致 |

**综合结论**：代码与安全层面达到交付条件，权限体系经全量核对健康。审计发现的 2 项 P0（生产代码未入库、灾备缺口）与 P1 配置项已于 2026-08-31 全部修复（详见 §九 修复执行记录）。剩余待办为人工确认项（NAS 密码轮换、休眠账号治理）。

---

## 二、回归验证结果（维度二）

| 项 | 命令 | 结果 |
|---|---|---|
| 后端 Lint | `npm run lint` | ✅ 0 error / 5 warning（全部位于 `backend/tmp/` 一次性脚本） |
| 后端测试 | `npm test` | ✅ 105 套件 / **1028 用例全部通过**（含新增 4 个 SQL 注入回归用例；上轮超时的 readwrite-separation 本轮通过） |
| 覆盖率 | — | statements 48.38% / branches 30.64% / functions 46.81% / lines 51.44%（达阈值） |
| 前端构建 | `npm run build` | ✅ 52.84s，分包正常，pinia 死依赖分包已消失 |
| 前端测试 | `npm test` | ✅ **44/44 通过**（上轮 7 项 jsdom 环境超时已不复现） |
| 路由扫描 | `node scripts/scan_routes.js` | ✅ 0 条缺少认证的非公开路由 |
| 依赖审计 | `npm audit`（官方源） | ✅ 前端 0 / 后端 0 漏洞 |

---

## 三、全量用户权限审计（维度八，本轮新增维度）

### 3.1 账号层（生产库 25 个用户）

| 检查项 | 结果 |
|---|---|
| 真实业务用户 | 22 个，全部 status=1、无软删除、must_change_password=0（均已改密） |
| E2E 测试账号 | 3 个（t_fin/t_pur/t_mgr_131845），**已禁用 + 软删除**，处置正确 ✅ |
| Demo 账号残留 | 无（is_demo 全部为 0）✅ |
| 管理权限范围 | boss 角色共 2 人（admin、lvcongming）——需业务确认是否均为管理层预期 |
| ⚠️ 休眠账号 | **13 个账号从未登录**（last_login_time=NULL），5 个停留在上线前 2026-05-29；上线（08-06）后实际活跃仅 4 人：admin、Rin、Ken、hechengqi |

**建议**：对 13 个从未登录的账号逐一确认在职状态，离职/长期不用账号置 status=0 禁用，缩小攻击面。

### 3.2 角色-权限层（7 角色 × 117 权限码）

- 生产库各角色权限数：boss 104 / manager 78 / sales 46 / hr 18 / purchase 26 / finance 23 / engineer 17
- **生产库权限状态与工作区新版 `init_role_permissions.js` 完全一致**（上轮"权限错位"修复已落库生效）：
  - boss/manager 补授 search、tag、contract_template、competitor:*、email:send、leads:view/convert 等 15~19 个新码 ✅
  - **invoice 权限已完全收敛至 finance**（boss/manager 的发票写权限与数据范围均已移除）✅
  - 数据权限表 sys_data_permission 53 行与代码 DATA_PERMISSIONS 一致 ✅
- 三方交叉核对：
  - 后端路由实际使用 **86 个权限码 → 全部在 DB 有定义**（无 403 缺码风险）✅
  - 前端路由 meta 使用 **43 个权限码 → 全部在 DB 有定义** ✅
  - `crm_user_permission` 表 **0 行**——无用户级特殊授权，权限完全由角色驱动，无隐性提权 ✅
- 数学吻合验证：117 全码 − 12 死码 − invoice 菜单码 = boss 的 104 ✅

### 3.3 数据权限层

- 424 条客户**全部 owner_id=NULL 且 status='lead'**（8-07 遗留 P1-1 的持续状态）→ sales 数据范围 `self` 的公海兜底（owner NULL + lead/sea 可见）有效缓解，**无数据不可见问题** ✅
- 但业务侧客户归属分配与状态流转尚未启动（P2-2 持续），建议推动业务录入

### 3.4 死码清单（低危，可选清理）

DB 中定义存在但无任何角色授予且无路由/前端使用的 12 个权限码：
`approval:view`、`customer:manage`、`followup_template`、`leads`(menu)、`leads:add`、`leads:claim`、`leads:release`、`notification:view`、`permission:view`、`pool:assign`、`reminder`、`scoring:view`

> 这些码会出现在权限管理 UI 的可勾选列表中但无实际效果，建议下个版本随迁移清理。

---

## 四、历史问题对账总表（维度一）

### 4.1 上轮最终审计（crm-v1.0.1-final-pre-launch-audit.md）22 项

**已闭环 19 项**，包括：SQL 注入修复（§三-1）、nginx 双配置废弃标注（§三-2）、CORS_ORIGIN 全部统一为 `https://crm.huakey.local`（§三-3）、REDIS_PASSWORD 模板去重（§三-7）、nginx TLS 升级（§三-8，**但见 P1-3 未 reload**）、migrate.js 注释校准（§三-10）、logout HS256（§三-12）、.env.test 移出跟踪（§三-9）、init-complete.sql 最小基线警告头（§三-11 缓解）等。

**未闭环 3 项（均低危/可选）**：survey 绕过全局限流（§三-6）、schema_migrations 结构漂移（§三-11）、本机 npmmirror registry（§三-14）。

### 4.2 2026-08-18 全项目审计（11 高危 + 14 中危）

- **11 项高危全部闭环**：H-SEC-1~4（禁用用户 401、客户 360/报价合同写/合同搜索数据权限）、H-FE-1~6（API 契约对齐，后端补 PUT /email/account/:id）、H-B-1（跟进状态推进含 LEAD）
- 中危闭环情况：M-SEC-1~4 ✅；M-B-1 按**领域边界设计决策关闭**（quoteService.js L101 注释明确，非缺陷）；M-B-2 部分（run_migrations.js 有事务，生产容器用 migrate.js 无事务——靠幂等 + fail-fast 缓解，已接受）；M-B-3 ✅；M-DEP-1 部分（密码已从脚本清除，见 P1-4）；M-DEP-2/3 ✅
- 工作区另含**角色码对齐现库**修复（roles.js、assignService、hrService、teamDashboardService、permission.js）：修复旧码 `sales_manager/tech/admin/super_admin` 在库中不存在导致静默空结果的问题，以及非 customer 模块误拼 status 列导致 500 的 bug——**这批修复未记录在上轮审计 §四 变更表中**，属文档遗漏

### 4.3 其他文档对账

- `DEPLOYMENT_BLOCKERS.md`（07-23）：P0/P1 均闭环，但 P1-10 cpus、P0-4 CORS、P1-9 nginx 三处表述已过时（文档卫生项）
- `crm-v1-known-issues.md`：NI-1~NI-5 为 v1.1 backlog 不阻塞；NI-4（3 个失败单元测试）已被本轮 1028/1028 覆盖确认修复
- `crm-v1-final-production-acceptance-report.md` 遗留：P1-1 客户归属（持续，见 §3.3）、P1-2 DSM 定时任务（见 P0-2）、P1-3 secrets 离线保存（人工项）

---

## 五、新发现问题（按严重度）

### 🔴 P0-1 生产运行未提交代码（交付一致性风险）

- **证据**：生产容器（40 分钟前重启）已运行工作区未提交的修复——customReportService.js L126 白名单、dashboard/team-dashboard 权限码、HS256、reminder/followupTemplate 权限码均已在生产验证存在；但 `git status` 显示 29 个修改 + 3 个未跟踪文件**未提交**。
- **风险**：若 NAS 部署目录损坏或任何人从 Git 仓库重建镜像，**SQL 注入修复等高危修复将丢失回退**。
- **处置**：立即分批提交并推送（建议分组：①fix(security) 注入修复+回归测试+HS256；②fix(rbac) 权限码/角色码对齐；③fix(deploy) nginx TLS/Dockerfile/deploy.sh/env 模板；④docs 审计报告）。`deploy/sync-prod.bat`（SSH alias 无硬编码凭据，做法正确）与 `backend/tests/customReportService.test.js` 必须随提交。

### 🔴 P0-2 灾备缺口：文件/配置/证书备份停摆

- **证据**：`database/backups/` 中 MySQL 备份每日 04:00 正常（最新 `huakey_crm_20260831_040001.sql.gz`，执行者为 `database/backup.sh`，NAS 侧调度待确认）；但 **uploads 备份停在 2026-08-06、config/env/nginx 备份停在 2026-08-07**（发布时手动产物）。
- **根因**：`huakey-backup` 容器（设计承担每日 02:00 定时备份）**无限崩溃重启**——基于 mysql:8.0 镜像，其 Cmd 依赖 `crond`，但该镜像无 crond 命令（compose 注释"内置 busybox crond"为错误假设），日志报 `crond: command not found`。
- **违反**：项目灾备规则（数据库+文件+配置+证书四类备份全覆盖）。
- **处置建议**：二选一——①删除 backup 服务，改用 DSM 任务计划调度 `deploy/backup/{uploads,config}-backup.sh`（与现状的 04:00 MySQL 备份统一管理）；②backup 服务改用 `alpine` 镜像 + `apk add dcron mysql-client`。修复后验证四类备份均有当日产物。

### 🟠 P1-3 生产 nginx 未加载新 TLS/安全头配置

- **证据**：容器内 `/etc/nginx/conf.d/default.conf` 已是新版（含 HSTS、现代密码套件），但 `curl -skI https://localhost:8443/` 响应无 `Strict-Transport-Security`、`X-Frame-Options` 仍为 helmet 的 SAMEORIGIN——bind mount 文件更新不会自动 reload 进程。
- **处置**：`docker exec huakey-nginx nginx -s reload`（或重启 nginx 容器），然后复验 HSTS 头出现。

### 🟠 P1-4 NAS 凭据轮换待人工确认

- 旧密码 `Aa123456` 已从全部脚本清除（现仅存在于审计文档 [audit-report-2026-08-18.md](../docs/audit-report-2026-08-18.md) L139 的 git 历史中）；但**用户名 `syadmin` 仍硬编码在 5 个 git 跟踪脚本**（push-prod.bat、sync-test.bat、deploy-test-full.bat、synology/update-nas.sh、setup-ssh-key.sh）。
- **需人工确认**：NAS 密码是否已在 08-18 审计后轮换。若未轮换，立即轮换并对文档脱敏；若已轮换，将文档中旧密码替换为 `***`。

### 🟠 P1-5 休眠账号治理

见 §3.1——13 个从未登录账号确认在职状态，离职即禁用。

### 🟠 P1-6 temp-deploy 残留容器

`temp-deploy`（mysql:8.0 镜像，2026-07-20 启动，运行 6 周）为部署残留，应确认无用后 `docker rm -f temp-deploy`，避免多余 mysql 实例暴露面。

### 🟡 P2（计划处理，不阻塞）

| # | 问题 | 说明 |
|---|---|---|
| P2-1 | 12 个死权限码 | 见 §3.4，下版本迁移清理 |
| P2-2 | DEPLOYMENT_BLOCKERS.md 过时表述 | cpus/CORS/nginx 三处，建议归档该文档并指向本报告 |
| P2-3 | survey 绕过全局限流 | 上轮 §三-6，可选加固 |
| P2-4 | login 版本号暴露 / captcha v-html | 均低危（内容后端生成） |
| P2-5 | schema_migrations 结构漂移 | init-complete.sql 警告头已缓解 |
| P2-6 | 生产迁移器无事务 | migrate.js 幂等 + fail-fast 缓解，已接受 |
| P2-7 | backend/.env.production.local 残留 | 本地开发产物（未跟踪），可删除 |
| P2-8 | 424 客户无归属且全 lead | 业务流转未启动，推动业务录入 |

---

## 六、上线/发版前必做动作清单（含修复执行状态）

- [x] **P0** 提交并推送全部工作区变更 ✅ 2026-08-31 完成（5 个提交，见 §九）
- [x] **P0** 修复备份调度 ✅ 2026-08-31 完成（container-backup.sh 三合一调度器，--once 双轮验证通过）
- [x] **P1** nginx reload 并复验 HSTS ✅ 2026-08-31 完成（另补 XFO 去重，见 §九 勘误）
- [x] **P1** NAS 密码轮换 ✅ 2026-08-31 用户决策：内网小规模使用场景，接受现状风险，不轮换、不脱敏（旧密码明文保留于 audit-report-2026-08-18.md 的 git 历史）
- [x] **P1** 确认 04:00 MySQL 备份的调度归属 ✅ 已查明：宿主机 `/etc/cron.d/crm-backup` → `/usr/local/bin/crm-backup.sh`（root 属主），保留为 MySQL 双保险
- [x] **P1** temp-deploy 容器处置 ✅ 2026-08-31 已停止（Exited 0，restart=no）；数据卷 `huakey-crm-deploy_*` 用户决策保留（历史数据保险）
- [ ] **P1** 13 个休眠账号在职确认/禁用 ⏳ 清单已交用户逐个确认（见 §3.1）
- [x] **P2** NAS 上 `.env.secrets` 权限 600 复核 ✅ 已验证（`-rw------- syadmin users`）
- [ ] **P2** 推动客户归属分配与业务数据录入 ⏳ 待业务（商机→报价→合同链路）

---

## 七、验证命令速查

```bash
# 回归
cd backend  && npm run lint && npm test
cd frontend && npm run build && npm test
node backend/scripts/scan_routes.js

# 依赖（官方源）
cd backend  && npm audit --registry https://registry.npmjs.org
cd frontend && npm audit --registry https://registry.npmjs.org

# 生产核验（NAS）
ssh nas-crm "docker ps --format '{{.Names}} | {{.Status}}'"
ssh nas-crm "curl -skI https://localhost:8443/ | head -14"     # 应含 strict-transport-security
ssh nas-crm "ls -lt /volume1/docker/crm-stack/database/backups/ | head"
```

---

## 八、审计过程文件说明

本轮审计在生产库执行的查询均为只读 SELECT/SHOW（经 stdin 管道传入容器 mysql，密码全程走容器环境变量，未落命令行）；本地审计辅助文件位于 `backend/tmp/crm_audit_*.sql|sh`（gitignored，审计后清理）。

---

## 九、修复执行记录（2026-08-31）

审计完成后当日执行的修复，全部已在生产环境验证：

### 9.1 P0-2 备份调度修复

| 项 | 内容 |
|---|---|
| 根因 | backup 服务基于 mysql:8.0 镜像执行 `crond -f`，镜像内无 crond 命令 → 容器自部署起无限崩溃（exit 127），uploads/config/证书备份从未执行 |
| 04:00 MySQL 备份归属（已查明） | 宿主机 `/etc/cron.d/crm-backup` → `/usr/local/bin/crm-backup.sh`（root 属主，2026-07-20 创建），独立于崩溃容器持续运行 |
| 修复 | 新增 [deploy/backup/container-backup.sh](../deploy/backup/container-backup.sh)：纯 shell 定点等待循环（无 crond 依赖），每日 02:00 MySQL（复用 database/backup.sh）/ 02:30 uploads / 02:45 配置+证书；重写 compose backup 服务挂载（uploads volume + 关键配置文件只读挂载 + localtime） |
| 验证 | 两轮 `--once` 手动执行：MySQL dump 617KB、uploads 归档（4 文件）、config 归档（8 文件，含 .env.secrets + 4 证书 + nginx.conf + compose）全部生成；config 目录 700/归档 600、全部 MySQL dump 收紧 600；容器稳定 Up、调度器等待 02:00；宿主机 04:00 任务保留为双保险 |
| 限制说明 | DSM 层 nginx 反代配置（/usr/local/etc/nginx/conf.d/）在容器可见范围外，不在自动备份内（该文件可按 docs/crm-v1-internal-domain-deployment.md 重建） |

### 9.2 P0-1 提交与推送

| 提交 | 内容 |
|---|---|
| `36c525b` fix(security) | SQL 注入修复 + 4 个回归用例 + logout HS256 + csrf 豁免 |
| `50d30f3` fix(rbac) | 权限码/角色码对齐（17 文件） |
| `3b66f70` fix(backup) | backup 服务重写 + container-backup.sh |
| `3caeab4` fix(deploy) | nginx XFO 去重 + Dockerfile 竞态 + CORS 模板 + sync-prod.bat |
| `a6950b0` docs | 两份审计报告 |

已推送 `origin/fix/v1.0.1-security-patch`（bb651a6..a6950b0，共 11 个提交）。

### 9.3 P1-3 勘误与加固

- **勘误**：审计时判定"nginx 未加载新配置（无 HSTS）"系**误判**——验证时 `head -14` 截断了响应头（nginx 的 add_header 追加在 28 行头部列表的第 21 行），HSTS 实际自 nginx 容器启动起已生效。
- **本轮已完成**：`nginx -t` + `nginx -s reload` 复核；发现 X-Frame-Options 重复（helmet SAMEORIGIN 在前削弱 nginx DENY），补 `proxy_hide_header X-Frame-Options` 后 XFO 唯一为 DENY。
- **端到端验证**：`curl --resolve crm.huakey.local:443:127.0.0.1` 走完整链路（DSM 443 → 容器 8443 → app:5000），health 正常（v1.5.1，db/redis ok），HSTS 贯穿生效。注：NAS 本机不解析 crm.huakey.local（DSM DNS 不回环应答），本机测试需用 --resolve 或 localhost:8443。

### 9.4 其他完成项

- **temp-deploy**：已 `docker stop`（Exited 0，restart=no 不复活）；数据卷 `huakey-crm-deploy_mysql-data` 保留（旧部署布局的历史数据库，是否删除待人工确认）
- **.env.secrets 权限**：验证为 `-rw------- syadmin users`（600）✅
- **compose 旧版备份**：NAS 上 `docker-compose.synology.yml.bak.20260831`（修改前快照）

---

*本报告基于 2026-08-31 对 `fix/v1.0.1-security-patch` 工作区、生产容器与生产库（只读）的实测结果；§九 修复记录为同日执行并验证。上轮报告：[crm-v1.0.1-final-pre-launch-audit.md](./crm-v1.0.1-final-pre-launch-audit.md)。*

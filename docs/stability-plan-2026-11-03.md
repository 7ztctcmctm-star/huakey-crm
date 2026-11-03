# HUAKEYCRM 稳定性与可持续运维方案

> 编制日期：2026-11-03
> 调研方式：只读调研（本地仓库 + NAS 生产只读查询 + 本地隔离测试库实测），未修改任何代码/配置/数据，未动生产容器
> 目标：终结"今天出问题、明天出问题、后天也出问题"的循环
> **2026-11-03 更新**：业务方已整批批复（19 条决策，见 `docs/decisions-2026-11-03.md`），§4 已按决策收敛为「状态标注版」；本轮只产出文档与规则，未执行任何系统变更

---

## 0. 一句话结论

当前最可能让系统反复出问题的三件事：

1. **告警通道整体关闭（ALERT_ENABLED=false 且无任何通知渠道）**——所有故障靠用户报障才发现，监控方案 v2 是纸面文档，NAS 上一行脚本都没落地；
2. **发布纪律已被打破**——今天（11-03）15:18 的生产部署绕过了 deploy.sh（只重建了 app 容器、无部署前数据库快照），而近 20 天已部署 8 次，高频发布 × 无门禁纪律 = 每次都是赌博；
3. **E2E 回归门失效（50 用例 34 失败）**——根因是迁移 127 禁用 demo_admin 后 seed 的 INSERT IGNORE 不恢复账号，导致本地 E2E 全线失败，发布前"跑一遍 E2E"这道防线名存实亡。

三件事的共同本质：**工具和脚本大多已经有了（deploy.sh、alert.js、sys_cron_log、restore-test.sh、offsite-sync.sh），缺的是"接通、落地、坚持走流程"**。因此本方案不引入任何新平台，全部在单机 NAS 上用现有材料闭环。

---

## 1. 现状评估表

| 维度 | 现状 | 风险等级 | 证据 |
|---|---|---|---|
| 可用性 | 近 28h 容器 nginx：3401×200 / 8×400 / 5×401 / **2×502**；容器 RestartCount 全 0 | 🟢 低 | NAS 实测 `docker logs huakey-nginx`（11-03 15:56） |
| 故障历史 | 近 30 天 2 次用户可感知故障：10-23 登录五连修（限流共享桶 P0/验证码缓存死循环等）；11-03 验证码登录故障（根因用户侧 http:// 访问，服务端正常） | 🟡 中 | git log `2b00eea`/`eb34a40`/`e2e2ded`；11-03 排查记录（topics） |
| 日志留存 | **历史 5xx 不可追溯**：容器重建即清零（当前日志窗口仅 28h）+ 10m×3 轮转 | 🔴 高 | app 日志最早一条 = 2026-11-03T07:18Z（容器启动时刻） |
| 发布流程 | deploy.sh 12 步较完善（快照→回滚点→健康探针→P0-5 迁移校验→冒烟），但**今日部署绕过全流程**：仅 app 重建（15:18），无 predeploy-20261103 快照 | 🔴 高 | mysql/redis/nginx/backup 均 Up 28h，predeploy 全清单止于 20261102 |
| 部署频率 | 近 20 天 8 次生产部署（10-15、10-19×2、10-22、10-23、11-02、11-03） | 🟡 中 | predeploy 快照时间戳 + 镜像构建时间（crm-stack-app:latest 2026-11-03 13:49） |
| 回滚能力 | 镜像 :prev 自动回切已实现；但**回滚从未演练过**，数据库回滚依赖人工用快照恢复；今日部署连快照都没有 | 🔴 高 | deploy.sh `rollback_and_exit`；镜像 `crm-stack-app:prev` 存在（2026-11-02 11:38） |
| 回归守护-单测 | 后端 209 套件/1957 用例全绿（本日干净轮实测 73.6s）；前端 34 文件/222 用例全绿（本日实测 126.7s） | 🟢 低 | 本地实测（2026-11-03 16:01/16:07） |
| 回归守护-E2E | **50 用例 34 失败**；login.spec 实测 1 failed/4 passed（正向登录失败） | 🔴 高 | 本地实测；根因见 §3.2 |
| CI 门禁 | backend/frontend/build/codeql/integration/migration-roundtrip 全 PR 触发；e2e 仅 push main；cross-browser 每周一 | 🟢 低 | `.github/workflows/ci.yml` |
| 监控告警 | **零落地**：monitoring/ 目录不存在、/etc/cron.d 无 CRM 条目、ALERT_ENABLED=false、无 WECHAT/SMTP 通道 → app 内置 500 阈值告警与关键 cron 告警全部静默丢弃 | 🔴 高 | NAS 实测：`ls monitoring` No such file；env 键检查全空 |
| 定时任务 | 8 个 node-cron 任务近 7 天全绿（reminder-generation 每日 08:30 成功） | 🟢 低 | 生产库 `sys_cron_log` 只读查询（2026-11-03） |
| 备份 | 02:00 MySQL（gpg 加密）/02:30 uploads/02:45 config，今日产物齐全；62 份 dump 保留 30 天 | 🟢 低 | NAS 实测 `huakey_crm_20261103_020000.sql.gz.gpg` 等 |
| 恢复演练 | 月度自动执行，2026-11-01 03:08 PASS（109/109 表，506s） | 🟢 低 | `restore-drill.status`：RESULT=PASS |
| 恢复能力 | RPO=24h（无增量）；RTO≈30min（演练导入 8.4min + 容器重建 + 人工确认）；**异地副本未落地**（offsite-sync.sh 在仓库、无 log 无 cron） | 🟡 中 | 演练 DURATION=506s；NAS 无 offsite-sync.log |
| 数据一致性 | **71 条未关闭提醒指向已软删客户**；425/425 活跃客户 owner_id IS NULL（全在公海，需业务确认）；0 孤儿联系人、迁移无漂移（129 文件=129 行）、demo 数据未混入生产 | 🟡 中 | 生产库只读查询 C1–C8（见 §5） |
| 明文敏感残留 | predeploy-20261102-113549.sql 明文 4.2MB（600 权限）未加密归档 | 🟡 中 | NAS predeploy 全清单 |
| 容量性能 | 库 <15MB、最大表 sys_log_archive 5.6MB、Slow_queries=1/28h、磁盘 1%（11T 用 102G）、证书 2036-10-19 到期 | 🟢 低 | 生产库 information_schema / SHOW GLOBAL STATUS / df |

**结论**：这个系统的"底子"（测试、备份、恢复演练、定时任务日志）在同类小团队里是好的；反复出问题的根源不在技术栈，而在**告警断线、发布绕行、E2E 门失效**三个流程性缺口。

---

## 2. 故障与发布史复盘（近 30 天）

| 日期 | 事件 | 后果 | 归因 |
|---|---|---|---|
| 10-15 ~ 10-23 | 6 次部署（P0 权限/循环依赖/事务幂等/时区/浮点金额等大批修复） | 10-23 出现登录五连故障 | 高频修复批次上线，其中 express-rate-limit v8 升级不兼容导致**全员无法登录**（限流共享桶） |
| 10-23 | 登录故障五连修 | 恢复 | `2b00eea`/`eb34a40`/`e2e2ded`：限流 ipKeyGenerator 签名、验证码缓存、SVG sanitize、sameSite |
| 11-02 | 审计整改批次部署（迁移 125–131、密钥轮换） | 正常 | 走 deploy.sh 全流程，有快照（predeploy-20261102） |
| 11-03 上午 | 用户报"验证码登录失败" | 排查半日 | 服务端全链正常，根因用户侧 http:// 访问（生产仅 443 反代）。**耗费的排查成本正是"无监控、无访问日志留存"的直接代价** |
| 11-03 15:18 | P2-2 软删除修复部署 | 待观察 | **绕过 deploy.sh**：无快照、无冒烟记录、仅 app 容器重建 |

规律：出问题 → 修一批 → 高频部署 → 又出新问题。打破循环的关键是给"部署"这个动作加上不可绕过的门，并让故障在用户之前被发现。

---

## 3. 三根柱子方案

### 柱子一：发布流程——把 deploy.sh 从"可选"变成"唯一入口"

**3.1 前置门禁（每次部署前，本地跑，约 10 分钟）**

```
发布检查单（按序执行，任一红即停）：
  1. cd backend  && npm test            # 209 套件全绿（实测 ~75s）
  2. cd frontend && npm test            # 222 用例全绿（实测 ~127s）
  3. cd frontend && npx playwright test --project=chromium   # E2E 全绿（修复后，见柱子二）
  4. git status 干净、已 push；新迁移必须有对应 _down.sql
  5. 部署时间窗：工作日 10:00–17:00（有人在场），禁止下班后/周五部署
```

**3.2 部署执行：只能走 deploy.sh**

- 今日教训固化为规则：**禁止 `docker compose up -d --build` 直连生产**。deploy.sh 的快照（4a）、回滚点（4b）、迁移硬门禁（8/9）、冒烟（12）缺一不可。
- 补漏：`predeploy-*.sql` 快照产出后立即走 02:00 链同款 gpg 加密（复用 `.backup-enc-pass`），消除明文快照窗口；现存的 predeploy-20261102（4.2MB 明文）按 11-03 处置流程加密归档。
- 已知"假绿/静默"点（deploy.sh 内已注释承认，列为观察项，暂不改动代码）：
  - `[4/12] down` 带 `|| true`（权限失败静默无动作）；
  - 冒烟退出码 4（环境限制）放行——合理，但要求日志里必须出现"人工确认"字样；
  - P0-5 日志关键字检查刚修过三格式兼容（`7ea1ac1`），新迁移器再改输出格式时会再断——回滚门禁测试 `630f45f` 已固化文案耦合，改迁移器输出必须同步改。

**3.3 部署后观察窗（替代"灰度"——单机没有灰度可言）**

- 部署后 30 分钟内，人工执行三条命令并截图留档：
  ```
  curl -sk https://localhost:8443/api/v1/health        # status=ok, db=true, redis=true
  docker logs huakey-nginx --since 30m 2>&1 | awk '{print $9}' | sort | uniq -c   # 无 5xx
  docker logs huakey-app --since 30m 2>&1 | grep -ci error                        # 无激增
  ```
- 观察窗内 5xx > 0 或冒烟失败 → 立即 `rollback_and_exit` 等价操作：`docker tag crm-stack-app:prev crm-stack-app:latest && docker compose -f docker-compose.synology.yml up -d --no-build`，然后用 predeploy 快照恢复库。

**3.4 回滚演练（季度一次，需停机窗口 ~30min）**

- 内容：取当前 :prev 镜像 + 最近一份 predeploy 快照，在**备用端口**完整走一遍"回切镜像 → 恢复库 → 冒烟"，验证 deploy.sh 里那段"镜像回滚不会回滚数据库"的人工提示真的可执行。
- 迁移不可逆的处理原则：predeploy 快照是唯一数据库回滚点（所以 3.2 的"必须走 deploy.sh"是铁律）；新迁移必须附 `_down.sql` 且经过 CI migration-roundtrip 套件（已有，勿删）。

### 柱子二：回归守护——修好 E2E，让门重新关上

**3.5 E2E 根因（已实证）**

- 迁移 127（2026-10-26）将 demo_admin 置 `status=0`（本地 dev 库实测：demo_admin status=0，demo_sales/demo_purchase status=1）；
- 本地 E2E 自举走**克隆模式**（`start-e2e-server.mjs`：DROP huakey_crm_test → 从源库 huakey_crm 克隆 → 跑迁移 → seed）；
- `demo_users.sql` 用 `INSERT IGNORE`：账号已存在即跳过，**不会恢复 status=1** → 正向登录必失败 → 依赖登录的 34 个用例全挂；
- CI 路径不受影响（init-complete.sql 无 sys_user 数据、迁移只标记不执行、seed 插入 status=1）——这解释了"CI 绿、本地红"的分裂。

**3.6 修复方向：二选一——2026-11-03 已批复选定方案 A（决策 D-09）**

| 方案 | 内容 | 理由 |
|---|---|---|
| **A（推荐）：seed 恢复测试账号** | `backend/scripts/seed-demo.js` 在非生产环境执行完 seeds 后追加一步：`UPDATE sys_user SET status=1 WHERE is_demo=1 AND status=0`（幂等） | ① 改动一处脚本，CI/本地同构；② E2E 全链（login/quotation/customer/approval/navigation + `.env.test` 的 E2E_* 变量）已绑定 demo 账号体系，换账号体系要动所有 spec 与 env 模板；③ 安全边界已有：seed:demo 自带 NODE_ENV=production 硬阻断 + 库名 prod 检查，且生产库实测 demo 数据为 0（C6 查询），"重新启用"不可能波及生产 |
| B：测试环境独立账号 | 新建 e2e_admin 专用账号 + 权限初始化 + 改全部 spec | 成本高（≈2 天）且引入第二套账号真源；唯一收益是"演示账号与测试账号分离"，对单人运维的内部 CRM 是过度设计 |

修复后验收：本地 `npx playwright test --project=chromium` 50/50 绿；push main 后 CI e2e-test 绿。

**3.7 门禁固化**

- E2E 恢复绿后，把它纳入 §3.1 发布检查单第 3 步（现在形同虚设的步骤变成真门）。
- 冒烟脚本（deploy.sh [12/12]）已覆盖"健康+登录+业务接口+前端"，保持现状，不做第二个冒烟真源。
- 每周一 CI cross-browser 定时任务保持开启（本机不可信，多浏览器结论以 CI 为准——项目既有约定）。

### 柱子三：监控告警——最小可用清单（每项 5 分钟内可人工验证）

现状：`docs/crm-v1-monitoring-plan-v2.md` 是纸面方案，NAS 上 `monitoring/` 目录不存在；app 内置告警（alert.js：500 阈值 + 关键 cron 失败）因 `ALERT_ENABLED=false` 且无通道而**静默丢弃**。

**第一步（W1，P0）：接通告警通道，二选一**
- 推荐：企业微信群机器人——在 `.env.secrets` 加 `WECHAT_WEBHOOK_URL=https://qyapi.weixin.qq.com/...`，`.env` 改 `ALERT_ENABLED=true`。app 重启后 alert.js 的 500 阈值（10 次/5min）与关键 cron 失败告警立即生效，零新增组件。
- 备选：DSM 控制面板 → 通知设置（邮件/手机推送），脚本里用 `synonotify`。

**第二步（W2）：落地巡检脚本**（放 `deploy/monitoring/`，NAS 同步到 `/volume1/docker/crm-stack/monitoring/`，DSM 任务计划以 root 运行——与监控方案 v2 的部署方式一致，但只做下表 8 项）

| # | 指标 | 阈值 | 检测方式（具体命令） | 通知渠道 | 部署位置/频率 |
|---|---|---|---|---|---|
| 1 | 服务可用性 | health 非 200 / db≠true / redis≠true，连续 2 次 | `curl -sk https://127.0.0.1:8443/api/v1/health \| grep -o '"status":"ok"'` | 企微 webhook + DSM | DSM 任务计划，每 5 分钟 |
| 2 | HTTP 5xx | >10 条/5min | `docker logs huakey-nginx --since 5m 2>&1 \| grep -cE '" 5[0-9][0-9]'` | 同上 | 同上（与 #1 合并脚本） |
| 3 | 容器状态 | 任一非 running 或 RestartCount>0 | `docker inspect --format '{{.State.Status}} {{.RestartCount}}' huakey-app huakey-mysql huakey-redis huakey-nginx huakey-backup` | 同上 | 同上 |
| 4 | 备份成功 | 当日三产物缺失 或 container-backup.log 出现 FATAL | `ls database/backups/huakey_crm_$(date +%Y%m%d)_0200*` + `grep -c FATAL container-backup.log（当日段）` + uploads/config 目录当日文件 | 同上 | 每日 08:00 |
| 5 | 磁盘 | /volume1 >85% 警告、>95% 严重 | `df /volume1 \| awk 'NR==2{gsub("%","");print $5}'` | 同上 | 每日 08:00（与 #4 合并） |
| 6 | 定时任务 | sys_cron_log 近 24h 有 failed，或 8 个 job 任一无当日记录 | `SELECT job_name,status FROM sys_cron_log WHERE start_time >= NOW()-INTERVAL 24 HOUR`（经 docker exec 只读） | 同上 | 每日 09:00 |
| 7 | 恢复演练 | restore-drill.status 非 RESULT=PASS 或 LAST_RUN 非当月 | `cat database/backups/restore-drill.status` | 同上 | 每月 2 日 |
| 8 | 证书到期 | 剩余 <30 天 | `openssl x509 -checkend 2592000 -noout -in nginx/certs/server.crt` | 同上 | 每周一（当前 2036 年到期，防遗忘） |

- 巡检脚本统一 `set -u`、输出追加到 `/volume1/docker/crm-stack/database/backups/monitoring.log`（7 天轮转），失败才发通知（避免告警疲劳）。
- 日志留存补丁（同周做）：巡检脚本每日把 nginx 状态码分布 append 到 `status-codes-YYYYMM.log`（保留 90 天），终结"容器一重建历史就清零"——下次排查"用户说登录不了"时，先看这份文件而不是猜。

---

## 4. 30 天落地清单（收敛版 · 2026-11-03 业务批复后）

> 收敛依据：`docs/decisions-2026-11-03.md`（共 19 条决策）。状态口径：**已授权**＝业务方批准、可直接排执行；**待执行**＝已授权或方向已定、尚未执行；**暂缓**＝风险已接受，本轮不执行。**本轮只产出文档与规则，未执行任何变更；执行由后续逐项任务进行，完成后回填决策登记表。**

### 4.1 状态收敛清单

| 任务 | 优先级 | 状态（依据决策） | 工作量 | 验收标准 | 停机窗口 |
|---|---|---|---|---|---|
| E2E 修复方案 A（seed 恢复被迁移 127 禁用的 demo 账号，本地与 CI 同构） | **P0** | **已授权 · 待执行**（D-09） | 0.5d | 本地 chromium 50/50 绿；CI e2e-test 绿；生产 demo 数据仍为 0 | 无 |
| 部署铁律落地：`docs/deploy-checklist.md` + 补做 11-03 缺失的 predeploy 快照 | **P0** | **已授权**（D-08 三铁律，已写入 AGENTS.md 第十五章） | 1h | 检查单入仓；NAS 出现 20261103 加密快照；此后每次部署留档 | 无（mysqldump 只读导出） |
| 接通告警通道（企业微信 webhook + ALERT_ENABLED=true，复用 app 内置 alert.js） | **P0** | **已授权 · 待执行**（D-01） | 0.5h | 测试环境触发 500×10，5 分钟内收到企微消息 | 需 app 一次重启（秒级），可并入下次上线窗口 |
| 处置 71 条 stale reminders（**批量关闭并留痕，不重开**） | **P1** | **已授权 · 待执行**（D-02） | 0.5d | 复查 C4 = 0；sys_log 有批量操作审计记录 | 无 |
| NAS 11 个未跟踪文件：加密归档后清理（**tzfix 含库结构 dump 必须先归档**） | **P1** | **已授权 · 待执行**（D-04） | 0.5d | `git status --short` 归零；归档解密回验 md5 一致后 shred | 无 |
| predeploy-20261102 明文快照加密归档 | **P1** | **已授权 · 到期执行**（D-05：**保留 7 天，到期日 2026-11-09**） | 0.5h | 到期后 NAS 无明文 predeploy-*.sql；归档解密回验通过 | 无 |
| monitoring 8 项巡检脚本（健康/5xx/容器/磁盘/备份/定时任务/演练/证书） | **P1** | 待执行（方向已定，未单独批复） | 1.5d | 演练：停 nginx 容器 5 分钟内收到告警后恢复 | 演练需 ~5 分钟不可用 |
| 状态码日志留存（status-codes-YYYYMM.log） | **P1** | 待执行 | 0.5d | 连续 3 天有可解析记录 | 无 |
| root / Redis 口令轮换 | **P1** | **已批准 · 排期**（D-06：约 10 分钟停机，**并入下次上线窗口**） | 10min | 轮换后 health 全绿；旧口令失效；次日 02:00 备份链正常 | **~10 分钟** |
| consistency-check.sh 每周巡检（固化 §5 SQL） | **P2** | 待执行 | 0.5d | 首跑输出基线报告 | 无 |
| 回滚演练（:prev 镜像 + 快照恢复，备用端口） | **P2** | 待执行 | 0.5d | 演练记录 + 冒烟通过 | 无（隔离环境） |
| 异地备份落地 | 原 P1 | **暂缓 · 风险已接受**（D-07：无第二台设备/对象存储） | —— | 不执行；出现可用设备后重新评估 | —— |
| 休眠账号治理（13 个） | 原 P3 | **暂缓 · 风险已接受**（D-03：guozewen 在职，其余保留） | —— | 仅监控异常登录，不禁用 | —— |
| 客户全公海业务确认 | —— | **已关闭**（D-11：生产 423 条 lead 是资源不是待分配客户，无需派发） | —— | 无动作；巡检 C3 据此不视为错误 | —— |

### 4.2 第一周可立即执行的三件事（零停机 · 可独立验收）

1. **E2E 修复方案 A（D-09）**——`backend/scripts/seed-demo.js` 在 seeds 流程末尾追加"恢复 is_demo=1 被禁用账号"（仅非生产环境生效）。验收：本地 `npx playwright test --project=chromium` 50/50 绿。生产零影响。
2. **NAS 11 个未跟踪文件加密归档后清理（D-04）**——按 11-03 既有处置流程批量归档（tzfix 含库结构 dump，必须先归档），解密回验 md5 一致后 shred。验收：`git status --short` 归零。生产零影响。
3. **部署铁律落文档 + 补做 11-03 缺失快照（D-08 落地动作）**——新建 `docs/deploy-checklist.md`（固化 §3.1 检查单 + 发布三铁律 + 30 分钟观察窗三条命令）；在 NAS 用只读 mysqldump 补做一份 20261103 加密快照。验收：检查单入仓、NAS 备份目录出现当日加密快照。生产零影响（只读导出）。

> 告警通道接通（D-01）需一次秒级 app 重启：若严格零停机，则与 D-06 口令轮换一并并入下次上线窗口执行。

每周节奏：周一看 cross-browser CI 结果 + 证书/演练状态（#7/#8），每天 08:00 后扫一眼告警群——除此之外**不需要每日人肉巡检**，这就是"可持续"的边界。

### 4.3 合并到 main 的执行方案（D-12，已排期待执行；本轮只登记方案，不执行合并）

> 现状（2026-11-03 实测）：全部改动（9 个提交、470 文件，+15679/−2232）挂在 `fix/audit-remediation-2026-10-26`，从未合并 main，生产亦从该分支构建；CI 的 `e2e-test` 仅 push main 触发，因此该分支上的 E2E 门从未生效。铁律已固化至 AGENTS.md 15.4。

**① 前置条件（全部满足才可发起 MR）**
- 第一周（S1）三件事验收通过：E2E 修复方案 A（D-09，本地 50/50 已达成）、NAS 残留归档清理（D-04，已达成）、补做 11-03 快照（D-08 落地动作，已达成）
- 工作区干净：`git status` 无未提交改动；**另一任务负责的 `docs/assignment-*.md`、`docs/ux-review-*.md`、`.agents/` 不得混入本次 MR**
- 远端同步：`git fetch` 后双向核对（本地无未 push 提交、main 无新分叉）

**② 合并方式**
- 走 **GitHub MR/PR**（`fix/audit-remediation-2026-10-26` → `main`），**禁止本地 merge 后直接 push main**
- MR 范围 = origin/main..HEAD（当前 9 个提交）；当前 main 无分叉，理论 fast-forward、零冲突

**③ 合并前必做（本地全量，任一红即停）**
- 后端 `npm test`：209 套件 / 1957 用例全绿
- 前端 `npm test`：222 用例全绿
- 双端 lint：0 errors
- E2E `npx playwright test --project=chromium`：50/50 全绿（先清 `frontend/test-results/`）

**④ 合并后必做**
- 确认 CI 在 main 上**实跑** e2e-test（chromium）与 backend/frontend 全套并转绿——这是 E2E 门首次对该改动批次真正把关
- main 合并后 HEAD SHA 留档（并入部署留档三件套）
- 生产下次部署起**从 main 构建**（部署仍只走 deploy.sh，15.1 铁律不变）

**⑤ 冲突风险与处理**
- 当前零分叉（HEAD..origin/main = 0），**现在合并零冲突**
- 窗口期风险：若 main 先合入其他分支（如 assignment / ux-review 系列），共改文件（`AGENTS.md`、`docs/stability-plan-*`、`docs/decisions-*` 等）可能冲突 → 处理：仅 docs 范围的手工解决后**重跑本地全量**再合并；冲突波及代码文件即停下逐文件复核，不批量接受任一侧
- 470 文件大 MR 的审阅以提交清单 + 决策/方案文档为索引，不逐行人审（每个提交已各自通过本地门禁）

**⑥ 回滚方式**
- 未部署即发现问题：main 上 `git revert`（合并提交用 `-m 1`）并 push；生产未从新 main 构建前无需动生产
- 已部署且观察窗/冒烟失败：走 §3.3 既有回滚（`docker tag crm-stack-app:prev ...` + predeploy 快照恢复库），main 侧同步 revert
- 注意：**代码 revert 不回退数据库迁移**——涉及迁移的回滚先执行 `_down.sql`（或快照恢复）再回代码

**⑦ 后续约定（固化）**
- 一律「**从 main 拉分支 → 验收 → MR 合并回 main**」；**禁止从长期未合并分支直接部署生产，生产只从 main 构建**（AGENTS.md 15.4）

---

## 5. 数据一致性巡检（SQL/判据，供 consistency-check.sh 固化）

以下 8 条判据已在生产只读实测（2026-11-03），前 6 条当前全绿，C4/C3 需处置：

```sql
-- C1 孤儿联系人（期望 0；>0 说明客户被物理删除过）
SELECT COUNT(*) FROM crm_contact t LEFT JOIN crm_customer c ON t.customer_id=c.id
WHERE c.id IS NULL;                                          -- 实测 0 ✓

-- C2 软删客户仍被活跃业务引用（期望 0；>0 说明删除时未做占用检查）
SELECT (SELECT COUNT(*) FROM crm_quote q JOIN crm_customer c ON q.customer_id=c.id
         WHERE c.deleted_at IS NOT NULL AND q.deleted_at IS NULL) AS q_cnt,
       (SELECT COUNT(*) FROM crm_contract k JOIN crm_customer c ON k.customer_id=c.id
         WHERE c.deleted_at IS NOT NULL AND k.deleted_at IS NULL) AS k_cnt;   -- 实测 0/0 ✓

-- C3 公海判据一致性（owner_id IS NULL 即公海）
SELECT owner_id IS NULL AS in_pool, COUNT(*) FROM crm_customer
WHERE deleted_at IS NULL GROUP BY in_pool;                   -- 实测 425 全在公海 → 2026-11-03 业务确认属正常（资源库，D-11/B-01）

-- C4 未关闭提醒指向已删/不存在客户（期望 0）
SELECT COUNT(*) FROM crm_follow_up_reminder r LEFT JOIN crm_customer c ON r.customer_id=c.id
WHERE r.is_dismissed=0 AND (c.id IS NULL OR c.deleted_at IS NOT NULL);  -- 实测 71 ⚠ 处置已授权（D-02：批量关闭留痕，不重开）

-- C5 客户负责人指向已删/禁用用户（期望 0；销售离职未转移会命中）
SELECT COUNT(*) FROM crm_customer cu LEFT JOIN sys_user u ON cu.owner_id=u.id
WHERE cu.deleted_at IS NULL AND cu.owner_id IS NOT NULL
  AND (u.id IS NULL OR u.deleted_at IS NOT NULL OR u.status=0);   -- 实测 0 ✓

-- C6 demo 数据混入生产（期望 0）
SELECT (SELECT COUNT(*) FROM sys_user WHERE is_demo=1),
       (SELECT COUNT(*) FROM crm_customer WHERE is_demo=1);   -- 实测 0/0 ✓

-- C7 审计日志膨胀（sys_log 90 天清理 cron 正常则缓慢增长）
SELECT COUNT(*) FROM sys_log; SELECT COUNT(*) FROM sys_log_archive;  -- 实测 1339 / 13090 ✓

-- C8 迁移漂移（文件数 = schema_migrations 行数）
--   本地: ls database/migrations/[0-9][0-9][0-9]_*.sql（排除 _down）计数
--   生产: SELECT COUNT(*), MAX(version) FROM schema_migrations;      -- 实测 129=129, max=131 ✓
```

巡检脚本判据：C1/C2/C5/C6 > 0 或 C8 不等 → 立即告警；C4 > 上次基线 → 告警（存量 71 条按 D-02 处置后归零）；C3 已按业务口径（D-11）**不视为错误**，仅作趋势记录。

---

## 6. 明确不做什么（避免过度工程）

| 不做的事 | 理由（成本 vs 收益） |
|---|---|
| Prometheus + Grafana + Alertmanager | 成本：3 个常驻容器 + 学习维护；收益：本方案 8 个指标 shell 一把抓完。单机 NAS、8 项指标，监控平台是杀鸡用牛刀 |
| K8s / 多实例 / 数据库主从 | 成本：架构复杂度数量级上升；收益：当前 28h 内 2 个 502、库 15MB，可用性瓶颈根本不在这里 |
| binlog 增量备份（RPO<24h） | 成本：binlog 管理 + 恢复复杂度；收益：日写入 sys_log 十几条、业务表近空，24h RPO 业务可容忍。等日活跃数据量上两个数量级再评估 |
| 异地备份（rsync 到第二台设备） | 2026-11-03 批复**暂缓**（D-07）：无第二台设备/对象存储，业务方接受 NAS 单点风险；出现可用设备后重新评估 |
| APM / Sentry | 成本：新组件 + 采样配置；收益：docker logs + 5xx 计数 + traceId（app 已有）覆盖当前错误量（28h 内 3 条 error） |
| 性能调优 / 索引专项 | 实测 Slow_queries=1（28h），无调优对象 |
| 自建发布平台 / CI/CD 到 NAS | deploy.sh + GitHub CI 已覆盖；缺的是纪律不是工具（见 §3.2）。NAS 不暴露公网 SSH 给 CI 是安全收益 |
| 把监控方案 v2 全量落地（企业微信卡片、周报月报自动化） | 只取 8 项最小集；其余等第一个"漏报的真实故障"证明需要时再加 |

---

## 7. 附：本方案调研过程的关键实测证据索引

| 证据 | 来源 |
|---|---|
| demo_admin 在 dev 库 status=0（E2E 根因） | 本地库只读查询（2026-11-03） |
| login.spec 1 failed / 4 passed | 本地 E2E 实测（16:01，克隆自举链路） |
| 后端 209/1957 全绿、前端 222 全绿 | 本地实测（16:07 / 16:01） |
| 今日部署无快照、仅 app 重建 | NAS `docker inspect` StartedAt + predeploy 全清单 |
| 告警全关（ALERT_ENABLED=false、无通道） | NAS .env/.env.secrets 键检查（只看键名） |
| 2×502 / 28h 日志窗口 | NAS `docker logs huakey-nginx` |
| sys_cron_log 8 任务 7 天全绿 | 生产库只读查询 |
| 备份三产物今日齐全、演练 PASS 506s | NAS ls + restore-drill.status |
| 71 stale reminders、425 客户全公海 | 生产库只读查询（§5） |
| 8 次部署时间线 | predeploy 快照 + `docker images` 构建时间 + git log |

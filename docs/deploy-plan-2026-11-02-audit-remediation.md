# 审计整改批次（82e1939 + 7374218）生产部署方案

> 编制日期：2026-11-02
> 部署内容：分支 `fix/audit-remediation-2026-10-26`（远端已推送，含 82e1939 审计整改批次与 7374218 lint 修复）
> 生产现状（2026-11-02 实测）：镜像 `crm-stack-app:899b804a1c77`（2026-10-23 14:15 构建，≈2b00eea）；
> 生产库 `schema_migrations` 停在 **124**。本批次将把生产从 124 推进到 131。
> 依据文件（全部实际读取）：`database/migrations/125~131*.sql` 及各 `_down.sql`、
> `deploy/deploy.sh`、`deploy/smoke-test.sh`、`Dockerfile.synology`、`database/migrations/run_migrations.js`、
> `docs/fix-ledger-2026-10-23.md`。

---

## 一、核心判断

1. **迁移 125–131 全部幂等、可重复执行**（各自 SQL 内含 INSERT IGNORE / WHERE 排除目标值 / information_schema 检查 / ON DUPLICATE KEY GREATEST），失败重跑安全。
2. **两支数据迁移不可逆**：126（business_status 回填）与 131（pool_status 归一）的 down 脚本是占位/说明性空操作——回滚只能靠**部署前快照**恢复。因此部署前 mysqldump 快照是本方案的硬性前置，不是可选项。
3. **迁移由容器启动自动执行**（`Dockerfile.synology` CMD：`node database/migrations/run_migrations.js && exec node app.js`），`deploy/deploy.sh` 已内置：部署前快照 → down → build --no-cache → up → MySQL/App 健康检查 → 迁移完成日志检查 → 冒烟 → 失败自动回切 `:prev` 镜像（但**不自动回滚数据库**）。
4. **126 需先做 P0-12 生产只读 COUNT 核对**（fix-ledger 遗留运维动作），确认影响行数符合预期后再进窗口。

---

## 二、迁移 125–131 逐支说明

> 执行顺序：**按编号 125 → 131 顺序执行即可**。唯一显式依赖是 130 复用 129 建的表
> （`crm_doc_sequence`），编号顺序天然满足；其余各支相互独立。

| # | 文件 | 内容 | 类型 | 幂等 | 依赖 | down 脚本 | 备注 |
|---|---|---|---|---|---|---|---|
| 125 | `database/migrations/125_permission_sync.sql` | 补齐 12 个路由在用但库中不存在的权限码（file、file:upload、invoice:view、payment:edit、quotation:view、quotation:approve、purchase:request、purchase:comparison、email:send、recycle_bin:view、data:restore、system:cron）并按角色授权；同时撤销旧版 120 复制给 manager 的系统管理/灾备权限 | DML（权限字典） | ✅ INSERT IGNORE / DELETE | 无 | ✅ `125_permission_sync_down.sql`（仅撤销本迁移新增码；**120 已删除的经理越权权限不可自动恢复**，且不应恢复） | 角色按 code 定位，不依赖 role_id |
| 126 | `database/migrations/126_backfill_customer_business_status.sql` | 把 `status ∈ (following/quoted/negotiating/signed)` 且 `business_status='lead'` 的矛盾行回填为 `business_status = status`（正式客户被错误留在线索池） | **DML（业务数据）** | ✅ WHERE 排除已回填行 | 无 | ⚠️ down 为占位（`SELECT 1`），**数据不可逆** | **必须先做 §三 P0-12 只读 COUNT 核对** |
| 127 | `database/migrations/127_disable_demo_admin.sql` | 禁用 demo_admin（status=0）并推进 `password_changed_at` 使其旧 JWT 立即失效 | DML（单行） | ✅ 重复执行影响 0 行 | 无 | ⚠️ down 为占位（`SELECT 1`）——重新启用属安全风险，须管理员人工评估并重置强密码后才可恢复 | 执行前先核对账号现状（§三） |
| 128 | `database/migrations/128_reminder_unique_by_type.sql` | 跟进提醒唯一键从 `(customer_id, reminder_date)` 改为 `(customer_id, reminder_type, reminder_date)`，多类型提醒不再互相挤占 | DDL | ✅ information_schema 存在性检查后再 ALTER | 无 | ✅ `128_reminder_unique_by_type_down.sql`（恢复旧键前须先清理多类型同日行，否则 ALTER 安全失败） | 脚本内已处理先建新键再删旧键（旧键是 FK 支撑索引，顺序不可颠倒） |
| 129 | `database/migrations/129_doc_sequence.sql` | 新建 `crm_doc_sequence` 原子序列表，并按存量合同号（`CON-YYMMDD-NNN`）回填水位，解决并发建合同撞 1062 | DDL + DML | ✅ CREATE TABLE IF NOT EXISTS + GREATEST 回填 | 无 | ✅ `129_doc_sequence_down.sql` | 130 的前置 |
| 130 | `database/migrations/130_invoice_sequence.sql` | 发票编号接入同一序列表（`invoice:YYMMDD`），按存量发票号（`INV-YYMMDD-NNN`）回填水位 | DML | ✅ GREATEST 不回退 | **必须先执行 129** | ✅ `130_invoice_sequence_down.sql` | 编号正确性不再依赖迁移 123 的唯一索引 |
| 131 | `database/migrations/131_normalize_customer_pool_status.sql` | 把活跃客户的 `pool_status` 兼容列按 owner_id/business_status 语义归一（private/sea），修正历史错位 | **DML（业务数据）** | ✅ WHERE 排除目标值 | 无 | ⚠️ down 为说明性空操作，**数据不可逆** | 仅处理 `deleted_at IS NULL` 行；business_status 为 NULL 的行不推断 |

**执行器行为**（`database/migrations/run_migrations.js` 实读）：单文件失败即 `process.exit(1)` 中止（严格模式，非旧 migrate.js 的仅计数）；每支迁移用事务包裹，但脚本自身注释明确：MySQL 8 的 DDL（ALTER/CREATE）会隐式提交，**DDL 类迁移（128/129）的事务保护对已提交的 DDL 无效**——失败恢复依赖 down 脚本与部署前快照。

---

## 三、前置动作（进部署窗口之前完成）

### 3.1 P0-12 生产只读核对（全部 SELECT，只读，可白天执行）

经 `docker exec -i huakey-mysql` 以只读账号执行（密码走容器环境变量，不落命令行）：

```sql
-- ① 126 影响行数（核心核对：确认将被回填的正式客户数）
SELECT COUNT(*) AS to_backfill
  FROM crm_customer
 WHERE deleted_at IS NULL
   AND business_status = 'lead'
   AND status IN ('following', 'quoted', 'negotiating', 'signed');

-- ② 127 核对 demo_admin 现状（预期存在且 status=1）
SELECT id, username, status, role_id FROM sys_user WHERE username = 'demo_admin';

-- ③ 128 前置（预期 0 行；>0 行说明存在旧键下无法共存的数据，需人工评估）
SELECT customer_id, reminder_date, COUNT(*) n
  FROM crm_follow_up_reminder
 GROUP BY customer_id, reminder_date HAVING COUNT(*) > 1;

-- ④ 129/130 前置（不符合 CON-/INV- 格式的历史编号不参与水位回填，仅确认规模）
SELECT COUNT(*) FROM crm_contract WHERE contract_no NOT REGEXP '^CON-[0-9]{6}-[0-9]+$';
SELECT COUNT(*) FROM crm_invoice   WHERE invoice_no   NOT REGEXP '^INV-[0-9]{6}-[0-9]+$';
```

① 的结果记入变更单。若行数异常大（如数千行），与业务确认"这些客户是否本该在线索池"后再进窗口。

### 3.2 备份确认（硬性前置）

- **部署前快照**：`deploy/deploy.sh` L248 自动生成 `database/backups/predeploy-YYYYMMDD-HHMMSS.sql`——这是 126/131 不可逆迁移**唯一可依赖的回滚载体**，必须确认文件生成且非空后才能继续（部署脚本失败路径 L96-103 亦依赖它）。
- **例行备份健康**：MySQL 每日 02:00/04:00 双备份 + uploads 02:30 + config 02:45（加密）+ 月度恢复演练（2026-11-01 PASS 109/109 表，实测）。部署窗口当日确认最近一份例行备份存在。
- **密钥加密口令**：`deploy/deploy.sh` L193 检查 `.backup-enc-pass`（600 权限，NAS 宿主机持有）——若做 §六 密钥轮换，该口令**不得轮换**（历史加密备份靠它解密），只轮换 `.env.secrets` 内的业务密钥。

### 3.3 测试库演练步骤

1. 用生产最新例行备份（`huakey_crm_YYYYMMDD_020000.sql.gz`）还原到测试库；
2. 在测试库执行 `database/migrations/run_migrations.js`（或按 §二 顺序逐支执行），确认 124 → 131 全部通过；
3. 重放 §3.1 四条只读 SQL，与生产预期对照；
4. 抽查验证：125 后 `boss 与 manager 权限计数不相等`（fix-ledger P0-04 实测口径：boss 112 / manager 87）；126 后 `business_status='lead' AND status IN (...)` 计数为 0；131 后无 `pool_status` 错位行；
5. 在测试环境用旧镜像 + 新库跑一轮冒烟（`deploy/smoke-test.sh`），重点验证登录/权限路径。

---

## 四、部署步骤（NAS 执行）

> 通道：SSH `nas-crm`；docker 命令需 `sudo`（仅 docker 免密）；部署入口 `deploy/deploy.sh`。

| # | 动作 | 依据/说明 |
|---|---|---|
| 1 | 变更窗口公告（预计停机见 §七），通知全员将强制重新登录（随 §六 密钥轮换一并生效） | JWT_SECRET 轮换会使所有现存会话失效 |
| 2 | 确认 §三 前置全部绿：COUNT 核对完成、备份链健康、测试库演练通过 | |
| 3 | 在仓库根执行 `bash deploy/deploy.sh`（含 `.env.secrets` 存在性校验、环境变量校验、加密口令检查） | L69-201 |
| 4 | 脚本自动：predeploy mysqldump 快照 → compose down → build --no-cache → up -d | L248 / L290 / L295 / L300 |
| 5 | 容器启动时自动执行迁移 125→131（run_migrations.js 严格模式，任一失败容器退出并触发脚本回滚路径） | Dockerfile.synology CMD |
| 6 | 健康检查：MySQL healthcheck（L307）→ App healthcheck 循环 60 次（L333-348，探针 `wget /api/v1/health`）→ 迁移完成日志 `[迁移] 完成` 检查（L363） | |
| 7 | 端到端冒烟：`SMOKE_HEALTH_ONLY=1` 健康轮 → 完整冒烟（需 `ADMIN_PASS`；生产开启验证码时脚本会以 RC=4 退出，属"环境限制"而非失败，需按下节人工补验） | L395-419 |
| 8 | 人工验证点（见 §五） | |
| 9 | 全部通过后变更收尾：确认 `:prev` 镜像保留（下一次部署的回滚点），归档变更单 | |

---

## 五、冒烟与人工验证点（登录 / 验证码 / 权限重点回归）

### 5.1 自动冒烟覆盖（smoke-test.sh）

`/api/v1/health` 健康检查；登录接口可达性（生产 `SKIP_CAPTCHA=false` 时无法自动登录，脚本明示 RC=4 路径）。

### 5.2 人工验证清单（浏览器，建议至少 2 角色）

| 验证点 | 预期 | 对应修复 |
|---|---|---|
| 登录页验证码：刷新 3 次，每次图片变化且无控制台错误；响应头 `Cache-Control: no-store` | 通过 | 2b00eea 已上线部分复核 |
| 登录错误语义：错密码→"用户名或密码错误"（401）；错验证码→400 + 提示 | 提示语正确展示 | 82e1939 P1-21 |
| 限流隔离：两台机器连续错误登录，各自计数（不再全员共摊 429） | 各自触发"登录尝试次数过多" | 2b00eea 已上线 |
| manager 账号：确认**看不到**用户管理/角色管理/备份入口（125 撤销越权） | 403/不显示 | 82e1939 P0-02/04 |
| sales 账号：回款页/发票页可打开（125 补权限码后不再死页面）；尝试释放他人客户被 403 | 通过/403 | 82e1939 P0-05、P0-02 |
| 新建合同两次（间隔秒级）：编号连续不撞号 | 连续编号 | 82e1939 P2-04（129） |
| 提醒中心：今日/逾期提醒同日并存 | 多类型可见 | 82e1939 P2-02（128） |
| demo_admin 登录 | 拒绝（账号已禁用） | 82e1939 P1-17（127） |
| 上传附件后经 `/uploads/attachments` 未登录直访 | 401/403（不再公开静态） | 82e1939 P1-11 |

---

## 六、密钥轮换 + 重建镜像（合并窗口，P0-10）

> 为什么合并：轮换 JWT_SECRET/DB 密码本身要求全员重新登录（服务中断级别），与部署停机窗口天然重叠；分开做等于两次停机。且旧镜像曾存在密钥烘焙风险（P0-10），重建镜像与换密钥一次到位。

1. **窗口内、部署脚本执行前**：更新 NAS 上 `/volume1/docker/crm-stack/.env.secrets` 中的 `JWT_SECRET`（openssl rand -hex 64）、`DB_PASSWORD`/`MYSQL_PASSWORD`（同步 mysql 容器与 app，注意 compose 内外一致）、Supabase key 等可能进入旧镜像的密钥；
2. **不要动** `.backup-enc-pass`（历史加密备份唯一解密口令，轮换即作废）；
3. DB 密码轮换需同步执行 `ALTER USER`（在新镜像起容器、迁移执行完之后做，避免迁移中途断连；顺序：先用旧密码完成部署与迁移 → 验证通过 → 再换 DB 密码并重启 app/mysql 容器 → 复验健康）；
4. 轮换后所有用户重新登录（登录页验证 §五 5.2 前两项即天然覆盖）；
5. 旧 `.env.secrets`（mtime 2026-08-06 的版本）按密钥管理规程销毁，不留在 NAS 明文。

---

## 七、回滚方案

### 7.1 自动回滚（deploy.sh 内建，触发即执行）

- 触发条件：迁移失败（容器退出）、App 60 次健康检查未 healthy、MySQL 不健康；
- 动作：`rollback_and_exit`（L76-105）把 `:prev` 镜像 retag 回 `latest` 并 `up -d --no-build` 拉起旧版本容器；
- **明确边界：镜像回滚 ≠ 数据库回滚**。迁移可能已部分写入（脚本 L95 有醒目警示）。

### 7.2 数据库回滚（人工，按需）

| 场景 | 动作 |
|---|---|
| 125/128/129/130 需要撤销 | 有真实 down 脚本，按 **131→130→129→128→127→125 倒序** 执行（先撤依赖方：130 依赖 129 的表；129/130 的 down 会连带使取号逻辑缺表，须同步回滚服务代码）；128 的 down 前必须先按其头注释 SQL 清理多类型同日提醒行，否则 ALTER 安全失败 |
| 126/127/131 需要撤销 | **down 是占位，无法脚本回滚**。126/131 唯一途径：用 predeploy 快照（`database/backups/predeploy-*.sql`）恢复 `crm_customer` 表；127（重新启用 demo_admin）属安全决策，须人工评估并重置强密码。恢复数据前必须停写（停 app 容器） |
| 整库级灾难 | predeploy 快照全量恢复；仍不行退回当日例行备份（02:00/04:00 双份），损失窗口最大 ~24h 业务数据 |

### 7.3 不可逆项与决策点

- **不可逆**：126 回填、131 归一（原值不可推断）、127 禁用（down 占位，恢复属安全决策）——这就是 §3.2 把 predeploy 快照定为硬性前置的原因；
- **回滚决策点**（建议写入变更单）：
  - D1（部署后 0-10 分钟）：健康检查/冒烟失败 → 自动镜像回滚已发生，评估是否需要数据回滚（若失败发生在 126 之前，无需；之后则按 7.2）；
  - D2（部署后 10-60 分钟）：业务方验证 §五 清单发现功能性回归 → 先尝试 hotfix；不可快速修复则执行倒序 down + 镜像回切；
  - D3（次日）：确认稳定后归档 `:prev` 依赖解除，变更关闭。

---

## 八、风险清单与建议窗口

| 风险 | 等级 | 缓解 |
|---|---|---|
| 126/131 数据不可逆 | 高 | predeploy 快照硬性前置 + §3.1 COUNT 核对 + 测试库演练 |
| 125 撤销 manager 越权后，个别依赖越权的既有流程"突然不能用了"被当故障报 | 中 | 部署公告中明示"经理系统管理入口收回属预期"；§五 验证项 |
| 128 down 依赖数据清理（若回滚） | 中 | 回滚是低概率事件；down 脚本失败是安全的（不删数据） |
| 迁移执行中 MySQL DDL 隐式提交 | 中 | run_migrations.js 严格中止 + predeploy 快照 |
| GitHub SSH 端口 22 间歇性连接重置（本次 push 三次才成功） | 低 | 部署机上代码已推送；NAS 端从 origin 拉取时如遇同样问题可重试 |
| 密钥轮换顺序错误导致容器起不来 | 低 | §六 第 3 条的顺序约定 |

### 建议窗口与停机估算依据

- **时机**：非工作时段（如周五 20:00 后）或业务低峰；避开每月 1 日 03:00 恢复演练与每日 02:00-04:45 备份链。
- **停机构成**（deploy.sh 实际顺序 down → build → up）：
  1. 镜像构建 `--no-cache`：依 10-23 当日多次构建记录（11:21→11:39→13:45→13:58→14:15），单次约 **15-20 分钟**——**这是停机大头**。若需缩短，可在停机前先 `docker compose build --no-cache` 预构建，再用 deploy 流程（需人工调整顺序，属脚本外操作，本方案不默认）；
  2. 迁移 125-131：DDL（128/129）秒级；DML（125/126/131）取决于行数——生产活跃客户约 424（fix-ledger P1-17 口径），126/131 预计 **< 30 秒**；
  3. 容器健康检查等待：探针循环，约 **1-3 分钟**；
  4. 冒烟与人工验证：15-30 分钟（服务已可用，可让业务方并行验证）。
- **合计服务不可用约 20-30 分钟**（构建占用为主），加上验证全程约 1 小时的变更窗口。若同时做 §六 密钥轮换，另加 DB 密码同步与重启验证约 15 分钟。

---

## 附：本方案引用文件一览（自检对照）

| 引用 | 实际存在 |
|---|---|
| `database/migrations/125_permission_sync.sql` / `_down.sql` | ✅（内容实读） |
| `database/migrations/126_backfill_customer_business_status.sql` / `_down.sql`（占位） | ✅ |
| `database/migrations/127_disable_demo_admin.sql` / `_down.sql` | ✅ |
| `database/migrations/128_reminder_unique_by_type.sql` / `_down.sql` | ✅ |
| `database/migrations/129_doc_sequence.sql` / `_down.sql` | ✅ |
| `database/migrations/130_invoice_sequence.sql` / `_down.sql` | ✅ |
| `database/migrations/131_normalize_customer_pool_status.sql` / `_down.sql`（占位） | ✅ |
| `database/migrations/run_migrations.js`（严格中止/事务/DDL 警示） | ✅ L72/129-132/144 |
| `deploy/deploy.sh`（快照 L248、回滚 L76-105、构建 L295、健康 L307-348、迁移日志 L363、冒烟 L395-419） | ✅ |
| `deploy/smoke-test.sh`（health L25-34、登录 L45-75、RC 4 语义 L62-66） | ✅ |
| `Dockerfile.synology`（CMD 迁移前置 L70） | ✅ |
| `docs/fix-ledger-2026-10-23.md`（P0-04/P0-10/P0-12/P1-17/P1-21 等条目） | ✅ |

---

## 部署实测记录（2026-11-02 执行后追加）

> 本节为方案执行后的实测补记，不改动上方原方案内容。执行日期：2026-11-02。
> 方案中"预计/风险"与实测有出入的地方，以本节为准。

### 执行结果总览

- **部署结果**：成功。五容器（app/mysql/redis/nginx/backup）全部 healthy，`/api/v1/health` 返回 200，版本 **v1.1.0**。
- **部署分支**：`fix/audit-remediation-2026-10-26`（提交 `b2bf9c0`，未合并 main）。
- **镜像**：`crm-stack-app` 重建为 sha256:`ad9fb5aa8a8a`；回滚点已标记 `crm-stack-app:prev`。
- **停机窗口**：11:35 快照 → 迁移+构建+启动 → 迁移器报告 `找到 129 个迁移文件，已执行 122 个 / 本次执行了 7 个迁移`（125→131）。

### 迁移逐支实测

| 迁移 | 实测结果 |
|---|---|
| 125 权限同步 | 新权限码 12 个落库；`sysadmin_left` 残留 1 条（经核实为 `system:cron` 合法新授权，非残留） |
| 126 business_status 回填 | **影响 0 行**（生产活跃客户在 097/113 阶段已全部带值，本迁移为纯保险） |
| 127 禁用 demo_admin | **demo_admin 不存在，空操作**（部署前只读核对已确认 demo 类账号 0 个，无禁用对象） |
| 128 提醒唯一键 | 新唯一键 3 列生效，旧键 0 残留；生产提醒无重复行（唯一键切换零冲突） |
| 129 合同编号序列表 | 表已建，**生产合同 0 条**，水位 0 行（序列初始化为空操作） |
| 130 发票编号序列表 | 表已建，**生产发票 0 条**，水位 0 行（同上） |
| 131 pool_status 归一 | mismatch 0 行（生产池状态本已一致） |

### 密钥轮换实测

| 密钥 | 状态 |
|---|---|
| `JWT_SECRET` | ✅ 已轮换（容器重建后旧 token 全部失效，登录复验通过） |
| `DB_PASSWORD`（crm_user） | ✅ 已轮换（ALTER USER 先行验证 → env 更新 → 容器重建，连接复验通过） |
| `MYSQL_ROOT_PASSWORD` | ⚠️ **未轮换**（超出本次方案最小范围，留待后续专项） |
| `REDIS_PASSWORD` | ⚠️ **未轮换**（同上） |

轮换顺序按 §六 第 3 条执行；旧密钥临时备份文件已在验证通过后删除。

### 回滚资产留存

- 部署前快照：`database/backups/predeploy-20261102-113549.sql`（4.1M，.err 0 字节，未随部署删除）。
- 回滚镜像：`crm-stack-app:prev`（指向旧生产镜像）。
- 提醒：126/127/131 的 `_down.sql` 为占位，如需回退数据库只能依赖该快照。

### 部署过程问题与收尾修复

- **唯一失败项 [P0-5]**：deploy.sh 迁移完成日志检查按旧迁移器关键字 `[迁移] 完成` 匹配，而现行 run_migrations.js 输出 `本次执行了 N 个迁移`，导致误报。经人工实证 schema_migrations 落账 125-131 全部成功后放行。**该检查已于收尾修复**：兼容 `[迁移] 完成` / `本次执行了 N 个迁移` / `所有迁移均已执行，无需操作` 三种成功输出（mock 三场景验证通过），失败样例仍会如实报错。
- **[12/12] 冒烟 RC=4**：属预期环境限制（登录步骤无法自动完成），健康检查与已验证项全部通过；登录语义（验证码 no-store、错误提示、附件未授权 401）由人工 curl 复核通过。

---

## 明文密钥备份处置记录（2026-11-03 追加）

> 处置对象仅一个文件：NAS 仓库目录下未跟踪的 `.env.secrets.bak.domain`（2026-08-06 17:21 生成，1177 字节，权限 777）。全程未触碰 `.env` / `.env.secrets` 的实际密钥值（处置前后两者 md5 指纹一致）、未重启/重建任何容器、未执行任何数据库或部署操作。

### 核查结论（只读，未输出任何密钥明文）

- **文件性质**：`.env.secrets` 的明文备份，9 个键与当前文件键集合完全一致；值非占位符，确为明文。
- **风险判定（高）**：其中 `MYSQL_ROOT_PASSWORD`、`REDIS_PASSWORD`、`ADMIN_INITIAL_PASSWORD`、`EMAIL_ENC_KEY` 四键与当前生效值**完全相同**（经 md5 哈希比对，未比对明文）；`JWT_SECRET`、`DB_PASSWORD` 为 11-02 轮换前旧值（已失效）。文件权限 777（全员可读写，含 ACL），构成真实暴露面。
- **引用核查**：仓库脚本（deploy/、compose、env、nginx、cron）与全部 5 个容器的挂载/环境中对该文件**零引用**（sudo 绝对路径重核，排除假 0）。

### 处置动作（2026-11-03 09:16）

| 步骤 | 动作 | 结果 |
|---|---|---|
| 1 | 单文件打包 `tar.gz` | 完成 |
| 2 | gpg 对称 AES256 加密（口令经 `--passphrase-file` 走宿主机 `.backup-enc-pass`，未进命令行/日志） | 完成 |
| 3 | 宿主机回验：解密→解包→md5 与原件比对 | 逐字节一致 |
| 4 | 归档至 `database/backups/config/secrets-bak-domain_20261103.tar.gz.gpg`（root:root 600，与既有 config_*.tar.gz.gpg 同目录同规范） | 完成 |
| 5 | 备份容器内回验：解密→tar 清单→解包 md5 比对 | 逐字节一致（md5 `efe617f5…`），临时副本已 shred |
| 6 | 删除明文原件：`shred -u -n 3` | 完成，文件已不存在 |
| 7 | 权限收紧：`database/backups` 777 → **700**（syadmin:users） | `ls -l` 数值已验证 |

### 局限与后续

- `shred` 为逻辑覆写，在 DSM 文件系统/SSD 磨损均衡下不保证物理扇区清除；归档加密包与口令文件（`.backup-enc-pass`，600）是唯一恢复途径，口令文件须离线妥善保管。
- **root 与 Redis 口令仍为该备份中曾明文暴露的现役值**，强烈建议尽快安排轮换专项（本次范围未轮换）。
- `database/backups` 收紧为 700 后，备份容器（root）写入不受影响；下次定时备份（02:45）产物落地后建议复核一次。

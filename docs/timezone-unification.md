# 步骤 B3 · 时区统一（Asia/Shanghai）改造与评估清单

> 日期：2026-10-19
> 范围：MySQL 会话层 / Docker 容器层 / Node 业务层
> 原则：**只统一口径，不迁移历史数据**；评估项不动表结构。

---

## 一、为什么必须统一

编号（`CON-`/`OPP-`/`PO-`/`RCV-`/`SUP-`/`SRV-`/`INV-`/`BJ`/`PR`）的日期段原先统一用
`new Date().toISOString().slice(...)` 截取，而 `toISOString()` **恒为 UTC**：

```
北京时间 2026-01-15 07:30  ⇒  UTC 2026-01-14 23:30
```

后果（每天 00:00–08:00 复现）：

1. 编号日期是"昨天"，与同一行 `create_time`（MySQL `NOW()`）**差一整天**；
2. `COUNT(*) + 1` 序号被拆到两个日期前缀下统计 ⇒ 当天序号不连续，跨日还可能重复发号；
3. 到期/逾期扫描（`generate_reminders.js`、`qualification-reminder.js`）的"今天/明天"边界整体前移一天。

---

## 二、三层落地清单（本次已改）

| 层 | 文件 | 改动 |
|---|---|---|
| 驱动 · MySQL | `backend/config/database.js` | 主池 + 只读池加 `timezone: '+08:00'`（`DB_TIMEZONE` 可覆盖） |
| 服务端 · MySQL | `docker-compose.yml` / `docker-compose.ci.yml` | `TZ: Asia/Shanghai` + `--default-time-zone=+08:00`（不依赖镜像内 tzdata） |

> ⚠️ **实测澄清**：mysql2 的 `timezone` 选项**只是驱动侧**的 `Date` 序列化/解析口径，
> 并不会执行 `SET time_zone`（实测 `SELECT @@session.time_zone` 仍返回 `SYSTEM`）。
> 因此 `NOW()` / `CURDATE()` / `FROM_UNIXTIME()` 的口径**必须**靠服务端
> `--default-time-zone=+08:00` 保证 —— 两层都要设，缺一层就会在 00:00–08:00 跨天。
| 容器 · 应用 | `docker-compose.yml` | backend / frontend 加 `TZ: Asia/Shanghai` |
| 镜像 | `backend/Dockerfile`、`frontend/Dockerfile` | `ENV TZ=Asia/Shanghai`（frontend 额外 `apk add tzdata`，nginx 无 Node 的 full-icu） |
| Node 业务 | `backend/utils/dateCode.js`（新增） | 按 `APP_TIMEZONE`（默认 `Asia/Shanghai`）用 `Intl` 取年月日 |

### 统一后的编号日期生成点

| 文件 | 编号 | 原写法 |
|---|---|---|
| `services/contractService.js` | `CON-YYMMDD-NNN` | `toISOString().slice(2,10)` |
| `services/quoteService.js` | `CON-YYMMDD-NNN`（报价转合同） | 同上 |
| `services/opportunityService.js` | `OPP-YYMMDD-NNN` | 手写 `getFullYear/getMonth/getDate`（本地时区，换 host 会漂） |
| `services/invoiceService.js` | `INV-YYMMDD-NNN` | `toISOString().slice(2,10)` |
| `services/purchaseService.js` ×2 | `PO-`、`RCV-` | 同上 |
| `services/supplierService.js` | `SUP-` | 同上 |
| `services/serviceOrderService.js` | `SRV-` | 同上 |
| `services/purchaseComparisonService.js` | `BJ + YYYYMMDD` | `toISOString().slice(0,10)` |
| `services/purchaseRequestService.js` | `PR + YYYYMMDD` | 同上 |

### 日期边界（非编号，同样会跨天）

| 文件 | 位置 | 说明 |
|---|---|---|
| `services/analysisService.js` | 30 日趋势分桶 | `DATE(create_time)` 与 JS 侧日期键此前口径不同（UTC vs 本地） |
| `services/customerDetailService.js` | 客户导出「最后跟进 / 创建时间」 | 08:00 前导出成前一天 |
| `services/contractExportService.js` | 付款日期导入 | xlsx 日期单元格是本地午夜 `Date`，`toISOString` 会退一天 |
| `utils/qualification-reminder.js` | 资质到期扫描（今天 / +90天 / +N天） | 同上 |
| `scripts/generate_reminders.js` | 今日 / 明日跟进提醒 | 同上 |
| `scripts/audit-domain-boundary.js` | 基线 `review_by` 过期判定 | 同上 |
| `utils/paymentPlan.js` | `toPlanDateKey` | 改为复用 `dateCode.dateKey`，消除第二套本地取值实现 |

### 刻意**不**改的项

- 日志 / 告警 / Webhook 里的 `new Date().toISOString()`（`app.js`、`utils/alert.js`、`utils/notification.js`、
  `services/notificationService.js`、`webhookDispatcher.js`、`scripts/auto_release.js`、
  `scripts/overdue_reminder.js`、`services/backupRouteService.js`）：
  这些是**时刻（instant）**而非"业务日期"，ISO-8601 带 Z 是可跨时区无歧义交换的正确写法，改成 +08:00 反而丢信息。
- `services/analysisService.js` 之外的纯展示格式化：未发现 UTC 截取。

---

## 三、`dateStrings` 评估（结论：**本次不开启**）

`mysql2` 的 `dateStrings: true` 会把 `DATE / DATETIME / TIMESTAMP` 直接返回为字符串，
看似"所见即所得"，但对本项目有实质风险：

| 风险 | 说明 |
|---|---|
| **DATE 列语义变化** | `plan_date` 变 `'2026-01-05'` 字符串，`new Date('2026-01-05')` 按 **UTC 午夜**解析；而现在 mysql2 返回的是本地午夜 Date。两者差 8 小时 ⇒ 逾期/到期判断在边界日整体差一天（`paymentService.js:41/47/48/113`、`contractService.js:387`、`supplierService.js:216`） |
| **`instanceof Date` 分支失效** | 4 处：`contractExportService.js:173`、`analysisService.js:122`、`utils/mask.js:214`、`utils/paymentPlan.js:24` |
| **直接调 `.toISOString()` 会抛错** | 字符串没有该方法（`analysisService.js:122`、`customerDetailService.js:586/587` 本次已改为 `dateKey()`，但仍有其它散点） |
| **改造面** | `backend/services`、`utils`、`controllers` 共 **80 处** `new Date(...)` 需逐处回归 |
| **导出行为变化** | Excel 单元格从 Date 变字符串，列宽/格式/排序都可能变 |

**建议路径（作为独立批次，本次不做）**：
1. 第一步只开 `dateStrings: ['DATE']`（mysql2 支持按类型指定）——纯日期列不再经 `Date` 往返，
   消除 `new Date('YYYY-MM-DD')` 的 UTC 午夜陷阱；`DATETIME/TIMESTAMP` 保持现状；
2. 回归通过后，再评估是否把 `DATETIME` 也纳入；
3. `TIMESTAMP` 不建议转字符串（涉及时区转换语义）。

---

## 四、`timestamp` 列评估清单（**只评估，不强制改**）

### 实测口径

```sql
SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='huakey_crm' AND DATA_TYPE='timestamp';
```

> 任务书描述为「11 张 timestamp 表」，**实测为 8 张表 / 15 列**
> （`deploy/init-complete.sql` 基线里 7 张，第 8 张 `schema_migrations` 由
> `backend/database/migrations/run_migrations.js` 自建）。差异以实测为准。

| # | 表 | 列 | 可空 | 默认值 | 当前行数 | 风险评估 | 建议 |
|---|---|---|---|---|---|---|---|
| 1 | `crm_currency` | `created_at` | YES | CURRENT_TIMESTAMP | 7 | 低 | 可转 datetime |
| 2 | `crm_currency` | `updated_at` | YES | CURRENT_TIMESTAMP ON UPDATE | 7 | 低 | 可转 datetime（保留 ON UPDATE 子句） |
| 3 | `crm_email` | `sent_at` | YES | NULL | 0 | 低 | 可转 datetime |
| 4 | `crm_email` | `received_at` | YES | NULL | 0 | 低 | 可转 datetime |
| 5 | `crm_email` | `created_at` | YES | CURRENT_TIMESTAMP | 0 | 低 | 可转 datetime |
| 6 | `crm_email_account` | `last_sync_at` | YES | NULL | 0 | 低 | 可转 datetime |
| 7 | `crm_email_account` | `created_at` | YES | CURRENT_TIMESTAMP | 0 | 低 | 可转 datetime |
| 8 | `crm_email_account` | `updated_at` | YES | CURRENT_TIMESTAMP ON UPDATE | 0 | 低 | 可转 datetime |
| 9 | `crm_email_attachment` | `created_at` | YES | CURRENT_TIMESTAMP | 0 | 低 | 可转 datetime |
| 10 | `crm_product_price` | `created_at` | YES | CURRENT_TIMESTAMP | 0 | 低 | 可转 datetime |
| 11 | `crm_product_price` | `updated_at` | YES | CURRENT_TIMESTAMP ON UPDATE | 0 | 低 | 可转 datetime |
| 12 | `schema_migrations` | `executed_at` | YES | CURRENT_TIMESTAMP | 116 | **高（框架自建表）** | **不动**：迁移框架按 timestamp 建表，改了会被后续迁移脚本/比对逻辑误判 |
| 13 | `sys_customer_status` | `created_at` | YES | CURRENT_TIMESTAMP | 8 | 低 | 可转 datetime |
| 14 | `sys_customer_status` | `updated_at` | YES | CURRENT_TIMESTAMP ON UPDATE | 8 | 低 | 可转 datetime |
| 15 | `sys_customer_status_transition` | `created_at` | YES | CURRENT_TIMESTAMP | 17 | 低 | 可转 datetime |

### 结论

- **不构成立即风险**：8 张表全部为字典表 / 邮件表 / 迁移记录表，行数 ≤ 116，
  没有一张是业务主表（`crm_contract`、`crm_customer`、`crm_payment` 等均为 `datetime`）；
- **`timestamp` 的真实短板是 2038-01-19 上限**。本项目所有取值都是"当前时间"，
  不存在写入未来时间或历史极早时间的场景，2038 前都不会触发；
- **时区转换语义反而变好了**：`timestamp` 以 UTC 存储、按会话时区转换，
  本次把服务端 `default_time_zone` 钉成 `+08:00` 后，读写口径与 Node 侧完全一致；
  改成 `datetime` 后反而失去这层保护（写什么就是什么，完全依赖应用侧给对时间）；
- **`schema_migrations.executed_at` 明确不改**（迁移框架自建表）。

> 因此本轮**不提交表结构变更**。若将来确需收敛（例如要存 2038 年后的日期），
> 应作为独立迁移批次：逐表 `MODIFY ... datetime [DEFAULT CURRENT_TIMESTAMP [ON UPDATE CURRENT_TIMESTAMP]]`，
> 并先做 `SELECT MAX(col)` 校验存量值落在 datetime 区间内。

---

## 五、生产 NAS 时区：2026-10-20 已取证并修复

### 5.1 取证结论（修复前）

| 证据 | 结果 |
|---|---|
| `SELECT @@global.time_zone` | `SYSTEM` |
| `NOW()` vs `UTC_TIMESTAMP()` | 完全相同，偏差 `00:00` ⇒ **服务端实际是 UTC** |
| 构成 datasets 规模 | 43 张非空表，业务表基本为空（合同 0、回款 0、跟进 0、商机 1、报价 1，客户 425） |
| `sys_cron_log` 小时分布（修复前） | 集中在 **19/17/18/0/16/20 点** |

最后一条是决定性证据：compose 注释写明容器调度为北京时间 `02:00/02:30/02:45`，
落到库里成了 **18/18:30/18:45**，另有 `16`→北京 00:00、`0`→北京 08:00 两个定点任务。
**存储值确实比北京时间早 8 小时。**

### 5.2 为什么 datetime 必须改数据、timestamp 不用

| 列类型 | 存储 | 切到 +08:00 后 | 处理 |
|---|---|---|---|
| `TIMESTAMP` | 物理存 UTC | 读取时按会话时区转换 ⇒ **自动变对** | 不动数据 |
| `DATETIME` | 字面量，无时区 | 原样不动 ⇒ 仍是 UTC 字面量 | **必须 +8 小时校正** |

### 5.3 校正范围与安全边界

- **只动审计列**：`create_time / update_time / created_at / updated_at / deleted_at / delete_time / backed_up_at`
  共 **35 张表 73 列**（由 information_schema 按类型 + 列名自动生成，非手写）。
  `plan_date / sign_date / next_time / start_time / expire_date` 等业务日期列**一律不动**
  （它们是用户输入的业务语义日期，加 8 小时会直接错数据）。
- **迁移备份表不动**：`_migration_097_backup`、`crm_contact_primary_backup_*` 属于快照数据。
- **`@cut` 上限保护**：
  ```sql
  SET @cut = '2026-10-20 01:46:33';  -- 切换前服务器时钟(UTC) + 10 分钟
  CREATE_TIME = CASE WHEN create_time < @cut THEN create_time + INTERVAL 8 HOUR ELSE create_time END
  ```
  切换后新写入的行已是北京时间（值远大于 `@cut`），天然被排除，**不会重复 +8 小时**；
  10 分钟余量覆盖「记录 CUT → mysqld 停止」之间的写入。`NULL < @cut` 求值为 NULL ⇒ NULL 保持 NULL。

### 5.4 执行记录（2026-10-20）

1. 全量备份：`/volume1/docker/crm-stack/database/backups/pre-tzfix-20261020-093556.sql.gz`（658 KB）
2. NAS compose 备份：`docker-compose.synology.yml.bak.20261020-093902`，随后替换为带 `TZ` + `--default-time-zone=+08:00` 的版本
3. 重建 `huakey-mysql`（15s 后 healthy），校验 `@@global.time_zone=+08:00`、`NOW()−UTC_TIMESTAMP()=08:00`
4. 执行 73 列校正 SQL
5. 复核：`sys_cron_log` 小时分布由 `19/17/18/0/16/20` → `3/1/2/8/0/4`（正好 +8）；
   `crm_customer.id=657` 由 `2026-09-10 06:45:57` → `14:45:57`
6. 5 个容器均 healthy，app `/api/v1/health` 返回 200（`db:true, redis:true`）

### 5.5 NAS 运维要点（踩坑记录）

- `syadmin` 的免密 sudo **仅限** `/usr/local/bin/docker` 与 `/usr/local/bin/docker-compose`，
  `sudo bash -c` / `sudo tee` 都会要求密码 ⇒ 命令要直接调这两个二进制。
- SSH 非交互会话里 `docker` 不在 PATH，需写全路径或用 `sudo -n /usr/local/bin/docker`。
- scp 的现代 SFTP 模式在该 NAS 上报 `remote mkdir: No such file or directory`，
  加 `-O`（走传统 scp 协议）可正常上传。

---

## 六、回滚方式

| 改动 | 回滚 |
|---|---|
| `database.js` timezone | 删 `timezone: DB_TIMEZONE` 两行即回到 mysql2 默认 `'local'` |
| compose / Dockerfile TZ | 删 `TZ` 与 `--default-time-zone` 即可；注意改回后 MySQL 显示值会随容器 TZ 变化（存储值不变） |
| `utils/dateCode.js` | 各调用点均在文件顶部单点 require，替换回原表达式即可；`dateCode` 本身可保留不用 |
| 编号日期口径 | **注意**：编号日期段从 UTC 切到 +08:00 后，切换当天 00:00–08:00 生成的编号日期会与切换前不同（这是修复本身）。已存在的编号不受影响 |

---

## 七、验证

- `backend/tests/unit/dateCode.test.js`：冻结系统时间到「北京时间 07:30」（UTC 前一天 23:30），
  断言编号日期段 = 北京时间当天、且不等于 UTC 日期；覆盖月末/年末/闰日与 `addDaysKey` 跨月。
- `backend/tests/db/contractNoTimezone.test.js`：真实库写入一条合同，
  断言「编号日期段 == `DATE(create_time)`」；并交叉校验 Node 侧 `dateKey()` 与 MySQL `DATE(NOW())` 一致
  （MySQL 若被误配成 UTC，该用例会在 UTC 16:00 之后立刻变红）。

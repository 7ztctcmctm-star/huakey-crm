# D3 · 部署层加固交付文档（nginx / compose / 备份 / 恢复演练）

> 计划来源：`docs/full-audit-optimization-plan-2026-10-16.md` Phase D 步骤 D3
> 执行日期：2026-10-22 ｜ 状态：本地验证完成，待 NAS 部署验证
> 关联：`docs/nas-resource-limits-assessment.md`（资源限制评估，D3-2 衍生）

---

## 一、范围与结论

| 子项 | 内容 | 结论 |
|---|---|---|
| D3-1 | nginx.conf 安全加固 | CSP 收紧（script-src 去 unsafe-inline）、删 X-XSS-Protection、加 Permissions-Policy、ssl_session_timeout 1d→10m、/api/v1/auth/ 限流 |
| D3-2 | compose 加固 | nginx/backup 补 logging 10m×3；MySQL buffer pool 改启动自适应（256M 写死 → MemTotal/4 钳制 128–1024M） |
| D3-3 | 备份加固 | **修复"假备份"根因（pipefail）**；三套备份脚本完整性校验对齐；config 备份明文密钥加密（gpg/openssl）；offsite 评估 |
| D3-4 | 恢复演练自动化 | restore-test.sh v4 双模式 + 失败不静默；月执行接入备份容器调度器；deploy/cron/ root 载体 + 状态文件 |

---

## 二、D3-1 · nginx 加固（nginx/nginx.conf）

### 2.1 改动清单

| # | 项 | 前 | 后 | 依据 |
|---|---|---|---|---|
| 1 | CSP script-src | `'self' 'unsafe-inline'` | `'self'` | 前端构建产物无内联脚本（index.html 仅外链模块；无 iframe/内联事件处理器/javascript: URL，已全量 grep 核实） |
| 2 | CSP 指令补全 | 7 条 | + `base-uri 'self'` `form-action 'self'` | 收窄基址劫持与表单外发 |
| 3 | X-XSS-Protection | 有 | **删除** | 已废弃，现代浏览器移除且其自身有过滤绕过漏洞 |
| 4 | Permissions-Policy | 无 | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | 前端无相关用法（已 grep 核实 capture/fullscreen/geolocation 均无命中） |
| 5 | ssl_session_timeout | 1d | 10m | 票据已关闭（tickets off），缩短恢复期=缩小重放窗口；与 session_cache 10m 对齐 |
| 6 | /api/v1/auth/ 限流 | 无 | 10r/s + burst 20 nodelay，429 | 应用层已有登录 30 次/15min、验证码 60 次/15min；本层抗高频冲击，两层互补 |
| 7 | style-src | `'self' 'unsafe-inline'` | **不变** | Vue 动态 :style 产生内联 style 属性，收紧会破坏组件样式 |

### 2.2 限流 key 的真实客户端提取（关键设计）

生产链路 `客户端 → DSM nginx(443) → 本容器(8443)`，容器看到的 `$binary_remote_addr`
恒为 127.0.0.1——直接按 remote_addr 限流会把全部用户混成一个 key。采用：

```nginx
map $http_x_forwarded_for $auth_client_key {
    "~(?:^|,[ \t]*)(?<xff_last>[0-9a-fA-F.:]+)[ \t]*$"   $xff_last;
    default                                              $binary_remote_addr;
}
limit_req_zone $auth_client_key zone=auth_limit:10m rate=10r/s;
```

- DSM nginx 以 **append** 方式写 X-Forwarded-For，取**末段**即真实客户端
  （客户端伪造的前缀段在更左，不会被采用）；
- 无 XFF（内网直连容器）回退 remote_addr；
- 安全前提：DSM nginx 是唯一受信任入口，8443 仅监听内网。

### 2.3 HSTS preload 评估结论

**不加 preload。** `crm.huakey.local` 是内网域名：preload 列表只接受公网域名，
误入会污染浏览器全局 HSTS 策略且难以回退。保持
`max-age=63072000; includeSubDomains`。

### 2.4 与应用层 helmet CSP 的关系

应用层 helmet 也下发 CSP（HTTP 部署场景）。nginx `add_header` 不清除上游头，
响应携带两份 CSP，浏览器对**每份分别强制执行**（需同时满足），实际生效为
两者交集——nginx 层更严，收紧 script-src 后交集仍为 `script-src 'self'`。
保留双份是 fail-safe 设计（nginx 配置故障时 helmet 兜底），不做 proxy_hide。

---

## 三、D3-2 · compose 加固（docker-compose.synology.yml）

### 3.1 日志轮转对齐

nginx 与 backup 服务原缺 logging 配置，容器日志会无限增长吃满系统盘。
补 `json-file 10m×3`，与 mysql/redis/app 完全一致。

### 3.2 MySQL buffer pool 自适应（写死 256M → 启动探测）

**新增 `deploy/mysql-entrypoint.sh`**（容器入口包装器）：

- 读 `/proc/meminfo` MemTotal，取 25%，钳制 **[128MB, 1024MB]**；
- env `INNODB_BUFFER_POOL_SIZE_MB` 非空时手动覆盖优先；
- 探测失败回退 256M（与原行为一致）；
- 交回官方 `docker-entrypoint.sh mysqld ...`，**首启建库 /
  initdb.d 初始化逻辑不受影响**；
- compose 原 `command:` 参数段（字符集/排序规则/log/连接数/时区等 13 条）
  已逐条迁入脚本，仅 `innodb_buffer_pool_size` 改自适应——**改参数只改一处**。

本机 NAS 实测 MemTotal≈7708MB → **pool=1024M**（原 256M，提升 4 倍；
数据集远小于此，池按需增长不预占物理内存）。

### 3.3 入口切换的风险与控制

| 风险 | 控制 |
|---|---|
| 包装器 bug 导致 mysql 起不来 | 脚本仅 30 行、无外部依赖；部署前 NAS 上一次性容器预跑验证；deploy.sh 健康检查失败即回滚镜像 |
| 参数迁移遗漏 | 逐条比对原 command:（13 条全量迁入，见脚本注释） |
| 首启初始化被绕过 | 包装器 exec 的是官方入口本身，不是 mysqld |

---

## 四、D3-3 · 备份加固

### 4.1 根因修复：MySQL 备份的"假备份"形态（最重要）

**生产实际执行的容器备份 `database/backup.sh` 原实现：**

```bash
set -e
mysqldump ... | gzip > "$BACKUP_PATH"   # 管道出口码 = gzip 的，恒 0
```

`mysqldump` 中途失败（锁超时/磁盘满/连接断）时，gzip 仍成功收尾，
**截断的 .sql.gz 被当作成功备份保留**——直到恢复演练/真实灾难时才暴露。
这是备份系统最危险的失败形态：有文件、有体积、恢复时报错。

**修复**（`database/backup.sh`）：

1. `set -euo pipefail`——管道任一环失败即整体失败；
2. 失败即删半成品，不留假备份；
3. 完整性三检：`gzip -t` + 大小 ≥100B + `CREATE TABLE` 计数 > 0
   （空库/权限异常/选错库的早期信号）；
4. 产物统一 600；清理范围收窄为 `huakey_crm_*.sql.gz`（不再误删同目录其他 dump）；
5. 补 `--no-tablespaces`（与宿主机版对齐，降低恢复时权限要求）。

宿主版 `mysql-backup.sh` 同步补 `gzip -t` + 600。

### 4.2 uploads / config 备份校验对齐

| 脚本 | 前 | 后 |
|---|---|---|
| container-backup.sh run_uploads | 仅 `grep -c` 计数（tar 损坏时计数为 0 却不报失败） | `tar -tzf` 强校验，损坏即 FATAL 删除 |
| container-backup.sh run_config | 仅大小检查 | 大小 + 加密回验（见 4.3） |
| uploads-backup.sh（宿主） | 仅计数 | `tar -tzf` 强校验 + 600 |

### 4.3 config 备份加密（明文密钥不落盘）

config 备份含 `.env.secrets`（JWT Secret / DB 密码 / 各集成密钥），
原实现明文 tar 落盘——备份目录 700/文件 600 只是权限缓解，不是加密。

**策略**（容器版 container-backup.sh 与宿主版 config-backup.sh 一致）：

```
有口令文件 .backup-enc-pass + 有 gpg/openssl
    → .env.secrets 入包 → gpg（无则 openssl AES-256-CBC/PBKDF2）加密
      → 解密回验（解开 + tar -tzf）→ 删明文 → 只留 config_YYYYMMDD.tar.gz.gpg
否则
    → 排除 .env.secrets + WARNING（绝不明文落盘）
```

- 口令文件由 `deploy.sh` 部署时自动生成（openssl rand -hex 32，600；
  已存在绝不覆盖——覆盖=历史加密备份全废）；手动：
  `bash deploy/backup/setup-backup-encryption.sh`；
- 口令仅存 NAS 宿主机，不入仓库（.gitignore 已拦 `.backup-enc-pass`）、
  不进任何备份产物；
- 加密/回验任一失败 → 明文密文一起删（fail-closed）；
- 加密工具顺序 gpg → openssl：两者在备份容器（Oracle Linux 9）与 NAS
  宿主机均可用（已实测 `command -v`）。**工具一经启用保持稳定**——
  旧产物只能由当时加密的工具解密。

### 4.4 宿主机 cron 不可写的影响与适配

NAS 部署账号 syadmin 对 `/etc/cron.d` 不可写、sudo 仅白名单
`/usr/local/bin/docker`——宿主机 uploads/config 备份脚本实际未入 cron
（现存 cron 仅 04:00 MySQL 一份）。生产三合一备份由 huakey-backup
容器调度器承担（02:00/02:30/02:45），本次加固以容器路径为主、
宿主机脚本为手动/等价载体，两套逻辑已对齐。

### 4.5 offsite（异地副本）评估

| 方案 | 评估 | 结论 |
|---|---|---|
| DSM Hyper Backup → 第二盘位/USB | DSM 原生、任务级加密、增量；配置 10 分钟 | **推荐**：纳入 database/backups 整目录，夜间低峰 |
| rsync → 第二台 NAS/服务器 | 灵活，需自管加密与保留 | 可选（有第二主机时） |
| 对象存储（COS/OSS/MinIO） | 适合公网场景；内网 CRM 数据外传需过一遍加密 | 暂不实施；如启用必须用加密后的 config 副本 + 专用最小权限密钥 |
| 现状（单盘本地） | 磁盘损坏=备份与数据同亡 | **不满足灾备要求，需尽快落地第一项** |

注意：MySQL dump 当前为明文（与库同信任域），offsite 同步整目录时
依赖 Hyper Backup 任务级加密或传输加密；config 备份已是密文。

---

## 五、D3-4 · 恢复演练自动化

### 5.1 restore-test.sh v4（deploy/backup/restore-test.sh）

v3 的三个缺陷（导入 `2>/dev/null` 不检查退出码、gunzip 前无 `gzip -t`、
无总体判定）全部修复：

1. **双模式**：宿主机（docker CLI 可用）走 `docker exec -i`；备份容器内
   走 `mysql -h mysql` 直连（密码统一走 `MYSQL_PWD` 环境变量，不出现在命令行）；
2. 导入失败即 **RESULT=FAIL** 并不留临时库（trap 保证）；
3. `gzip -t` 前置 + 磁盘空间预检（2×备份大小 + 512MB）；
4. 附带校验：uploads 最新 tar 完整性、config 加密备份**解密回验**；
5. **状态文件** `database/backups/restore-drill.status`：
   `LAST_RUN / RESULT / MODE / BACKUP / TABLES / DURATION`，机器可检查；
6. `mkdir` 并发锁（防手动与月调度叠加，>2h 陈旧锁强夺）。

### 5.2 月执行机制（本 NAS 实际生效）

宿主机 `/etc/cron.d` 对部署账号不可写 → 月执行接入 **huakey-backup
容器调度器**（container-backup.sh `maybe_run_drill`）：

- 每月 1 日 03:00；基于状态文件幂等（本月已 PASS 不重复）；
  **03:00 之后容器重启则启动时补跑**（catchup_drill）；
  已知窗口：1 日 02:00–03:00 之间重启会整月跳过（该窗口当日备份同样跳过，
  属调度器既有行为）；
- `timeout 3600` 兜底——演练挂起不会拖死后续备份调度；
- 演练脚本经 compose 挂载 `/restore-test.sh` 进备份容器。

### 5.3 root 环境等价载体（deploy/cron/）

`deploy/cron/install-restore-drill.sh`（install/status/uninstall）写
`/etc/cron.d/crm-restore-drill`（每月 1 日 03:00）。面向 root 可写
`/etc/cron.d` 的环境；**与容器调度器二选一，不并存**。
`deploy/cron/README.md` 说明检查方式。

---

## 六、改动文件清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `nginx/nginx.conf` | 改 | D3-1 全部七项 |
| `docker-compose.synology.yml` | 改 | mysql entrypoint 切换、nginx/backup logging、restore-test 与口令文件挂载 |
| `deploy/mysql-entrypoint.sh` | **新** | buffer pool 自适应入口包装器（755） |
| `database/backup.sh` | 改 | pipefail + 完整性三检 + 600（**假备份根因修复**） |
| `deploy/backup/container-backup.sh` | 改 | bash 调备份、uploads 强校验、config 加密、月度演练调度 |
| `deploy/backup/config-backup.sh` | 改 | 同套加密策略（宿主版） |
| `deploy/backup/uploads-backup.sh` | 改 | tar -tzf 强校验 + 600 |
| `deploy/backup/mysql-backup.sh` | 改 | gzip -t + 600 |
| `deploy/backup/setup-backup-encryption.sh` | **新** | 口令文件生成助手 |
| `deploy/backup/restore-test.sh` | 改 | v4 双模式 + 状态文件 + 锁 |
| `deploy/cron/install-restore-drill.sh` | **新** | 宿主机 cron 安装载体 |
| `deploy/cron/README.md` | **新** | 载体说明 |
| `deploy/deploy.sh` | 改 | [2b] 备份加密口令文件自动供给 |
| `.gitignore` | 改 | 拦截 `.backup-enc-pass` |
| `AGENTS.md` | 改 | 新增 7.31 部署层加固约定 |
| `docs/deploy-hardening-d3.md` | **新** | 本文档 |
| `docs/nas-resource-limits-assessment.md` | **新** | 资源限制评估报告 |

---

## 七、验证记录

### 7.1 本地（2026-10-22，交付前）

| 项 | 结果 |
|---|---|
| 10 个 shell 脚本 `bash -n` | 全 OK |
| container-backup.sh / restore-test.sh `dash -n`（POSIX sh 兼容） | 全 OK |
| mysql-entrypoint.sh 算术模拟（7708/2048/1024/512/128MB、0KB、env 覆盖） | 钳制与回退全部正确 |
| docker-compose.synology.yml YAML 解析 + 结构断言 | OK（entrypoint/logging/volumes 均符合预期） |
| 全部改动文件行结尾 | LF（无 CRLF） |
| 前端 CSP 兼容性 grep（内联脚本/iframe/内联事件/javascript:） | 无命中 |
| 后端 jest 全量 | 不涉及后端代码，无需重跑（本次零后端改动） |

### 7.2 NAS 部署验证（部署后补记）

- [ ] `nginx -t` 预检（一次性容器挂载新 conf）
- [ ] deploy.sh 全量部署 12 步通过、冒烟 OK
- [ ] mysql 容器以新入口启动，`SHOW VARIABLES LIKE 'innodb_buffer_pool_size'` = 1073741824
- [ ] `docker exec huakey-backup sh /container-backup.sh --once` 三合一成功，
      config 产物为 `.gpg` 密文且解密回验通过
- [ ] `docker exec huakey-backup bash /restore-test.sh` 手动演练 RESULT=PASS
- [ ] `restore-drill.status` 生成且内容正确

---

## 八、遗留事项

1. **offsite 副本未落地**（第四节评估推荐 Hyper Backup → 第二盘位）——
   需 David 在 DSM 侧配置，仓库侧只能提供加密后的产物。
2. 宿主机 cron 不可写：月度演练以容器调度器为准；如 David 能以 root 执行
   `install-restore-drill.sh install`，可改走宿主 cron（二选一）。
3. 备份加密口令 `.backup-enc-pass` 首次由 deploy.sh 生成——**生成后请离线
   保管**，丢失后历史加密 config 备份不可恢复。
4. DSM 层 nginx 反代配置不在任何备份范围内（容器外），恢复方式见
   `docs/crm-v1-internal-domain-deployment.md`。

# deploy/cron — 宿主机定时任务载体

本目录存放需要 root 权限安装到 NAS 宿主机的定时任务脚本。

| 文件 | 作用 | 安装方式 |
|---|---|---|
| `install-restore-drill.sh` | 恢复演练月 cron（每月 1 日 03:00 还原最新 MySQL 备份到临时库验证） | root 执行 `bash install-restore-drill.sh install` |

## 本 NAS 的实际执行机制（2026-10-22）

`/etc/cron.d` 对部署账号（syadmin）不可写，sudo 仅白名单 `/usr/local/bin/docker`，
因此生产 NAS 上恢复演练由 **huakey-backup 容器内调度器** 执行
（`deploy/backup/container-backup.sh` 的 `maybe_run_drill`，每月 1 日 03:00，
带状态文件幂等与 timeout 兜底）。`install-restore-drill.sh` 是 root 环境的等价载体，
两种机制效果相同，**不要同时启用**（演练有并发锁，但没必要叠加）。

## 执行结果检查

```bash
# 机器可读状态（RESULT=PASS/FAIL）
cat /volume1/docker/crm-stack/database/backups/restore-drill.status
# 完整日志
tail -50 /volume1/docker/crm-stack/database/backups/restore-test.log
# 容器调度器视角
tail -50 /volume1/docker/crm-stack/database/backups/container-backup.log
```

## 手动触发

```bash
# 宿主机（有 docker 权限）
bash /volume1/docker/crm-stack/deploy/backup/restore-test.sh
# 或容器内
docker exec huakey-backup bash /restore-test.sh
```

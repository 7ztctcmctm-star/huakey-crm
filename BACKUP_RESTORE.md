# 铧旗 CRM 数据备份与恢复

## 文件说明

| 文件 | 作用 |
|---|---|
| [database/backup.sh](database/backup.sh) | MySQL 自动备份脚本 |
| [database/restore.sh](database/restore.sh) | MySQL 备份恢复脚本 |
| [deploy/synology/docker-compose.synology.yml](deploy/synology/docker-compose.synology.yml) | 群晖 NAS 部署配置（已挂载 `./database/backups:/backups`） |

## 环境变量

脚本支持以下环境变量，未设置时使用默认值：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MYSQL_ROOT_PASSWORD` | `huakey123` | MySQL root 密码 |
| `BACKUP_DIR` | `/backups` | 备份文件存放目录 |
| `DATABASE` | `huakey_crm` | 数据库名 |
| `KEEP_DAYS` | `30` | 备份保留天数 |

## 手动备份

### 方式一：在宿主机直接执行（需已安装 MySQL Client）

```bash
cd /path/to/huakey-crm
export MYSQL_ROOT_PASSWORD=huakey123
export BACKUP_DIR=./database/backups
./database/backup.sh
```

### 方式二：在 MySQL 容器内执行（推荐群晖环境）

```bash
# 进入容器
docker exec -it huakey-mysql /bin/bash

# 执行备份（容器内 /backups 已挂载到宿主机的 ./database/backups）
/backups/backup.sh

# 退出容器
exit
```

备份文件会生成在 `./database/backups/`，文件名格式：

```
huakey_crm_YYYYMMDD_HHMMSS.sql.gz
```

## 手动恢复

### 在 MySQL 容器内执行

```bash
# 进入容器
docker exec -it huakey-mysql /bin/bash

# 执行恢复，传入备份文件路径
/backups/restore.sh /backups/huakey_crm_20260115_030000.sql.gz

# 退出容器
exit
```

> 注意：恢复会覆盖当前数据库。执行前请确认已备份当前数据，或目标数据库可接受覆盖。

## Synology DSM 任务计划配置（自动备份）

1. 打开 **DSM → 控制面板 → 任务计划 → 新增 → 计划的任务 → 用户定义的脚本**
2. 常规：
   - 任务名称：`huakey-crm-backup`
   - 用户账号：`root`
3. 计划：
   - 按需求设置执行频率，例如：每天 `03:00`
4. 任务设置：
   - 勾选「通过电子邮件发送运行详情」（可选）
   - 用户定义的脚本：

```bash
#!/bin/bash
cd /volume1/docker/huakey-crm
/usr/local/bin/docker exec huakey-mysql /bin/bash -c '/backups/backup.sh'
```

> 说明：请将 `/volume1/docker/huakey-crm` 替换为项目实际存放路径。

5. 保存并运行一次测试，检查 `./database/backups/` 是否生成备份文件。

## 备份保留策略

`backup.sh` 默认清理 **30 天前** 的 `.sql.gz` 备份文件。如需调整，可修改 `docker-compose.synology.yml` 中 MySQL 服务的 `environment`，增加 `KEEP_DAYS` 变量：

```yaml
environment:
  MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
  MYSQL_DATABASE: huakey_crm
  MYSQL_USER: crm_user
  MYSQL_PASSWORD: ${MYSQL_PASSWORD}
  KEEP_DAYS: 7
```

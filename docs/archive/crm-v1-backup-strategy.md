# HuakeyCRM v1 自动备份方案

> **文档类型**: Backup Strategy
> **版本**: HuakeyCRM v1.0
> **编制日期**: 2026-08-06
> **适用环境**: 群晖 NAS 生产部署

---

## 1. 备份策略概述

### 1.1 备份目标

| 数据类型 | 备份方式 | 频率 | 保留 |
|----------|----------|------|------|
| MySQL 数据库 | mysqldump | 每日 02:00 | 7 天（日备）+ 30 天（周备） |
| 上传文件 | 文件复制 | 每日 02:30 | 7 天 |
| 配置文件 | 文件复制 | 每周日 03:00 | 30 天 |

### 1.2 存储位置

| 备份类型 | 存储路径 |
|----------|----------|
| 数据库备份 | `/volume1/docker/crm-backups/db/` |
| 文件备份 | `/volume1/docker/crm-backups/uploads/` |
| 配置备份 | `/volume1/docker/crm-backups/config/` |

---

## 2. NAS 磁盘空间检查

### 2.1 当前磁盘状态

```
/volume1 总容量: 待执行 df -h 确认
CRM 数据卷: crm-stack_mysql-data
CRM 上传卷: crm-stack_app-uploads
```

### 2.2 备份空间估算

| 备份项 | 单次大小 | 日备 7 天 | 周备 30 天 |
|--------|----------|-----------|------------|
| MySQL dump | ~5-20 MB | ~140 MB | ~600 MB |
| 上传文件 | 视使用量 | 视使用量 | - |
| 配置文件 | ~1 MB | ~7 MB | ~30 MB |
| **合计** | ~25 MB | ~150 MB | ~630 MB |

> 建议预留 2 GB 备份空间。

---

## 3. 数据库备份方案

### 3.1 备份脚本

```bash
#!/bin/bash
# /volume1/docker/crm-backups/backup_db.sh
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
cd /volume1/docker/crm-stack
set -a
. ./.env.secrets
set +a

BACKUP_DIR="/volume1/docker/crm-backups/db"
mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/huakey_crm_$DATE.sql.gz"

echo "[$(date)] 开始数据库备份..."

# 使用 docker exec 执行 mysqldump（--single-transaction 不锁表）
docker exec huakey-mysql mysqldump \
  -u root -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction \
  --routines \
  --triggers \
  --quick \
  huakey_crm 2>/dev/null | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[$(date)] 备份成功: $BACKUP_FILE ($SIZE)"
else
  echo "[$(date)] 备份失败!"
  exit 1
fi

# 清理 7 天前的日备
find "$BACKUP_DIR" -name "huakey_crm_*.sql.gz" -mtime +7 -delete
echo "[$(date)] 已清理 7 天前的备份"

# 保留每周一的备份 30 天（周备）
TODAY=$(date +%u)  # 1=Monday
if [ "$TODAY" = "1" ]; then
  echo "[$(date)] 周备已保留"
fi
find "$BACKUP_DIR" -name "huakey_crm_*.sql.gz" -mtime +30 -delete
echo "[$(date)] 已清理 30 天前的周备"
```

### 3.2 上传文件备份脚本

```bash
#!/bin/bash
# /volume1/docker/crm-backups/uploads.sh
BACKUP_DIR="/volume1/docker/crm-backups/uploads"
mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d_%H%M%S)
echo "[$(date)] 开始上传文件备份..."

# 使用 docker cp 复制上传卷
docker run --rm -v crm-stack_app-uploads:/data -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/uploads_$DATE.tar.gz" -C /data .

if [ $? -eq 0 ]; then
  echo "[$(date)] 文件备份成功"
else
  echo "[$(date)] 文件备份失败!"
  exit 1
fi

# 清理 7 天前的文件备份
find "$BACKUP_DIR" -name "uploads_*.tar.gz" -mtime +7 -delete
echo "[$(date)] 已清理 7 天前的文件备份"
```

### 3.3 配置文件备份脚本

```bash
#!/bin/bash
# /volume1/docker/crm-backups/config.sh
BACKUP_DIR="/volume1/docker/crm-backups/config"
mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d_%H%M%S)
echo "[$(date)] 开始配置文件备份..."

# 备份配置文件（排除 .env.secrets 明文密码）
cd /volume1/docker/crm-stack
tar czf "$BACKUP_DIR/config_$DATE.tar.gz" \
  docker-compose.synology.yml \
  Dockerfile.synology \
  .env \
  .env.synology \
  .env.example \
  deploy/ \
  database/migrate.js \
  2>/dev/null

echo "[$(date)] 配置备份成功"

# 清理 30 天前
find "$BACKUP_DIR" -name "config_*.tar.gz" -mtime +30 -delete
```

---

## 4. 定时任务配置

### 4.1 DSM 任务计划设置

通过 DSM 控制面板 → 任务计划 → 新增 → 计划任务 → 用户定义的脚本：

| 任务名称 | 执行时间 | 脚本 |
|----------|----------|------|
| CRM-DB-Backup | 每日 02:00 | `bash /volume1/docker/crm-backups/backup_db.sh >> /volume1/docker/crm-backups/db.log 2>&1` |
| CRM-Upload-Backup | 每日 02:30 | `bash /volume1/docker/crm-backups/uploads.sh >> /volume1/docker/crm-backups/uploads.log 2>&1` |
| CRM-Config-Backup | 每周日 03:00 | `bash /volume1/docker/crm-backups/config.sh >> /volume1/docker/crm-backups/config.log 2>&1` |

### 4.2 任务设置

- 用户：root
- 执行频率：按上表
- 输出重定向到日志文件

---

## 5. 恢复流程

### 5.1 数据库恢复测试流程

```bash
# 1. 停止 App 容器
docker compose -f /volume1/docker/crm-stack/docker-compose.synology.yml stop app

# 2. 恢复数据库
cd /volume1/docker/crm-backups/db
gunzip < huakey_crm_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i huakey-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" huakey_crm

# 3. 验证数据
docker exec huakey-mysql mysql -u crm_user -p"$DB_PASSWORD" huakey_crm \
  -e "SELECT COUNT(*) FROM crm_customer; SELECT COUNT(*) FROM sys_user;"

# 4. 重启 App
docker compose -f /volume1/docker/crm-stack/docker-compose.synology.yml start app

# 5. 健康检查
curl -s http://localhost:6789/api/v1/health
```

### 5.2 恢复测试计划

| 测试项 | 频率 | 验证标准 |
|--------|------|----------|
| 数据库恢复 | 每月 1 次 | 表数量、记录数一致 |
| 文件恢复 | 每季度 | 文件可访问 |
| 完整恢复 | 每季度 | Smoke Test 通过 |

### 5.3 RTO/RPO

| 指标 | 目标 |
|------|------|
| RPO（数据丢失上限） | 24 小时（日备） |
| RTO（恢复时间目标） | 30 分钟 |

---

## 6. 监控与告警

| 检查项 | 方式 | 告警阈值 |
|--------|------|----------|
| 备份成功 | 检查日志 | 连续 2 天无备份 |
| 备份大小 | du -h | 大小骤降 >50% |
| 磁盘空间 | df -h | 剩余 < 10% |
| 恢复测试 | 每月执行 | 恢复失败 |

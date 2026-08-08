# HuakeyCRM v1 自动备份实现计划

> **文档类型**: Backup Implementation Plan
> **版本**: HuakeyCRM v1.0
> **编制日期**: 2026-08-06
> **适用环境**: 群晖 NAS 生产部署

---

## 1. 备份策略

### 1.1 备份目标

| 数据类型 | 备份方式 | 频率 | 保留 | RPO |
|----------|----------|------|------|-----|
| MySQL 数据库 | mysqldump | 每日 02:00 | 7 天日备 + 4 周周备 | 24h |
| 上传文件 | 文件复制 | 每日 02:30 | 7 天 | 24h |
| 配置文件 | 文件复制 | 每周日 03:00 | 4 周 | 7d |

### 1.2 存储位置

```
/volume1/docker/crm-backups/
  ├── db/              # MySQL 备份
  │   ├── daily/       # 日备（保留 7 天）
  │   └── weekly/      # 周备（保留 4 周）
  ├── uploads/         # 上传文件备份
  ├── config/          # 配置备份
  └── logs/            # 备份日志
```

---

## 2. 备份脚本

### 2.1 MySQL 每日备份脚本

**文件**: `/volume1/docker/crm-backups/scripts/backup_db.sh`

```bash
#!/bin/bash
# MySQL 每日备份脚本
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
cd /volume1/docker/crm-stack
set -a
. ./.env.secrets
set +a

BACKUP_BASE="/volume1/docker/crm-backups"
DAILY_DIR="$BACKUP_BASE/db/daily"
WEEKLY_DIR="$BACKUP_BASE/db/weekly"
LOG_FILE="$BACKUP_BASE/logs/backup_db.log"

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR" "$BACKUP_BASE/logs"

DATE=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday
BACKUP_FILE="huakey_crm_$DATE.sql.gz"

echo "[$(date)] === 开始 MySQL 备份 ===" | tee -a "$LOG_FILE"

# 使用 docker exec 执行 mysqldump（--single-transaction 不锁表）
docker exec huakey-mysql mysqldump \
  -u root -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction \
  --routines \
  --triggers \
  --quick \
  huakey_crm 2>>"$LOG_FILE" | gzip > "$DAILY_DIR/$BACKUP_FILE"

if [ $? -eq 0 ] && [ -s "$DAILY_DIR/$BACKUP_FILE" ]; then
  SIZE=$(du -h "$DAILY_DIR/$BACKUP_FILE" | cut -f1)
  echo "[$(date)] ✅ 日备成功: $DAILY_DIR/$BACKUP_FILE ($SIZE)" | tee -a "$LOG_FILE"

  # 每周日复制到周备目录
  if [ "$DAY_OF_WEEK" = "7" ]; then
    cp "$DAILY_DIR/$BACKUP_FILE" "$WEEKLY_DIR/"
    echo "[$(date)] 📦 周备已复制: $WEEKLY_DIR/$BACKUP_FILE" | tee -a "$LOG_FILE"
  fi
else
  echo "[$(date)] ❌ 备份失败!" | tee -a "$LOG_FILE"
  exit 1
fi

# 清理 7 天前的日备
find "$DAILY_DIR" -name "huakey_crm_*.sql.gz" -mtime +7 -delete
echo "[$(date)] 🧹 已清理 7 天前的日备" | tee -a "$LOG_FILE"

# 清理 4 周前的周备
find "$WEEKLY_DIR" -name "huakey_crm_*.sql.gz" -mtime +28 -delete
echo "[$(date)] 🧹 已清理 4 周前的周备" | tee -a "$LOG_FILE"

echo "[$(date)] === 备份完成 ===" | tee -a "$LOG_FILE"
```

### 2.2 上传文件备份脚本

**文件**: `/volume1/docker/crm-backups/scripts/backup_uploads.sh`

```bash
#!/bin/bash
# 上传文件备份脚本
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

BACKUP_BASE="/volume1/docker/crm-backups"
UPLOADS_DIR="$BACKUP_BASE/uploads"
LOG_FILE="$BACKUP_BASE/logs/backup_uploads.log"

mkdir -p "$UPLOADS_DIR" "$BACKUP_BASE/logs"

DATE=$(date +%Y%m%d_%H%M%S)
echo "[$(date)] === 开始上传文件备份 ===" | tee -a "$LOG_FILE"

# 使用临时容器复制卷内容
docker run --rm \
  -v crm-stack_app-uploads:/data:ro \
  -v "$UPLOADS_DIR":/backup \
  alpine tar czf "/backup/uploads_$DATE.tar.gz" -C /data . 2>>"$LOG_FILE"

if [ $? -eq 0 ]; then
  SIZE=$(du -h "$UPLOADS_DIR/uploads_$DATE.tar.gz" | cut -f1)
  echo "[$(date)] ✅ 文件备份成功: uploads_$DATE.tar.gz ($SIZE)" | tee -a "$LOG_FILE"
else
  echo "[$(date)] ❌ 文件备份失败!" | tee -a "$LOG_FILE"
  exit 1
fi

# 清理 7 天前
find "$UPLOADS_DIR" -name "uploads_*.tar.gz" -mtime +7 -delete
echo "[$(date)] 🧹 已清理 7 天前的文件备份" | tee -a "$LOG_FILE"
```

### 2.3 配置文件备份脚本

**文件**: `/volume1/docker/crm-backups/scripts/backup_config.sh`

```bash
#!/bin/bash
# 配置文件备份脚本（排除 .env.secrets 明文密码）
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

BACKUP_BASE="/volume1/docker/crm-backups"
CONFIG_DIR="$BACKUP_BASE/config"
LOG_FILE="$BACKUP_BASE/logs/backup_config.log"

mkdir -p "$CONFIG_DIR" "$BACKUP_BASE/logs"

DATE=$(date +%Y%m%d_%H%M%S)
echo "[$(date)] === 开始配置文件备份 ===" | tee -a "$LOG_FILE"

cd /volume1/docker/crm-stack
tar czf "$CONFIG_DIR/config_$DATE.tar.gz" \
  docker-compose.synology.yml \
  Dockerfile.synology \
  .env \
  .env.synology \
  .env.example \
  deploy/ \
  database/migrate.js \
  2>>"$LOG_FILE"

if [ $? -eq 0 ]; then
  echo "[$(date)] ✅ 配置备份成功: config_$DATE.tar.gz" | tee -a "$LOG_FILE"
else
  echo "[$(date)] ❌ 配置备份失败!" | tee -a "$LOG_FILE"
  exit 1
fi

# 清理 4 周前
find "$CONFIG_DIR" -name "config_*.tar.gz" -mtime +28 -delete
echo "[$(date)] 🧹 已清理 4 周前的配置备份" | tee -a "$LOG_FILE"
```

---

## 3. DSM 任务计划配置

### 3.1 创建任务

通过 DSM 控制面板 → 任务计划 → 新增 → 计划任务 → 用户定义的脚本：

| 任务名称 | 执行时间 | 用户 | 脚本 |
|----------|----------|------|------|
| CRM-DB-Backup | 每日 02:00 | root | `bash /volume1/docker/crm-backups/scripts/backup_db.sh` |
| CRM-Upload-Backup | 每日 02:30 | root | `bash /volume1/docker/crm-backups/scripts/backup_uploads.sh` |
| CRM-Config-Backup | 每周日 03:00 | root | `bash /volume1/docker/crm-backups/scripts/backup_config.sh` |

### 3.2 空间估算

| 备份项 | 单次大小 | 7 天日备 | 4 周周备 | 合计 |
|--------|----------|----------|----------|------|
| MySQL dump | ~10 MB | ~70 MB | ~40 MB | ~110 MB |
| 上传文件 | ~5 MB | ~35 MB | - | ~35 MB |
| 配置文件 | ~1 MB | ~7 MB | ~4 MB | ~11 MB |
| **合计** | ~16 MB | ~112 MB | ~44 MB | **~156 MB** |

> 建议预留 2 GB 备份空间。

---

## 4. 恢复流程

### 4.1 数据库恢复

```bash
#!/bin/bash
# 恢复步骤
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
cd /volume1/docker/crm-stack
set -a
. ./.env.secrets
set +a

# 1. 停止 App 容器（避免恢复期间写入）
docker compose -f docker-compose.synology.yml stop app

# 2. 选择备份文件
BACKUP_FILE="/volume1/docker/crm-backups/db/daily/huakey_crm_YYYYMMDD_020000.sql.gz"

# 3. 恢复数据库
gunzip < "$BACKUP_FILE" | \
  docker exec -i huakey-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" huakey_crm

# 4. 验证数据
docker exec huakey-mysql mysql -u crm_user -p"$DB_PASSWORD" huakey_crm \
  -e "SELECT COUNT(*) AS users FROM sys_user; SELECT COUNT(*) AS customers FROM crm_customer;"

# 5. 重启 App
docker compose -f docker-compose.synology.yml start app

# 6. 健康检查
sleep 10
curl -s http://localhost:6789/api/v1/health
```

### 4.2 恢复测试流程（Restore Test）

| 步骤 | 操作 | 验证标准 |
|------|------|----------|
| 1 | 选择最近一个日备 | 文件存在且大小正常 |
| 2 | 停止 App 容器 | 容器状态为 exited |
| 3 | 恢复到临时数据库 | `huakey_crm_restore_test` |
| 4 | 验证表数量 | 104 张表 |
| 5 | 验证用户数据 | admin 用户存在 |
| 6 | 验证业务数据 | 记录数一致 |
| 7 | 清理测试数据库 | DROP DATABASE |
| 8 | 重启 App | 健康检查 200 |

### 4.3 恢复测试脚本

```bash
#!/bin/bash
# 恢复测试脚本（每月执行）
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
cd /volume1/docker/crm-stack
set -a
. ./.env.secrets
set +a

TEST_DB="huakey_crm_restore_test"
BACKUP_FILE=$(ls -t /volume1/docker/crm-backups/db/daily/huakey_crm_*.sql.gz | head -1)

echo "[$(date)] 恢复测试: $BACKUP_FILE"

# 创建测试数据库
docker exec huakey-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" \
  -e "DROP DATABASE IF EXISTS $TEST_DB; CREATE DATABASE $TEST_DB DEFAULT CHARACTER SET utf8mb4;"

# 恢复到测试库
gunzip < "$BACKUP_FILE" | \
  docker exec -i huakey-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" $TEST_DB

# 验证
TABLE_COUNT=$(docker exec huakey-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" $TEST_DB \
  -sN -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$TEST_DB'")
USER_COUNT=$(docker exec huakey-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" $TEST_DB \
  -sN -e "SELECT COUNT(*) FROM sys_user")

echo "表数量: $TABLE_COUNT (期望 104)"
echo "用户数: $USER_COUNT"

if [ "$TABLE_COUNT" -ge 100 ] && [ "$USER_COUNT" -ge 1 ]; then
  echo "[$(date)] ✅ 恢复测试 PASS"
else
  echo "[$(date)] ❌ 恢复测试 FAIL"
fi

# 清理
docker exec huakey-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" \
  -e "DROP DATABASE $TEST_DB"
echo "[$(date)] 测试库已清理"
```

### 4.4 RTO/RPO

| 指标 | 目标 | 说明 |
|------|------|------|
| RPO | 24 小时 | 日备频率 |
| RTO | 30 分钟 | 恢复时间 |

---

## 5. 备份验证清单

| 检查项 | 频率 | 方法 |
|--------|------|------|
| 备份文件存在 | 每日 | 检查 db/daily/ 目录 |
| 备份文件大小 | 每日 | > 1KB（非空） |
| 备份完整性 | 每周 | gunzip -t 测试解压 |
| 恢复测试 | 每月 | 执行恢复测试脚本 |
| 磁盘空间 | 每日 | df -h /volume1 |
| 日志检查 | 每日 | 检查 backup_db.log |

#!/bin/bash
# ============================================
# 铧旗CRM 数据库自动备份脚本
# 部署位置：NAS /volume1/docker/crm-stack/backup.sh
# 执行方式：群晖任务计划 每日 03:00
# 保留策略：每日备份保留 7 天，每周备份保留 4 周
# ============================================

set -euo pipefail

# 加载环境变量
export PATH=/usr/local/bin:/usr/bin:/bin
source /volume1/docker/crm-stack/.env.secrets

# 配置
BACKUP_DIR="/volume1/docker/crm-backups"
DB_NAME="huakey_crm"
DATE_DAILY=$(date +%Y%m%d)
DATE_WEEKLY=$(date +%Y%m%d_weekly)
WEEKDAY=$(date +%u)  # 1=Monday, 7=Sunday

# 创建备份目录
mkdir -p "$BACKUP_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始备份数据库 $DB_NAME"

# 执行备份（通过 docker exec 调用容器内 mysqldump）
BACKUP_FILE="$BACKUP_DIR/huakey_crm_${DATE_DAILY}.sql.gz"
docker exec huakey-mysql mysqldump \
  -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --default-character-set=utf8mb4 \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  "$DB_NAME" 2>/dev/null | gzip > "$BACKUP_FILE"

# 验证备份文件
if [ ! -s "$BACKUP_FILE" ]; then
  echo "[ERROR] 备份文件为空，备份失败！"
  exit 1
fi

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 每日备份完成: $BACKUP_FILE ($FILE_SIZE)"

# 每周日额外创建周备份（保留 4 周）
if [ "$WEEKDAY" = "7" ]; then
  WEEKLY_FILE="$BACKUP_DIR/huakey_crm_${DATE_WEEKLY}.sql.gz"
  cp "$BACKUP_FILE" "$WEEKLY_FILE"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 周备份完成: $WEEKLY_FILE"
fi

# 清理过期备份：每日备份保留 7 天
find "$BACKUP_DIR" -name "huakey_crm_*_weekly.sql.gz" -prune -o -name "huakey_crm_*.sql.gz" -mtime +7 -exec rm -f {} \;
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 已清理 7 天前的每日备份"

# 清理过期周备份：保留 4 周（28 天）
find "$BACKUP_DIR" -name "huakey_crm_*_weekly.sql.gz" -mtime +28 -exec rm -f {} \;
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 已清理 4 周前的周备份"

# 列出当前备份
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 当前备份文件列表:"
ls -lh "$BACKUP_DIR"/huakey_crm_*.sql.gz 2>/dev/null || echo "  (无)"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 备份流程完成"

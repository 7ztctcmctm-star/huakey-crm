#!/bin/bash
set -e

# 默认值：可在 docker-compose 环境变量或宿主机环境变量中覆盖
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-huakey123}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DATABASE="${DATABASE:-huakey_crm}"
KEEP_DAYS="${KEEP_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

FILENAME="huakey_crm_$(date +%Y%m%d_%H%M%S).sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${FILENAME}"

echo "[backup] Starting backup of ${DATABASE}..."
mysqldump -h mysql -u root -p"${MYSQL_ROOT_PASSWORD}" \
  --single-transaction --routines --triggers --events \
  "$DATABASE" | gzip > "$BACKUP_PATH"

echo "[backup] Backup created: $BACKUP_PATH"

# 清理过期备份
echo "[backup] Cleaning up backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -maxdepth 1 -type f -name "*.sql.gz" -mtime +"$KEEP_DAYS" -delete

echo "[backup] Done"

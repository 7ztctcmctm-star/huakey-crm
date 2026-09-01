#!/bin/bash
# ============================================================
# HuakeyCRM MySQL 自动备份脚本
#
# 执行方式：NAS 宿主机 DSM 任务计划（每日凌晨 2:00）
# 备份方式：docker exec huakey-mysql mysqldump（不依赖 backup 容器）
# 密码来源：.env.secrets（禁止硬编码）
# 保留策略：7 天每日备份 + 4 周周备份
# ============================================================
set -eu

# ---- 配置 ----
STACK_DIR="/volume1/docker/crm-stack"
SECRETS_FILE="${STACK_DIR}/.env.secrets"
ENV_FILE="${STACK_DIR}/.env"
BACKUP_DIR="${STACK_DIR}/database/backups"
LOG_FILE="${STACK_DIR}/database/backups/backup.log"
MYSQL_CONTAINER="huakey-mysql"
DATABASE="huakey_crm"

# 保留策略
KEEP_DAILY_DAYS=7      # 每日备份保留 7 天
KEEP_WEEKLY_WEEKS=4    # 周备份保留 4 周（28 天）

# ---- 日志函数 ----
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ---- 读取密码（不硬编码）----
# 优先从 .env.secrets 读取，回退到 .env
# 使用 source 直接加载（兼容密码中的特殊字符如 $ # * @）
# 注意：source 必须在主脚本作用域执行，不能放在函数内（否则变量为局部）
if [ -f "$SECRETS_FILE" ]; then
  SECRETS_SOURCE="$SECRETS_FILE"
elif [ -f "$ENV_FILE" ]; then
  SECRETS_SOURCE="$ENV_FILE"
else
  echo "FATAL: .env.secrets 和 .env 均不存在" >&2
  exit 1
fi

# ---- 创建备份目录 ----
mkdir -p "$BACKUP_DIR"
touch "$LOG_FILE"

log "=========================================="
log "HuakeyCRM MySQL 备份开始"
log "=========================================="

# ---- 加载密码（在主作用域 source，确保变量全局可用）----
set +u
# shellcheck disable=SC1090
. "$SECRETS_SOURCE"
set -u
if [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
  log "FATAL: MYSQL_ROOT_PASSWORD 未找到（来源: $SECRETS_SOURCE）"
  exit 1
fi
log "密码加载: 成功（来源: $SECRETS_SOURCE）"

# ---- 检查 MySQL 容器运行状态 ----
if ! /usr/local/bin/docker ps --filter "name=${MYSQL_CONTAINER}" --filter "status=running" | grep -q "$MYSQL_CONTAINER"; then
  log "FATAL: MySQL 容器 ${MYSQL_CONTAINER} 未运行"
  exit 1
fi
log "MySQL 容器: 运行中"

# ---- 生成每日备份 ----
DAILY_DATE=$(date '+%Y%m%d')
DAILY_FILENAME="${DATABASE}_${DAILY_DATE}.sql.gz"
DAILY_PATH="${BACKUP_DIR}/${DAILY_FILENAME}"

log "开始每日备份: $DAILY_FILENAME"

# 使用 docker exec 调用容器内 mysqldump，管道到宿主机 gzip
# 临时关闭 set -e 以捕获管道退出码（mysqldump 的 password warning 不影响退出码）
set +e
/usr/local/bin/docker exec "$MYSQL_CONTAINER" \
  mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --quick \
  --no-tablespaces \
  "$DATABASE" 2>>"$LOG_FILE" | gzip > "$DAILY_PATH"
DUMP_EXIT=${PIPESTATUS[0]}
set -e

if [ "$DUMP_EXIT" -eq 0 ]; then

  # 验证备份文件非空
  BACKUP_SIZE=$(stat -c%s "$DAILY_PATH" 2>/dev/null || stat -f%z "$DAILY_PATH" 2>/dev/null || echo 0)
  if [ "$BACKUP_SIZE" -lt 100 ]; then
    log "FATAL: 备份文件过小（${BACKUP_SIZE} bytes），可能失败"
    rm -f "$DAILY_PATH"
    exit 1
  fi

  # 完整性校验：解压测试 + 表计数
  TABLE_COUNT=$(zcat "$DAILY_PATH" 2>/dev/null | grep -c "^CREATE TABLE" || echo 0)
  log "每日备份完成: ${DAILY_FILENAME} (${BACKUP_SIZE} bytes, ${TABLE_COUNT} 表)"
else
  log "FATAL: mysqldump 失败"
  rm -f "$DAILY_PATH"
  exit 1
fi

# ---- 周备份（每周日生成额外副本）----
WEEKDAY=$(date '+%u')  # 1=周一, 7=周日
if [ "$WEEKDAY" = "7" ]; then
  WEEK_NUM=$(date '+%Y-W%V')
  WEEKLY_FILENAME="${DATABASE}_weekly_${WEEK_NUM}.sql.gz"
  WEEKLY_PATH="${BACKUP_DIR}/${WEEKLY_FILENAME}"

  cp "$DAILY_PATH" "$WEEKLY_PATH"
  log "周备份创建: ${WEEKLY_FILENAME}（每周日）"
fi

# ---- 清理过期备份 ----
log "清理过期备份..."

# 清理每日备份：保留最近 7 天
DELETED_DAILY=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DATABASE}_*.sql.gz" \
  ! -name "${DATABASE}_weekly_*" \
  -mtime +"$KEEP_DAILY_DAYS" -delete -print 2>/dev/null | wc -l || echo 0)
log "清理每日备份: 删除 ${DELETED_DAILY} 个过期文件"

# 清理周备份：保留最近 28 天（4 周）
DELETED_WEEKLY=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DATABASE}_weekly_*.sql.gz" \
  -mtime +"$((KEEP_WEEKLY_WEEKS * 7))" -delete -print 2>/dev/null | wc -l || echo 0)
log "清理周备份: 删除 ${DELETED_WEEKLY} 个过期文件"

# ---- 清理旧的空备份文件（20 bytes 的失败备份）----
CLEANED_EMPTY=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DATABASE}_*.sql.gz" \
  -size -100c -delete -print 2>/dev/null | wc -l || echo 0)
if [ "$CLEANED_EMPTY" -gt 0 ]; then
  log "清理空备份文件: 删除 ${CLEANED_EMPTY} 个无效文件"
fi

# ---- 当前备份文件列表 ----
log "当前备份文件:"
find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DATABASE}_*.sql.gz" -printf "%f %s bytes\n" 2>/dev/null | sort | while read -r line; do
  log "  $line"
done

log "=========================================="
log "备份完成"
log "=========================================="

#!/bin/bash
# ============================================================
# HuakeyCRM 文件备份脚本 (app-uploads Docker Volume)
#
# 执行方式：NAS 宿主机 DSM 任务计划（每日凌晨 02:30）
# 备份方式：tar.gz 打包 Docker named volume
# 备份对象：crm-stack_app-uploads (/app/uploads)
# 保留策略：7 天每日备份
# ============================================================
set -eu

# ---- 配置 ----
STACK_DIR="/volume1/docker/crm-stack"
BACKUP_DIR="${STACK_DIR}/database/backups/uploads"
LOG_FILE="${STACK_DIR}/database/backups/uploads-backup.log"
VOLUME_NAME="crm-stack_app-uploads"
APP_CONTAINER="huakey-app"
BACKUP_PREFIX="uploads"

# 保留策略
KEEP_DAILY_DAYS=7      # 每日备份保留 7 天

# 空间检查阈值（单位 MB）：可用空间低于此值则中止备份
MIN_FREE_MB=500

# ---- 日志函数 ----
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ---- 创建备份目录 ----
mkdir -p "$BACKUP_DIR"
touch "$LOG_FILE"

log "=========================================="
log "HuakeyCRM 文件备份开始 (app-uploads)"
log "=========================================="

# ---- 检查 Docker 可用 ----
if ! command -v /usr/local/bin/docker >/dev/null 2>&1; then
  log "FATAL: docker 命令不可用"
  exit 1
fi

# ---- 检查 app 容器运行状态 ----
if ! /usr/local/bin/docker ps --filter "name=${APP_CONTAINER}" --filter "status=running" | grep -q "$APP_CONTAINER"; then
  log "FATAL: 应用容器 ${APP_CONTAINER} 未运行"
  exit 1
fi
log "应用容器: 运行中"

# ---- 自动发现 volume 挂载路径 ----
VOLUME_PATH=$(/usr/local/bin/docker volume inspect "$VOLUME_NAME" --format '{{.Mountpoint}}' 2>/dev/null)
if [ -z "$VOLUME_PATH" ]; then
  log "FATAL: 无法发现 volume ${VOLUME_NAME} 的挂载路径"
  exit 1
fi
log "Volume: ${VOLUME_NAME} -> ${VOLUME_PATH}"

if [ ! -d "$VOLUME_PATH" ]; then
  log "FATAL: volume 路径不存在: ${VOLUME_PATH}"
  exit 1
fi

# ---- 磁盘空间检查 ----
AVAILABLE_MB=$(df -m "${STACK_DIR}" | awk 'NR==2 {print $4}')
if [ "$AVAILABLE_MB" -lt "$MIN_FREE_MB" ]; then
  log "FATAL: 磁盘可用空间不足（当前 ${AVAILABLE_MB}MB < 阈值 ${MIN_FREE_MB}MB）"
  exit 1
fi
log "磁盘空间: 可用 ${AVAILABLE_MB}MB"

# ---- 统计源文件 ----
FILE_COUNT=$(find "$VOLUME_PATH" -type f 2>/dev/null | wc -l | tr -d ' ')
SOURCE_SIZE=$(du -sh "$VOLUME_PATH" 2>/dev/null | cut -f1)
log "源文件统计: ${FILE_COUNT} 个文件, 总大小 ${SOURCE_SIZE}"

# ---- 生成备份文件名 ----
BACKUP_DATE=$(date '+%Y%m%d')
BACKUP_FILENAME="${BACKUP_PREFIX}_${BACKUP_DATE}.tar.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

log "备份文件: ${BACKUP_FILENAME}"

# ---- 执行备份（tar.gz 打包）----
# 使用 tar 打包 volume 路径，保留权限和符号链接
set +e
tar -czf "$BACKUP_PATH" \
  -C "$VOLUME_PATH" \
  --exclude='*.tmp' \
  --exclude='*.lock' \
  . 2>>"$LOG_FILE"
TAR_EXIT=$?
set -e

if [ "$TAR_EXIT" -ne 0 ]; then
  log "FATAL: tar 打包失败 (exit code: ${TAR_EXIT})"
  rm -f "$BACKUP_PATH"
  exit 1
fi

# ---- 验证备份文件 ----
BACKUP_SIZE=$(stat -c%s "$BACKUP_PATH" 2>/dev/null || stat -f%z "$BACKUP_PATH" 2>/dev/null || echo 0)
if [ "$BACKUP_SIZE" -lt 100 ]; then
  log "FATAL: 备份文件过小（${BACKUP_SIZE} bytes），可能失败"
  rm -f "$BACKUP_PATH"
  exit 1
fi

# 完整性校验：tar 解压测试 + 文件计数
VERIFY_COUNT=$(tar -tzf "$BACKUP_PATH" 2>/dev/null | grep -c -v '/$' || echo 0)
BACKUP_SIZE_HR=$(du -h "$BACKUP_PATH" | cut -f1)
log "备份完成: ${BACKUP_FILENAME} (${BACKUP_SIZE_HR}, ${VERIFY_COUNT} 个文件)"

# ---- 清理过期备份 ----
log "清理过期备份（保留 ${KEEP_DAILY_DAYS} 天）..."

DELETED_COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${BACKUP_PREFIX}_*.tar.gz" \
  -mtime +"$KEEP_DAILY_DAYS" -delete -print 2>/dev/null | wc -l || echo 0)
log "清理过期备份: 删除 ${DELETED_COUNT} 个文件"

# ---- 当前备份文件列表 ----
log "当前备份文件:"
find "$BACKUP_DIR" -maxdepth 1 -type f -name "${BACKUP_PREFIX}_*.tar.gz" -printf "%f %s bytes\n" 2>/dev/null | sort | while read -r line; do
  log "  $line"
done

log "=========================================="
log "文件备份完成"
log "=========================================="


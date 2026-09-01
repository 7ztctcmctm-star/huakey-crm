#!/bin/bash
# ============================================================
# HuakeyCRM 配置文件与证书备份脚本
#
# 备份对象：.env、.env.secrets、docker-compose.synology.yml、
#          nginx/certs/、nginx/nginx.conf、DSM nginx 反代配置、备份脚本
# 执行方式：NAS 宿主机 DSM 任务计划（每日凌晨 02:45）
# 备份格式：tar.gz（含权限保留）
# 保留策略：7 天每日备份
# 安全措施：备份目录 700，备份文件 600，禁止进入 git
# ============================================================
set -eu

# ---- 配置 ----
STACK_DIR="/volume1/docker/crm-stack"
BACKUP_DIR="${STACK_DIR}/database/backups/config"
LOG_FILE="${STACK_DIR}/database/backups/config-backup.log"
BACKUP_PREFIX="config"

# DSM Nginx 反代配置路径
DSM_NGINX_CONF_DIR="/usr/local/etc/nginx/conf.d"
DSM_NGINX_CONF_FILE="http.crm-huakey-local.conf"

# 保留策略
KEEP_DAILY_DAYS=7

# 空间检查阈值（单位 MB）
MIN_FREE_MB=500

# ---- 日志函数 ----
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ---- 创建备份目录（权限 700）----
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
touch "$LOG_FILE"

log "=========================================="
log "HuakeyCRM 配置文件备份开始"
log "=========================================="

# ---- 检查必须文件存在 ----
MISSING_FILES=()

check_file() {
  if [ ! -f "$1" ]; then
    MISSING_FILES+=("$1")
    log "WARNING: 文件不存在: $1"
  fi
}

check_dir() {
  if [ ! -d "$1" ]; then
    MISSING_FILES+=("$1 (directory)")
    log "WARNING: 目录不存在: $1"
  fi
}

# 必须备份的文件清单
log "检查必须备份文件..."
check_file "${STACK_DIR}/.env"
check_file "${STACK_DIR}/.env.secrets"
check_file "${STACK_DIR}/docker-compose.synology.yml"
check_file "${STACK_DIR}/nginx/nginx.conf"
check_dir "${STACK_DIR}/nginx/certs"
check_file "${DSM_NGINX_CONF_DIR}/${DSM_NGINX_CONF_FILE}"
check_dir "${STACK_DIR}/deploy/backup"

# 关键文件缺失则中止（.env.secrets 和 docker-compose 必须存在）
CRITICAL_FILES=(
  "${STACK_DIR}/.env.secrets"
  "${STACK_DIR}/docker-compose.synology.yml"
  "${STACK_DIR}/nginx/certs"
)

for cf in "${CRITICAL_FILES[@]}"; do
  if [ ! -e "$cf" ]; then
    log "FATAL: 关键文件缺失: $cf"
    exit 1
  fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
  log "WARNING: ${#MISSING_FILES[@]} 个非关键文件缺失，继续备份"
fi
log "文件检查完成"

# ---- 磁盘空间检查 ----
AVAILABLE_MB=$(df -m "${STACK_DIR}" | awk 'NR==2 {print $4}')
if [ "$AVAILABLE_MB" -lt "$MIN_FREE_MB" ]; then
  log "FATAL: 磁盘可用空间不足（当前 ${AVAILABLE_MB}MB < 阈值 ${MIN_FREE_MB}MB）"
  exit 1
fi
log "磁盘空间: 可用 ${AVAILABLE_MB}MB"

# ---- 生成备份文件名 ----
BACKUP_DATE=$(date '+%Y%m%d')
BACKUP_FILENAME="${BACKUP_PREFIX}_${BACKUP_DATE}.tar.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

log "备份文件: ${BACKUP_FILENAME}"

# ---- 准备临时打包目录 ----
TMP_STAGING=$(mktemp -d)
trap "rm -rf $TMP_STAGING" EXIT

# 复制 STACK_DIR 下的配置文件（保留权限）
cp -p "${STACK_DIR}/.env" "$TMP_STAGING/" 2>/dev/null || true
cp -p "${STACK_DIR}/.env.secrets" "$TMP_STAGING/" 2>/dev/null || true
cp -p "${STACK_DIR}/docker-compose.synology.yml" "$TMP_STAGING/" 2>/dev/null || true

# 复制 nginx 配置和证书目录
mkdir -p "$TMP_STAGING/nginx"
cp -rp "${STACK_DIR}/nginx/"* "$TMP_STAGING/nginx/" 2>/dev/null || true

# 复制备份脚本目录
mkdir -p "$TMP_STAGING/deploy/backup"
cp -rp "${STACK_DIR}/deploy/backup/"* "$TMP_STAGING/deploy/backup/" 2>/dev/null || true

# 复制 DSM Nginx 反代配置（不在 STACK_DIR 下）
if [ -f "${DSM_NGINX_CONF_DIR}/${DSM_NGINX_CONF_FILE}" ]; then
  mkdir -p "$TMP_STAGING/dsm-nginx"
  cp -p "${DSM_NGINX_CONF_DIR}/${DSM_NGINX_CONF_FILE}" "$TMP_STAGING/dsm-nginx/" 2>/dev/null || true
fi

# ---- 执行备份（tar.gz 打包，保留权限）----
# 使用 tar -p 保留原始权限和属主
# 文件清单：
#   1. .env (公开配置)
#   2. .env.secrets (敏感配置)
#   3. docker-compose.synology.yml (编排配置)
#   4. nginx/ (Nginx 配置 + 证书)
#   5. deploy/backup/ (备份脚本)
#   6. dsm-nginx/ (DSM Nginx 反代配置)
set +e
tar -czpf "$BACKUP_PATH" \
  -C "$TMP_STAGING" \
  . \
  2>>"$LOG_FILE"
TAR_EXIT=$?
set -e

# 清理临时目录
rm -rf "$TMP_STAGING"

if [ "$TAR_EXIT" -ne 0 ]; then
  log "FATAL: tar 打包失败 (exit code: ${TAR_EXIT})"
  rm -f "$BACKUP_PATH"
  exit 1
fi

# ---- 设置备份文件权限（600: 仅 root 可读写）----
chmod 600 "$BACKUP_PATH"

# ---- 验证备份文件 ----
BACKUP_SIZE=$(stat -c%s "$BACKUP_PATH" 2>/dev/null || stat -f%z "$BACKUP_PATH" 2>/dev/null || echo 0)
if [ "$BACKUP_SIZE" -lt 100 ]; then
  log "FATAL: 备份文件过小（${BACKUP_SIZE} bytes），可能失败"
  rm -f "$BACKUP_PATH"
  exit 1
fi

# 完整性校验：tar 列出文件清单
FILE_LIST=$(tar -tzf "$BACKUP_PATH" 2>/dev/null)
FILE_COUNT=$(echo "$FILE_LIST" | grep -c -v '/$' || echo 0)
BACKUP_SIZE_HR=$(du -h "$BACKUP_PATH" | cut -f1)

log "备份完成: ${BACKUP_FILENAME} (${BACKUP_SIZE_HR}, ${FILE_COUNT} 个文件)"
log "备份内容清单:"
echo "$FILE_LIST" | while read -r line; do
  log "  $line"
done

# ---- 验证敏感文件权限 ----
log "权限验证:"
log "  备份目录权限: $(stat -c '%a' "$BACKUP_DIR") (期望 700)"
log "  备份文件权限: $(stat -c '%a' "$BACKUP_PATH") (期望 600)"

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

# ---- Git 排除验证 ----
GITIGNORE="${STACK_DIR}/.gitignore"
if [ -f "$GITIGNORE" ]; then
  if grep -q "database/backups" "$GITIGNORE" 2>/dev/null; then
    log "Git 排除验证: database/backups/ 已在 .gitignore 中"
  else
    log "WARNING: database/backups/ 未在 .gitignore 中"
  fi
  if grep -q ".env.secrets" "$GITIGNORE" 2>/dev/null; then
    log "Git 排除验证: .env.secrets 已在 .gitignore 中"
  else
    log "WARNING: .env.secrets 未在 .gitignore 中"
  fi
fi

log "=========================================="
log "配置文件备份完成"
log "=========================================="

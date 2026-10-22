#!/bin/bash
# ============================================================
# HuakeyCRM MySQL 备份（容器内执行，huakey-backup 容器挂载为 /backup.sh）
#
# D3 加固（2026-10-22，docs/deploy-hardening-d3.md）：
#   1. pipefail：mysqldump 失败必须让整条管道失败。此前 gzip 出口码恒为 0，
#      mysqldump 中途出错会留下截断的 .sql.gz 却被当作成功备份——最危险
#      的"假备份"形态（恢复时才发现导入报错）。
#   2. 完整性校验：gzip -t + 建表语句计数（与宿主机 mysql-backup.sh:101 同级口径）。
#   3. 备份产物统一 600（含全量业务数据）。
#   4. 清理范围收窄为 huakey_crm_*.sql.gz，避免误删同目录其他 dump。
# ============================================================
set -euo pipefail

# 必填校验：防止未设置密码时回退到弱密码
if [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
  echo "FATAL: MYSQL_ROOT_PASSWORD 未设置" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DATABASE="${DATABASE:-huakey_crm}"
KEEP_DAYS="${KEEP_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

FILENAME="huakey_crm_$(date +%Y%m%d_%H%M%S).sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${FILENAME}"

log() {
  echo "[backup] $1"
}

log "Starting backup of ${DATABASE}..."

# 管道失败即中止并删除半成品（不留假备份）
# stderr 不屏蔽：密码告警与真实错误都进日志（调用方整体重定向到 backup.log）
if ! mysqldump -h mysql -u root -p"${MYSQL_ROOT_PASSWORD}" \
  --single-transaction --routines --triggers --events --no-tablespaces \
  "$DATABASE" | gzip > "$BACKUP_PATH"; then
  log "FATAL: mysqldump/gzip 失败，删除半成品 ${FILENAME}"
  rm -f "$BACKUP_PATH"
  exit 1
fi

# 完整性校验 1：gzip 流可完整解压
if ! gzip -t "$BACKUP_PATH" 2>/dev/null; then
  log "FATAL: gzip 完整性校验失败，删除 ${FILENAME}"
  rm -f "$BACKUP_PATH"
  exit 1
fi

# 完整性校验 2：大小合理
BACKUP_SIZE=$(stat -c%s "$BACKUP_PATH" 2>/dev/null || echo 0)
if [ "$BACKUP_SIZE" -lt 100 ]; then
  log "FATAL: 备份文件过小（${BACKUP_SIZE} bytes），疑似失败，删除 ${FILENAME}"
  rm -f "$BACKUP_PATH"
  exit 1
fi

# 完整性校验 3：至少包含 1 张建表语句（空库/权限异常的早期信号）
TABLE_COUNT=$(zcat "$BACKUP_PATH" 2>/dev/null | grep -c "^CREATE TABLE" || true)
if [ "${TABLE_COUNT:-0}" -lt 1 ]; then
  log "FATAL: 备份中未发现 CREATE TABLE（表数 ${TABLE_COUNT}），疑似权限/选库错误，删除 ${FILENAME}"
  rm -f "$BACKUP_PATH"
  exit 1
fi

# 产物仅所有者可读写（含全量业务数据）
chmod 600 "$BACKUP_PATH"

log "Backup created and verified: ${BACKUP_PATH} (${BACKUP_SIZE} bytes, ${TABLE_COUNT} tables)"

# 清理过期备份（仅限本库 dump，避免误删同目录其他文件）
log "Cleaning up backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DATABASE}_*.sql.gz" -mtime +"$KEEP_DAYS" -delete

log "Done"

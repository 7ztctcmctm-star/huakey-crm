#!/bin/bash
# ============================================================
# HuakeyCRM 备份异地同步（P1-12）
#
# 目标：把已加密的备份产物同步到第二盘位 / USB / 另一台 NAS 的挂载目录，
#      避免 NAS 整机失窃、勒索或阵列损坏时「备份与密钥一起丢失」。
#
# 铁律：
#   1. 只同步备份产物（DB dump / uploads tar / config tar / 演练状态），
#      **绝不同步 .backup-enc-pass**（口令必须离线单独保管）；
#   2. 目标目录不得位于 STACK_DIR 内（否则仍是同机副本）；
#   3. 复制后必须逐个 SHA-256 比对，任一不一致即失败退出；
#   4. 本脚本不删除目标端历史文件（保留策略由目标端或人工管理）。
#
# 执行方式（NAS 宿主机任务计划，建议每日 03:30）：
#   OFFSITE_TARGET=/volumeUSB1/usbshare/crm-offsite \
#     bash deploy/backup/offsite-sync.sh
#
# 亦可指向另一台已挂载的 NAS 共享目录（/volume1/remote-backup/...）。
# ============================================================
set -euo pipefail

STACK_DIR="${STACK_DIR:-/volume1/docker/crm-stack}"
BACKUP_DIR="${BACKUP_DIR:-${STACK_DIR}/database/backups}"
OFFSITE_TARGET="${OFFSITE_TARGET:-}"
LOG_FILE="${OFFSITE_LOG_FILE:-${STACK_DIR}/database/backups/offsite-sync.log}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

if [ -z "$OFFSITE_TARGET" ]; then
  echo "FATAL: 未配置 OFFSITE_TARGET（例：/volumeUSB1/usbshare/crm-offsite）" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
touch "$LOG_FILE"

# 目标不得与源同目录（含符号链接解析）
TARGET_REAL=$(readlink -f "$OFFSITE_TARGET" 2>/dev/null || echo "$OFFSITE_TARGET")
BACKUP_REAL=$(readlink -f "$BACKUP_DIR" 2>/dev/null || echo "$BACKUP_DIR")
case "$TARGET_REAL/" in
  "$BACKUP_REAL"/*)
    log "FATAL: OFFSITE_TARGET 位于备份目录内（$TARGET_REAL），不构成异地副本"
    exit 1
    ;;
esac

if ! mkdir -p "$OFFSITE_TARGET"; then
  log "FATAL: 无法创建/访问异地目录: $OFFSITE_TARGET"
  exit 1
fi

if [ ! -w "$OFFSITE_TARGET" ]; then
  log "FATAL: 异地目录不可写: $OFFSITE_TARGET"
  exit 1
fi

log "=========================================="
log "备份异地同步开始 -> ${OFFSITE_TARGET}"
log "=========================================="

# 若系统无 sha256sum，回退 shasum
if command -v sha256sum >/dev/null 2>&1; then
  SHA_CMD="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  SHA_CMD="shasum -a 256"
else
  log "FATAL: 未找到 sha256sum/shasum，无法校验副本"
  exit 1
fi

COPIED=0
FAILED=0
SKIPPED_PLAINTEXT=0

sync_one() {
  SRC="$1"
  REL="${SRC#"$BACKUP_DIR"/}"
  DEST="${OFFSITE_TARGET}/${REL}"
  mkdir -p "$(dirname "$DEST")"
  if ! cp -p "$SRC" "$DEST"; then
    log "FAIL: 复制失败 ${REL}"
    FAILED=$((FAILED + 1))
    return
  fi
  SRC_SUM=$($SHA_CMD "$SRC" | awk '{print $1}')
  DEST_SUM=$($SHA_CMD "$DEST" | awk '{print $1}')
  if [ "$SRC_SUM" != "$DEST_SUM" ]; then
    log "FAIL: 校验不一致 ${REL}（src=${SRC_SUM} dst=${DEST_SUM}）"
    FAILED=$((FAILED + 1))
    return
  fi
  COPIED=$((COPIED + 1))
}

# 1) 数据库备份（含加密产物）；未加密产物仍同步但显式告警
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in
    *.gpg|*.enc) sync_one "$f" ;;
    *)
      log "WARNING: 明文数据库备份（建议配置 .backup-enc-pass 后重新备份）: $(basename "$f")"
      SKIPPED_PLAINTEXT=$((SKIPPED_PLAINTEXT + 1))
      sync_one "$f"
      ;;
  esac
done < <(find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'huakey_crm_*.sql.gz' -o -name 'huakey_crm_*.sql.gz.gpg' -o -name 'huakey_crm_*.sql.gz.enc' \) | sort)

# 2) uploads 备份
while IFS= read -r f; do
  [ -n "$f" ] || continue
  sync_one "$f"
done < <(find "$BACKUP_DIR/uploads" -maxdepth 1 -type f \
  \( -name 'uploads_*.tar.gz' -o -name 'uploads_*.tar.gz.gpg' -o -name 'uploads_*.tar.gz.enc' \) 2>/dev/null | sort)

# 3) config 备份
while IFS= read -r f; do
  [ -n "$f" ] || continue
  sync_one "$f"
done < <(find "$BACKUP_DIR/config" -maxdepth 1 -type f \
  \( -name 'config_*.tar.gz' -o -name 'config_*.tar.gz.gpg' -o -name 'config_*.tar.gz.enc' \) 2>/dev/null | sort)

# 4) 恢复演练证据（可机器检查）
if [ -f "$BACKUP_DIR/restore-drill.status" ]; then
  sync_one "$BACKUP_DIR/restore-drill.status"
fi

log "同步文件数: ${COPIED}，失败: ${FAILED}，明文告警: ${SKIPPED_PLAINTEXT}"

if [ "$FAILED" -ne 0 ]; then
  log "RESULT=FAIL"
  exit 1
fi
if [ "$COPIED" -eq 0 ]; then
  log "RESULT=FAIL（没有任何可同步的备份产物）"
  exit 1
fi

log "RESULT=PASS（SHA-256 逐个比对通过；口令文件未同步，需离线保管）"
log "=========================================="

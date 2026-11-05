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
#
# P1-12 加固（2026-10-23）：
#   5. 数据库含全量客户 PII，不再是"与库同信任域可接受"的明文：
#      存在备份口令文件时，dump 校验通过后 gpg/openssl 对称加密并解密回验，
#      明文立即删除；口令文件缺失时保留明文但输出显著 WARNING。
#   6. 密码改走 MYSQL_PWD 环境变量，不再出现在 mysqldump 进程命令行。
#   7. 主机/端口可用 MYSQL_HOST/MYSQL_PORT 覆盖（本地恢复演练复用同一脚本）。
# ============================================================
set -euo pipefail

# 必填校验：防止未设置密码时回退到弱密码
if [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
  echo "FATAL: MYSQL_ROOT_PASSWORD 未设置" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DATABASE="${DATABASE:-huakey_crm}"
# [P2-15] 与宿主机 deploy/backup/mysql-backup.sh 统一为 30 天；
# BACKUP_KEEP_DAYS 优先，保留旧 KEEP_DAYS 兼容开关。
KEEP_DAYS="${BACKUP_KEEP_DAYS:-${KEEP_DAYS:-30}}"
MYSQL_HOST="${MYSQL_HOST:-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
# 备份加密口令（容器内默认只读挂载到 /stack/）
ENC_PASS_FILE="${BACKUP_ENC_PASS_FILE:-/stack/.backup-enc-pass}"
# 设为 true 时，口令文件缺失/加密失败直接判备份失败（生产建议开启）
REQUIRE_ENCRYPTION="${BACKUP_REQUIRE_ENCRYPTION:-false}"

mkdir -p "$BACKUP_DIR"

FILENAME="huakey_crm_$(date +%Y%m%d_%H%M%S).sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${FILENAME}"

log() {
  echo "[backup] $1"
}

# 对称加密：优先 gpg（带 MDC），回退 openssl。输出加密文件路径。
encrypt_file() {
  SRC="$1"
  PASS="$2"
  if command -v gpg >/dev/null 2>&1; then
    OUT="${SRC}.gpg"
    if gpg --batch --yes --quiet --symmetric --cipher-algo AES256 \
      --passphrase-file "$PASS" -o "$OUT" "$SRC" 2>/dev/null; then
      echo "$OUT"
      return 0
    fi
    return 1
  fi
  if command -v openssl >/dev/null 2>&1; then
    OUT="${SRC}.enc"
    if openssl enc -aes-256-cbc -pbkdf2 -salt \
      -in "$SRC" -out "$OUT" -pass file:"$PASS" 2>/dev/null; then
      echo "$OUT"
      return 0
    fi
    return 1
  fi
  return 1
}

# 解密回验：密文必须能解开且 gzip 流完整
verify_encrypted_gzip() {
  ENC="$1"
  PASS="$2"
  case "$ENC" in
    *.gpg)
      gpg --batch --quiet --decrypt --passphrase-file "$PASS" "$ENC" 2>/dev/null | gzip -t >/dev/null 2>&1
      ;;
    *.enc)
      openssl enc -d -aes-256-cbc -pbkdf2 -in "$ENC" -pass file:"$PASS" 2>/dev/null | gzip -t >/dev/null 2>&1
      ;;
    *)
      return 1
      ;;
  esac
}

log "Starting backup of ${DATABASE}..."

# 管道失败即中止并删除半成品（不留假备份）
# 密码经 MYSQL_PWD 传递，避免出现在同机进程命令行
if ! MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysqldump -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u root \
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

# ---- P1-12：落盘加密（有口令文件时强制，失败即删产物）----
if [ -f "$ENC_PASS_FILE" ]; then
  ENC_FILE=$(encrypt_file "$BACKUP_PATH" "$ENC_PASS_FILE") || ENC_FILE=""
  if [ -z "$ENC_FILE" ] || ! verify_encrypted_gzip "$ENC_FILE" "$ENC_PASS_FILE"; then
    log "FATAL: 备份加密或解密回验失败，删除明文与半成品（防明文落盘）"
    rm -f "$BACKUP_PATH" "${ENC_FILE:-}"
    exit 1
  fi
  rm -f "$BACKUP_PATH"
  chmod 600 "$ENC_FILE"
  log "Backup encrypted: ${ENC_FILE} (解密回验通过，明文已删除)"
  BACKUP_PATH="$ENC_FILE"
else
  log "WARNING: 未配置备份加密口令（${ENC_PASS_FILE}），本次备份为明文（权限 600）"
  log "WARNING: 修复：在 NAS 执行 bash deploy/backup/setup-backup-encryption.sh"
  if [ "$REQUIRE_ENCRYPTION" = "true" ]; then
    log "FATAL: BACKUP_REQUIRE_ENCRYPTION=true 且口令文件缺失，删除明文备份"
    rm -f "$BACKUP_PATH"
    exit 1
  fi
fi

# 清理过期备份（仅限本库 dump，避免误删同目录其他文件；含加密产物）
log "Cleaning up backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name "${DATABASE}_*.sql.gz" -o -name "${DATABASE}_*.sql.gz.gpg" -o -name "${DATABASE}_*.sql.gz.enc" \) \
  -mtime +"$KEEP_DAYS" -delete

log "Done"

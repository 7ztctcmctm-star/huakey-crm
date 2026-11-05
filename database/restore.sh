#!/bin/bash
# ============================================================
# HuakeyCRM MySQL 恢复脚本
#
# 支持输入：
#   - 明文 dump：*.sql.gz
#   - 加密 dump（P1-12）：*.sql.gz.gpg（gpg 对称）或 *.sql.gz.enc（openssl）
#     加密备份需提供口令文件（默认 /stack/.backup-enc-pass，
#     可用 BACKUP_ENC_PASS_FILE 覆盖）
#
# 用法：MYSQL_ROOT_PASSWORD=xxx bash restore.sh <backup_file>
# 环境变量：DATABASE / MYSQL_HOST / MYSQL_PORT / BACKUP_ENC_PASS_FILE
# ============================================================
set -euo pipefail

if [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
  echo "FATAL: MYSQL_ROOT_PASSWORD 环境变量未设置"
  echo "请设置: export MYSQL_ROOT_PASSWORD=<your_root_password>"
  exit 1
fi
DATABASE="${DATABASE:-huakey_crm}"
MYSQL_HOST="${MYSQL_HOST:-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
ENC_PASS_FILE="${BACKUP_ENC_PASS_FILE:-/stack/.backup-enc-pass}"
BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file.sql.gz|.sql.gz.gpg|.sql.gz.enc>"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: backup file not found: $BACKUP_FILE"
  exit 1
fi

# 解密（如需）后统一以 gzip 流送入 mysql
restore_stream() {
  case "$BACKUP_FILE" in
    *.gpg)
      if [ ! -f "$ENC_PASS_FILE" ]; then
        echo "FATAL: 加密备份缺少口令文件: $ENC_PASS_FILE" >&2
        exit 1
      fi
      gpg --batch --quiet --decrypt --passphrase-file "$ENC_PASS_FILE" "$BACKUP_FILE"
      ;;
    *.enc)
      if [ ! -f "$ENC_PASS_FILE" ]; then
        echo "FATAL: 加密备份缺少口令文件: $ENC_PASS_FILE" >&2
        exit 1
      fi
      openssl enc -d -aes-256-cbc -pbkdf2 -in "$BACKUP_FILE" -pass file:"$ENC_PASS_FILE"
      ;;
    *)
      cat "$BACKUP_FILE"
      ;;
  esac
}

echo "[restore] Restoring ${DATABASE} from ${BACKUP_FILE}..."

# 先验证 gzip 流完整，避免半个库导入到一半才报错
if ! restore_stream | gzip -t >/dev/null 2>&1; then
  echo "FATAL: 备份文件解密/gzip 完整性校验失败，未做任何写入" >&2
  exit 1
fi

# 密码经 MYSQL_PWD 传递，避免出现在进程命令行
restore_stream | gzip -dc | MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" \
  mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u root "$DATABASE"
echo "[restore] Restore complete from: $BACKUP_FILE"

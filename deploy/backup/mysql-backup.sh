#!/bin/bash
# ============================================================
# HuakeyCRM MySQL 自动备份脚本
#
# 执行方式：NAS 宿主机 DSM 任务计划（每日凌晨 2:00）
# 备份方式：docker exec huakey-mysql mysqldump（不依赖 backup 容器）
# 密码来源：.env.secrets（禁止硬编码）
# 保留策略：30 天每日备份 + 4 周周备份（与容器内 database/backup.sh 统一）
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

# [P1-12] 备份加密口令文件（与 config/uploads 共用；缺失时保留明文并告警）
ENC_PASS_FILE="${BACKUP_ENC_PASS_FILE:-${STACK_DIR}/.backup-enc-pass}"

# 保留策略
# [P2-15 2026-10-26] 原宿主机 7 天 / 容器 30 天策略不一致：同一备份目录里
# 两套产物保留期不同，排障时无法用一句“保留 N 天”描述。统一为 30 天，
# 可用 BACKUP_KEEP_DAYS 覆盖（宿主机从 .env/.env.secrets 读取，容器由 compose 注入）。
KEEP_DAILY_DAYS="${BACKUP_KEEP_DAYS:-30}"
KEEP_WEEKLY_WEEKS=4    # 周备份保留 4 周（28 天）

# ---- 日志函数 ----
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ---- [P1-12] 加密与解密回验（优先 gpg，回退 openssl）----
encrypt_file() {
  SRC="$1"
  PASS="$2"
  if command -v gpg >/dev/null 2>&1; then
    OUT="${SRC}.gpg"
    if gpg --batch --yes --quiet --symmetric --cipher-algo AES256 \
      --passphrase-file "$PASS" -o "$OUT" "$SRC" 2>>"$LOG_FILE"; then
      echo "$OUT"
      return 0
    fi
    return 1
  fi
  if command -v openssl >/dev/null 2>&1; then
    OUT="${SRC}.enc"
    if openssl enc -aes-256-cbc -pbkdf2 -salt \
      -in "$SRC" -out "$OUT" -pass file:"$PASS" 2>>"$LOG_FILE"; then
      echo "$OUT"
      return 0
    fi
    return 1
  fi
  return 1
}

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

# [P1-12] 生产默认 fail-closed：口令缺失时拒绝生成明文 DB 备份（含全量客户 PII）
REQUIRE_ENCRYPTION="${BACKUP_REQUIRE_ENCRYPTION:-true}"
if [ "$REQUIRE_ENCRYPTION" = "true" ] && [ ! -f "$ENC_PASS_FILE" ]; then
  log "FATAL: 备份加密口令缺失（${ENC_PASS_FILE}），拒绝生成明文数据库备份"
  log "FATAL: 修复：bash deploy/backup/setup-backup-encryption.sh"
  exit 1
fi

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
# [P1-12] 密码经 MYSQL_PWD 传入容器，不再出现在进程命令行
/usr/local/bin/docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" "$MYSQL_CONTAINER" \
  mysqldump -u root \
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

  # 完整性校验：gzip 流可完整解压（与容器版 database/backup.sh 同级口径）
  if ! gzip -t "$DAILY_PATH" 2>/dev/null; then
    log "FATAL: gzip 完整性校验失败，删除 ${DAILY_FILENAME}"
    rm -f "$DAILY_PATH"
    exit 1
  fi

  # 验证备份文件非空
  BACKUP_SIZE=$(stat -c%s "$DAILY_PATH" 2>/dev/null || stat -f%z "$DAILY_PATH" 2>/dev/null || echo 0)
  if [ "$BACKUP_SIZE" -lt 100 ]; then
    log "FATAL: 备份文件过小（${BACKUP_SIZE} bytes），可能失败"
    rm -f "$DAILY_PATH"
    exit 1
  fi

  # dump 含全量业务数据，收紧为 600（与容器版对齐）
  chmod 600 "$DAILY_PATH"

  # 完整性校验：解压测试 + 表计数
  TABLE_COUNT=$(zcat "$DAILY_PATH" 2>/dev/null | grep -c "^CREATE TABLE" || echo 0)
  if [ "${TABLE_COUNT:-0}" -lt 1 ]; then
    log "FATAL: 备份中未发现 CREATE TABLE（表数 ${TABLE_COUNT}），疑似权限/选库错误"
    rm -f "$DAILY_PATH"
    exit 1
  fi

  # [P1-12] 加密落盘（有口令文件时强制）
  if [ -f "$ENC_PASS_FILE" ]; then
    ENC_FILE=$(encrypt_file "$DAILY_PATH" "$ENC_PASS_FILE") || ENC_FILE=""
    if [ -z "$ENC_FILE" ] || ! verify_encrypted_gzip "$ENC_FILE" "$ENC_PASS_FILE"; then
      log "FATAL: 备份加密或解密回验失败，删除明文与半成品"
      rm -f "$DAILY_PATH" "${ENC_FILE:-}"
      exit 1
    fi
    rm -f "$DAILY_PATH"
    chmod 600 "$ENC_FILE"
    log "每日备份完成（已加密）: $(basename "$ENC_FILE") (${BACKUP_SIZE} bytes, ${TABLE_COUNT} 表, 解密回验通过)"
    DAILY_PATH="$ENC_FILE"
  else
    log "WARNING: 未配置备份加密口令（${ENC_PASS_FILE}），本次数据库备份为明文（权限 600）"
    log "WARNING: 修复：bash deploy/backup/setup-backup-encryption.sh 生成口令文件"
    log "每日备份完成: ${DAILY_FILENAME} (${BACKUP_SIZE} bytes, ${TABLE_COUNT} 表, 完整性校验通过, 权限 600)"
  fi
else
  log "FATAL: mysqldump 失败"
  rm -f "$DAILY_PATH"
  exit 1
fi

# ---- 周备份（每周日生成额外副本）----
WEEKDAY=$(date '+%u')  # 1=周一, 7=周日
if [ "$WEEKDAY" = "7" ]; then
  WEEK_NUM=$(date '+%Y-W%V')
  # 保留加密后缀，避免把密文存成 .sql.gz 导致恢复端误判
  case "$DAILY_PATH" in
    *.gpg) ENC_SUFFIX=".gpg" ;;
    *.enc) ENC_SUFFIX=".enc" ;;
    *) ENC_SUFFIX="" ;;
  esac
  WEEKLY_FILENAME="${DATABASE}_weekly_${WEEK_NUM}.sql.gz${ENC_SUFFIX}"
  WEEKLY_PATH="${BACKUP_DIR}/${WEEKLY_FILENAME}"

  cp "$DAILY_PATH" "$WEEKLY_PATH"
  chmod 600 "$WEEKLY_PATH"
  log "周备份创建: ${WEEKLY_FILENAME}（每周日）"
fi

# ---- 清理过期备份 ----
log "清理过期备份..."

# 清理每日备份：保留最近 KEEP_DAILY_DAYS 天（默认 30，含加密产物）
# [P1-13] 本目录与备份容器 /backups 是同一挂载点。容器产物名为
#   huakey_crm_YYYYMMDD_HHMMSS.sql.gz[.gpg|.enc]（30 天保留），
#   本脚本产物名为 huakey_crm_YYYYMMDD.sql.gz（同样默认 30 天保留）。
#   必须用 8 位日期的精确模式，否则会把容器 8–30 天的备份提前删掉。
DELETED_DAILY=$(find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name "${DATABASE}_????????.sql.gz" -o -name "${DATABASE}_????????.sql.gz.gpg" -o -name "${DATABASE}_????????.sql.gz.enc" \) \
  ! -name "${DATABASE}_weekly_*" \
  -mtime +"$KEEP_DAILY_DAYS" -delete -print 2>/dev/null | wc -l || echo 0)
log "清理每日备份: 删除 ${DELETED_DAILY} 个过期文件"

# 清理周备份：保留最近 28 天（4 周）
DELETED_WEEKLY=$(find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name "${DATABASE}_weekly_*.sql.gz" -o -name "${DATABASE}_weekly_*.sql.gz.gpg" -o -name "${DATABASE}_weekly_*.sql.gz.enc" \) \
  -mtime +"$((KEEP_WEEKLY_WEEKS * 7))" -delete -print 2>/dev/null | wc -l || echo 0)
log "清理周备份: 删除 ${DELETED_WEEKLY} 个过期文件"

# ---- 清理旧的空备份文件（20 bytes 的失败备份；仅宿主机命名，勿碰容器产物）----
CLEANED_EMPTY=$(find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name "${DATABASE}_????????.sql.gz" -o -name "${DATABASE}_????????.sql.gz.gpg" -o -name "${DATABASE}_????????.sql.gz.enc" \
     -o -name "${DATABASE}_weekly_*.sql.gz" -o -name "${DATABASE}_weekly_*.sql.gz.gpg" -o -name "${DATABASE}_weekly_*.sql.gz.enc" \) \
  -size -100c -delete -print 2>/dev/null | wc -l || echo 0)
if [ "$CLEANED_EMPTY" -gt 0 ]; then
  log "清理空备份文件: 删除 ${CLEANED_EMPTY} 个无效文件"
fi

# ---- 当前备份文件列表 ----
log "当前备份文件:"
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name "${DATABASE}_*.sql.gz" -o -name "${DATABASE}_*.sql.gz.gpg" -o -name "${DATABASE}_*.sql.gz.enc" \) \
  -printf "%f %s bytes\n" 2>/dev/null | sort | while read -r line; do
  log "  $line"
done

log "=========================================="
log "备份完成"
log "=========================================="

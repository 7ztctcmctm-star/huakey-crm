#!/bin/sh
# ============================================================
# HuakeyCRM 恢复演练脚本（v4 · D3 双模式 + 失败不静默）
#
# 执行方式：
#   a) 宿主机（有 docker 权限）：bash deploy/backup/restore-test.sh
#      —— 也可由 deploy/cron/install-restore-drill.sh 装入 /etc/cron.d 月执行
#   b) 备份容器内（无 docker CLI）：docker exec huakey-backup bash /restore-test.sh
#      —— 本 NAS 的实际月执行机制（宿主机 /etc/cron.d 对部署账号不可写，
#         由 container-backup.sh 调度器每月 1 日 03:00 触发）
#
# 演练内容（全程不触碰生产库，仅对生产库做只读比对）：
#   1. 最新 MySQL 备份 gzip 完整性校验
#   2. 还原到临时库 huakey_crm_restore_test（导入失败即 FAIL，不再静默）
#   3. 表数量/关键表结构/抽样数据比对
#   4. uploads 最新 tar 完整性 + config 加密备份解密回验（可选）
#   5. 结果写入 restore-drill.status（机器可检查）+ restore-test.log
#
# 历史版本缺陷（v3，已修）：
#   - 导入命令 2>/dev/null 且不检查退出码，导入失败也往下走
#   - gunzip 前无 gzip -t，损坏备份到导入阶段才暴露
#   - 无总体判定，失败与成功在日志里难以区分
# ============================================================
set -u

# ---- 路径与常量 ----
STACK_DIR="${STACK_DIR:-/volume1/docker/crm-stack}"
if [ -d /backups ]; then
  BACKUP_DIR="${BACKUP_DIR:-/backups}"          # 容器内挂载点
else
  BACKUP_DIR="${BACKUP_DIR:-${STACK_DIR}/database/backups}"  # 宿主机
fi
LOG_FILE="${BACKUP_DIR}/restore-test.log"
STATUS_FILE="${BACKUP_DIR}/restore-drill.status"
LOCK_DIR="${BACKUP_DIR}/.restore-drill.lock"
MYSQL_CONTAINER="huakey-mysql"
TEST_DB="huakey_crm_restore_test"
PROD_DB="huakey_crm"
DOCKER="${DOCKER:-docker}"
DRILL_MODE=""
TMP_SQL=""
BACKUP_NAME=""
RESTORED_TABLES=0
PROD_TABLES=0
DURATION=0

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ---- 总体判定 ----
RESULT="PASS"
RESULT_DETAIL=""
fail() {
  RESULT="FAIL"
  RESULT_DETAIL="$1"
  log "FAIL: $1"
}
warn() {
  log "WARN: $1"
}

write_status() {
  {
    echo "LAST_RUN=$(date '+%Y-%m-%d %H:%M:%S')"
    echo "RESULT=${RESULT}"
    echo "MODE=${DRILL_MODE}"
    echo "BACKUP=${BACKUP_NAME:-none}"
    echo "TABLES=${RESTORED_TABLES:-0}/${PROD_TABLES:-0}"
    echo "DURATION=${DURATION:-0}s"
    if [ -n "$RESULT_DETAIL" ]; then
      echo "DETAIL=${RESULT_DETAIL}"
    fi
  } > "$STATUS_FILE"
  log "RESULT: ${RESULT} ${RESULT_DETAIL:+/ $RESULT_DETAIL}"
  log "状态文件: $STATUS_FILE"
}

# ---- 并发锁（mkdir 原子创建，防手动演练与月调度叠加）----
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  # 锁目录残留（上次异常退出未清）超过 2 小时则强夺
  if [ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
    log "WARN: 发现超过 2 小时的陈旧锁，强夺后继续"
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR" 2>/dev/null || { log "另一个演练实例正在运行，本次退出"; exit 0; }
  else
    log "另一个演练实例正在运行，本次退出"
    exit 0
  fi
fi
cleanup() {
  rm -rf "$LOCK_DIR" "$TMP_SQL" 2>/dev/null
  # 临时库必须清理（即使演练失败也不留库）
  if [ -n "${DRILL_MODE:-}" ]; then
    mysql_admin "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

mkdir -p "$BACKUP_DIR"
touch "$LOG_FILE"

# ---- 密码加载 ----
PW="${MYSQL_ROOT_PASSWORD:-}"
if [ -z "$PW" ] && [ -f "${STACK_DIR}/.env.secrets" ]; then
  # 容器内 /stack/.env.secrets 只读挂载；宿主机则为 $STACK_DIR/.env.secrets
  set +u
  # shellcheck disable=SC1090
  . "${STACK_DIR}/.env.secrets" 2>/dev/null || true
  set -u
  PW="${MYSQL_ROOT_PASSWORD:-}"
fi
if [ -z "$PW" ]; then
  log "FATAL: MYSQL_ROOT_PASSWORD 未找到（环境变量或 ${STACK_DIR}/.env.secrets）"
  DRILL_MODE=""
  RESULT="FAIL"; RESULT_DETAIL="password not found"
  write_status
  exit 1
fi

# ---- 模式探测：docker exec 优先，其次容器内 mysql 直连 ----
if "$DOCKER" ps >/dev/null 2>&1; then
  DRILL_MODE="docker"
  # 管理语句：SQL 经 stdin 送入，密码走 -e MYSQL_PWD 环境变量（不出现在命令行）
  mysql_admin() {
    echo "$1" | "$DOCKER" exec -i -e MYSQL_PWD="$PW" "$MYSQL_CONTAINER" mysql -u root -s -N 2>/dev/null
  }
  # 导入：从 stdin 灌入解压后的 SQL（退出码即 mysql 客户端退出码）
  mysql_import() {
    "$DOCKER" exec -i -e MYSQL_PWD="$PW" "$MYSQL_CONTAINER" mysql -u root "$1"
  }
elif command -v mysql >/dev/null 2>&1 && MYSQL_PWD="$PW" mysql -h mysql -u root -e "SELECT 1" >/dev/null 2>&1; then
  DRILL_MODE="direct"
  mysql_admin() {
    echo "$1" | MYSQL_PWD="$PW" mysql -h mysql -u root -s -N 2>/dev/null
  }
  mysql_import() {
    MYSQL_PWD="$PW" mysql -h mysql -u root "$1"
  }
else
  log "FATAL: 既无可用 docker CLI，也无法直连 mysql 主机——请在宿主机或备份容器内执行"
  exit 1
fi
log "执行模式: ${DRILL_MODE}"

START_TS=$(date +%s)

log "=========================================="
log "HuakeyCRM 恢复演练开始 (v4)"
log "=========================================="

# ---- 1. 定位最新备份并做 gzip 完整性校验 ----
LATEST=$(ls -t "${BACKUP_DIR}"/huakey_crm_*.sql.gz 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  fail "未找到任何 MySQL 备份文件（${BACKUP_DIR}/huakey_crm_*.sql.gz）"
  write_status
  exit 1
fi
BACKUP_NAME=$(basename "$LATEST")
BACKUP_SIZE=$(stat -c%s "$LATEST" 2>/dev/null || echo 0)
log "备份文件: ${BACKUP_NAME} (${BACKUP_SIZE} bytes)"

if ! gzip -t "$LATEST" 2>/dev/null; then
  fail "备份 gzip 完整性校验失败: ${BACKUP_NAME}"
  write_status
  exit 1
fi
log "gzip 完整性校验: PASS"

# 磁盘空间预检：解压后 SQL + 临时库约需 2 倍备份空间
AVAIL_MB=$(df -m "$BACKUP_DIR" 2>/dev/null | awk 'NR==2 {print $4}' || echo 0)
NEED_MB=$(( BACKUP_SIZE / 1048576 * 2 + 512 ))
if [ "$AVAIL_MB" -gt 0 ] && [ "$AVAIL_MB" -lt "$NEED_MB" ]; then
  fail "磁盘空间不足（可用 ${AVAIL_MB}MB < 预估需求 ${NEED_MB}MB）"
  write_status
  exit 1
fi

# ---- 2. 重建临时库 ----
log "=== 步骤 2: 重建临时库 ${TEST_DB} ==="
mysql_admin "DROP DATABASE IF EXISTS ${TEST_DB}; CREATE DATABASE ${TEST_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" \
  || { fail "临时库创建失败"; write_status; exit 1; }
log "临时库已重建"

# ---- 3. 解压 + 导入（每一步检查退出码）----
log "=== 步骤 3: 解压并导入备份 ==="
TMP_SQL="${BACKUP_DIR}/.restore_drill_$(date +%s).sql"
if ! gunzip -c "$LATEST" > "$TMP_SQL" 2>>"$LOG_FILE"; then
  fail "gunzip 解压失败"
  rm -f "$TMP_SQL"
  write_status
  exit 1
fi
SQL_SIZE=$(stat -c%s "$TMP_SQL" 2>/dev/null || echo 0)
log "解压完成: ${SQL_SIZE} bytes"

if ! mysql_import "$TEST_DB" < "$TMP_SQL"; then
  fail "导入临时库失败（mysql 退出码非 0）——备份可能不可用或结构不兼容"
  rm -f "$TMP_SQL"
  write_status
  exit 1
fi
rm -f "$TMP_SQL"
log "导入完成"

# ---- 4. 表数量与结构比对 ----
log "=== 步骤 4: 表数量与结构比对 ==="
RESTORED_TABLES=$(mysql_admin "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${TEST_DB}';" || echo 0)
PROD_TABLES=$(mysql_admin "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${PROD_DB}';" || echo 0)
log "生产库表数量: ${PROD_TABLES} / 恢复库表数量: ${RESTORED_TABLES}"
if [ "${RESTORED_TABLES:-0}" -eq 0 ]; then
  fail "恢复库没有任何表"
elif [ "${RESTORED_TABLES:-0}" -ne "${PROD_TABLES:-0}" ]; then
  # 备份时间与当前生产库之间可能发生过迁移，记 WARN 不记 FAIL
  warn "表数量与生产库不一致（备份后若有迁移属预期；否则需排查）"
fi

# ---- 5. 关键表数据抽样（只读生产库）----
log "=== 步骤 5: 关键表数据抽样 ==="
for TABLE in crm_customer crm_opportunity crm_quote crm_contract; do
  TEST_COUNT=$(mysql_admin "SELECT COUNT(*) FROM ${TEST_DB}.${TABLE};" 2>/dev/null || echo "N/A")
  PROD_COUNT=$(mysql_admin "SELECT COUNT(*) FROM ${PROD_DB}.${TABLE};" 2>/dev/null || echo "N/A")
  log "  ${TABLE}: 生产=${PROD_COUNT} 恢复=${TEST_COUNT}"
  if [ "$TEST_COUNT" = "N/A" ]; then
    fail "关键表 ${TABLE} 在恢复库中不存在或不可查"
  fi
done

SAMPLE=$(mysql_admin "SELECT CONCAT('id=', id, ' name=', name) FROM ${TEST_DB}.crm_customer LIMIT 1;" 2>/dev/null || echo "无数据")
log "  crm_customer 抽样: ${SAMPLE}"

# ---- 6. uploads / config 备份附带校验（存在才查）----
log "=== 步骤 6: uploads 与 config 备份附带校验 ==="
UPLOADS_LATEST=$(ls -t "${BACKUP_DIR}"/uploads/uploads_*.tar.gz 2>/dev/null | head -1)
if [ -n "$UPLOADS_LATEST" ]; then
  if tar -tzf "$UPLOADS_LATEST" >/dev/null 2>&1; then
    log "uploads 备份完整性: PASS ($(basename "$UPLOADS_LATEST"))"
  else
    warn "uploads 备份完整性失败: $(basename "$UPLOADS_LATEST")"
  fi
else
  log "uploads 备份: 无（跳过）"
fi

CONFIG_ENC=$(ls -t "${BACKUP_DIR}"/config/config_*.tar.gz.gpg "${BACKUP_DIR}"/config/config_*.tar.gz.enc 2>/dev/null | head -1)
if [ -n "$CONFIG_ENC" ]; then
  ENC_PASS_FILE="${BACKUP_ENC_PASS_FILE:-${STACK_DIR}/.backup-enc-pass}"
  if [ -f "$ENC_PASS_FILE" ]; then
    case "$CONFIG_ENC" in
      *.gpg)
        if gpg --batch --quiet --decrypt --passphrase-file "$ENC_PASS_FILE" "$CONFIG_ENC" 2>/dev/null | tar -tzf - >/dev/null 2>&1; then
          log "config 加密备份解密回验: PASS ($(basename "$CONFIG_ENC"))"
        else
          warn "config 加密备份解密回验失败: $(basename "$CONFIG_ENC")"
        fi
        ;;
      *.enc)
        if openssl enc -d -aes-256-cbc -pbkdf2 -in "$CONFIG_ENC" -pass file:"$ENC_PASS_FILE" 2>/dev/null | tar -tzf - >/dev/null 2>&1; then
          log "config 加密备份解密回验: PASS ($(basename "$CONFIG_ENC"))"
        else
          warn "config 加密备份解密回验失败: $(basename "$CONFIG_ENC")"
        fi
        ;;
    esac
  else
    log "config 加密备份: 口令文件缺失（$ENC_PASS_FILE），跳过解密回验"
  fi
else
  log "config 加密备份: 无（跳过）"
fi

# ---- 7. 收尾 ----
END_TS=$(date +%s)
DURATION=$((END_TS - START_TS))

log "=========================================="
log "恢复演练完成：耗时 ${DURATION}s，表 ${RESTORED_TABLES}/${PROD_TABLES}"
log "=========================================="

write_status
if [ "$RESULT" = "PASS" ]; then
  exit 0
fi
exit 1

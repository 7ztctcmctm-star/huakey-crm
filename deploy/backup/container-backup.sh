#!/bin/sh
# ============================================================
# HuakeyCRM 容器内三合一备份调度器（huakey-backup 容器专用）
#
# 背景：mysql:8.0 镜像无 crond（原 compose 直接 crond -f 导致容器无限崩溃），
#       改用纯 shell 定点等待循环，零外部依赖（镜像自带 bash/tar/gzip/mysqldump）。
#
# 时间线（对齐灾备设计）：
#   02:00  MySQL 全量备份（复用 database/backup.sh，容器内 mysqldump -h mysql）
#   02:30  app-uploads 文件备份（挂载 named volume，tar.gz 打包）
#   02:45  配置文件 + SSL 证书备份（.env/.env.secrets/compose/nginx/，加密）
#   03:00  月度恢复演练（仅每月 1 日；03:00 后容器重启则启动时补跑，状态文件保证每月至多一次）
#
# 保留策略：MySQL 30 天（backup.sh 内置）；uploads/config 各 7 天
# 日志：/backups/container-backup.log（宿主机 database/backups/）
#
# 双保险：宿主机 /etc/cron.d/crm-backup 每日 04:00 另有一份 MySQL 备份。
# 已知限制：DSM 层 nginx 反代配置（/usr/local/etc/nginx/conf.d/）在容器外，
#           不在本脚本备份范围（恢复方式见 docs/crm-v1-internal-domain-deployment.md）。
#
# 手动触发（验证用）：docker exec huakey-backup sh /container-backup.sh --once
# 手动演练（验证用）：docker exec huakey-backup bash /restore-test.sh
#
# D3 加固（2026-10-22，docs/deploy-hardening-d3.md）：
#   - backup.sh 改经 bash 调用（pipefail 需要 bash，sh→bash POSIX 模式亦可）
#   - uploads 备份补 tar 解压强校验（原仅计数，损坏时计数为 0 却不报失败）
#   - config 备份加密：.env.secrets 含明文密钥，明文 tar 一律不允许落盘——
#     有口令文件时 gpg（无则 openssl）对称加密并解密回验；无口令/无工具时
#     排除 .env.secrets 并 WARNING。口令文件 .backup-enc-pass 由 deploy.sh
#     或 deploy/backup/setup-backup-encryption.sh 生成，仅存 NAS 宿主机。
#   - 月度恢复演练接入本调度器（宿主机 /etc/cron.d 对部署账号不可写，
#     故容器内调度为本 NAS 的实际执行机制；deploy/cron/ 下另备 root 安装脚本）
# ============================================================

LOG_FILE="/backups/container-backup.log"
DRILL_SCRIPT="/restore-test.sh"
DRILL_STATUS="/backups/restore-drill.status"
# 备份加密口令文件（宿主机 .backup-enc-pass 只读挂载到 /stack/）
ENC_PASS_FILE="${BACKUP_ENC_PASS_FILE:-/stack/.backup-enc-pass}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# ---- 1. MySQL 备份（复用挂载的 database/backup.sh，其内部自带 set -euo pipefail、完整性校验与保留策略）----
run_mysql() {
  log "---- MySQL 备份开始 ----"
  if bash /backup.sh >> "$LOG_FILE" 2>&1; then
    log "MySQL 备份成功"
  else
    log "FATAL: MySQL 备份失败（exit=$?）"
    return 1
  fi
  # dump 含全量业务数据，统一收紧为 600（含 04:00 宿主机任务产生的文件）
  chmod 600 /backups/huakey_crm_*.sql.gz 2>/dev/null || true
}

# ---- 2. uploads 文件备份（/uploads 为 app-uploads named volume 只读挂载）----
run_uploads() {
  log "---- uploads 文件备份开始 ----"
  mkdir -p /backups/uploads

  FILE="/backups/uploads/uploads_$(date +%Y%m%d).tar.gz"
  if ! tar -czf "$FILE" -C /uploads --exclude='*.tmp' --exclude='*.lock' . >> "$LOG_FILE" 2>&1; then
    log "FATAL: uploads tar 打包失败"
    rm -f "$FILE"
    return 1
  fi

  SIZE=$(stat -c%s "$FILE" 2>/dev/null || echo 0)
  if [ "$SIZE" -lt 100 ]; then
    log "FATAL: uploads 备份文件过小（${SIZE} bytes），疑似失败"
    rm -f "$FILE"
    return 1
  fi

  # 完整性校验：tar 必须能完整列出内容（gzip 损坏/截断时此项失败）
  if ! tar -tzf "$FILE" >/dev/null 2>&1; then
    log "FATAL: uploads 备份完整性校验失败（tar -tzf 无法解压），删除 ${FILE}"
    rm -f "$FILE"
    return 1
  fi

  COUNT=$(tar -tzf "$FILE" 2>/dev/null | grep -c -v '/$' || true)
  chmod 600 "$FILE"
  log "uploads 备份成功: $(basename "$FILE") (${SIZE} bytes, ${COUNT} 个文件，完整性校验通过)"

  # 保留 7 天
  find /backups/uploads -maxdepth 1 -type f -name 'uploads_*.tar.gz' -mtime +7 -delete 2>/dev/null
}

# ---- 3. 配置文件 + 证书备份（/stack 下为宿主机关键文件只读挂载）----
# 加密工具探测：优先 gpg（对称加密带 MDC 完整性保护），回退 openssl AES-256-CBC。
# 两者在本容器（Oracle Linux 9）与 NAS 宿主机均可用；工具一经使用请保持稳定，
# 旧产物只能由当时加密的工具解密（见 docs/deploy-hardening-d3.md）。
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

# 解密回验：加密产物必须能解密且 tar 结构完整，否则视为备份失败
verify_encrypted() {
  ENC="$1"
  PASS="$2"
  case "$ENC" in
    *.gpg)
      gpg --batch --quiet --decrypt --passphrase-file "$PASS" "$ENC" 2>/dev/null \
        | tar -tzf - >/dev/null 2>&1
      ;;
    *.enc)
      openssl enc -d -aes-256-cbc -pbkdf2 -in "$ENC" -pass file:"$PASS" 2>/dev/null \
        | tar -tzf - >/dev/null 2>&1
      ;;
    *)
      return 1
      ;;
  esac
}

run_config() {
  log "---- 配置文件备份开始 ----"
  mkdir -p /backups/config
  chmod 700 /backups/config

  STAGE=$(mktemp -d)

  # 关键文件缺失则中止（与宿主机版 config-backup.sh 一致）
  if [ ! -f /stack/.env.secrets ] || [ ! -f /stack/docker-compose.synology.yml ]; then
    log "FATAL: 关键文件缺失（.env.secrets / docker-compose.synology.yml）"
    rm -rf "$STAGE"
    return 1
  fi

  cp -p /stack/.env "$STAGE/" 2>/dev/null || log "WARNING: .env 不存在，跳过"
  cp -p /stack/docker-compose.synology.yml "$STAGE/" 2>/dev/null

  # nginx 配置 + SSL 证书
  if [ -d /stack/nginx ]; then
    mkdir -p "$STAGE/nginx"
    cp -rp /stack/nginx/. "$STAGE/nginx/" 2>/dev/null
  else
    log "WARNING: /stack/nginx 不存在，跳过"
  fi

  # .env.secrets 是否入包：取决于能否加密（D3 铁律——明文密钥不落盘）
  ENC_PASS=""
  if [ -f "$ENC_PASS_FILE" ]; then
    if command -v gpg >/dev/null 2>&1 || command -v openssl >/dev/null 2>&1; then
      ENC_PASS="$ENC_PASS_FILE"
      cp -p /stack/.env.secrets "$STAGE/"
      log "本次配置备份包含 .env.secrets，将加密落盘（口令: $ENC_PASS_FILE）"
    else
      log "WARNING: 有口令文件但容器内无 gpg/openssl，排除 .env.secrets"
    fi
  else
    log "WARNING: 未配置备份加密口令（$ENC_PASS_FILE），本次排除 .env.secrets（防明文密钥落盘）"
    log "WARNING: 修复：在 NAS 执行 bash deploy/backup/setup-backup-encryption.sh 后重启备份容器"
  fi

  FILE="/backups/config/config_$(date +%Y%m%d).tar.gz"
  if ! tar -czpf "$FILE" -C "$STAGE" . >> "$LOG_FILE" 2>&1; then
    log "FATAL: config tar 打包失败"
    rm -f "$FILE"
    rm -rf "$STAGE"
    return 1
  fi
  rm -rf "$STAGE"

  SIZE=$(stat -c%s "$FILE" 2>/dev/null || echo 0)
  if [ "$SIZE" -lt 100 ]; then
    log "FATAL: config 备份文件过小（${SIZE} bytes），疑似失败"
    rm -f "$FILE"
    return 1
  fi

  if [ -n "$ENC_PASS" ]; then
    ENC_FILE=$(encrypt_file "$FILE" "$ENC_PASS") || ENC_FILE=""
    if [ -z "$ENC_FILE" ] || ! verify_encrypted "$ENC_FILE" "$ENC_PASS"; then
      log "FATAL: config 备份加密或解密回验失败，删除明文与密文（防半成品）"
      rm -f "$FILE" "$ENC_FILE"
      return 1
    fi
    rm -f "$FILE"
    chmod 600 "$ENC_FILE"
    ENC_SIZE=$(stat -c%s "$ENC_FILE" 2>/dev/null || echo 0)
    log "配置备份成功（已加密）: $(basename "$ENC_FILE") (${ENC_SIZE} bytes, 解密回验通过, 明文已删除)"
    FILE="$ENC_FILE"
  else
    chmod 600 "$FILE"
    COUNT=$(tar -tzf "$FILE" 2>/dev/null | grep -c -v '/$' || true)
    log "配置备份成功（未含密钥）: $(basename "$FILE") (${SIZE} bytes, ${COUNT} 个文件, 权限 600)"
  fi

  # 保留 7 天（明文 tar 与加密产物一并清理）
  find /backups/config -maxdepth 1 -type f \
    \( -name 'config_*.tar.gz' -o -name 'config_*.tar.gz.gpg' -o -name 'config_*.tar.gz.enc' \) \
    -mtime +7 -delete 2>/dev/null
}

# ---- 4. 月度恢复演练（每月 1 日 03:00，基于状态文件幂等）----
# 宿主机 /etc/cron.d 对部署账号（syadmin）不可写，故本 NAS 的实际执行机制是
# 备份容器内调度；deploy/cron/install-restore-drill.sh 为 root 环境的等价载体。
# 状态文件 /backups/restore-drill.status 记录最近一次结果，可人工检查。
# 执行时机：
#   - 常规：1 日 02:45 后等到 03:00 执行；
#   - 补跑：容器在 1 日 03:00 之后重启时，启动时立即补跑。
# 已知窗口：容器在 1 日 02:00–03:00 之间重启会整月跳过演练——该窗口内当日
#   备份同样会被跳过，属调度器既有行为（wait_until 已过时刻即跳明日）。
drill_done_this_month() {
  MONTH_PREFIX=$(date +%Y-%m)
  [ -f "$DRILL_STATUS" ] || return 1
  grep -q "RESULT=PASS" "$DRILL_STATUS" 2>/dev/null || return 1
  grep -q "LAST_RUN=${MONTH_PREFIX}" "$DRILL_STATUS" 2>/dev/null
}

run_drill() {
  if [ ! -f "$DRILL_SCRIPT" ]; then
    log "FATAL: 演练脚本不存在: $DRILL_SCRIPT"
    return 1
  fi
  log "---- 月度恢复演练开始（$(date '+%Y-%m')）----"
  # timeout 兜底：演练异常挂起不会拖死后续备份调度（最多阻塞 1 小时）
  if command -v timeout >/dev/null 2>&1; then
    if timeout 3600 /bin/bash "$DRILL_SCRIPT" >> "$LOG_FILE" 2>&1; then
      log "月度恢复演练完成（结果详见 restore-test.log / restore-drill.status）"
    else
      log "FATAL: 月度恢复演练失败或被 timeout 终止（详见 restore-test.log）"
      return 1
    fi
  else
    if /bin/bash "$DRILL_SCRIPT" >> "$LOG_FILE" 2>&1; then
      log "月度恢复演练完成（结果详见 restore-test.log / restore-drill.status）"
    else
      log "FATAL: 月度恢复演练失败（详见 restore-test.log）"
      return 1
    fi
  fi
}

maybe_run_drill() {
  [ "$(date +%d)" = "01" ] || return 0
  drill_done_this_month && return 0
  wait_until "03:00"
  run_drill
}

# 启动补跑：容器在 1 日 03:00 之后重启时当场补跑（不阻塞启动流程）
catchup_drill() {
  [ "$(date +%d)" = "01" ] || return 0
  drill_done_this_month && return 0
  TARGET_0300=$(date -d "today 03:00" +%s 2>/dev/null || echo 0)
  NOW=$(date +%s)
  if [ "$TARGET_0300" -gt 0 ] && [ "$NOW" -ge "$TARGET_0300" ]; then
    log "检测到 1 日且已过 03:00 未演练，启动时补跑"
    run_drill
  fi
}

# ---- 定点等待：等到下一个 HH:MM（GNU date）----
wait_until() {
  TARGET=$(date -d "$1" +%s)
  NOW=$(date +%s)
  if [ "$TARGET" -le "$NOW" ]; then
    TARGET=$(date -d "tomorrow $1" +%s)
  fi
  log "等待 $1（还有 $((TARGET - NOW)) 秒）"
  sleep $((TARGET - NOW))
}

# ---- 入口 ----
mkdir -p /backups

if [ "${1:-}" = "--once" ]; then
  log "===== --once 手动模式开始 ====="
  run_mysql
  run_uploads
  run_config
  log "===== --once 手动模式结束 ====="
  exit 0
fi

log "===== 备份调度器启动（02:00 MySQL / 02:30 uploads / 02:45 config / 每月1日03:00 恢复演练，TZ=${TZ:-未设置}）====="
catchup_drill || log "启动补跑演练失败"
while true; do
  wait_until "02:00"
  run_mysql || log "本轮回结束后将继续下一任务（失败不中断调度）"
  wait_until "02:30"
  run_uploads || log "本轮 uploads 失败，等待明日重试"
  wait_until "02:45"
  run_config || log "本轮 config 失败，等待明日重试"
  maybe_run_drill || log "本轮恢复演练失败，下月 1 日重试"
done

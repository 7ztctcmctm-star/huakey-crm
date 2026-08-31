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
#   02:45  配置文件 + SSL 证书备份（.env/.env.secrets/compose/nginx/）
#
# 保留策略：MySQL 30 天（backup.sh 内置）；uploads/config 各 7 天
# 日志：/backups/container-backup.log（宿主机 database/backups/）
#
# 双保险：宿主机 /etc/cron.d/crm-backup 每日 04:00 另有一份 MySQL 备份。
# 已知限制：DSM 层 nginx 反代配置（/usr/local/etc/nginx/conf.d/）在容器外，
#           不在本脚本备份范围（恢复方式见 docs/crm-v1-internal-domain-deployment.md）。
#
# 手动触发（验证用）：docker exec huakey-backup sh /container-backup.sh --once
# ============================================================

LOG_FILE="/backups/container-backup.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# ---- 1. MySQL 备份（复用挂载的 database/backup.sh，其内部自带 set -e 与保留策略）----
run_mysql() {
  log "---- MySQL 备份开始 ----"
  if sh /backup.sh >> "$LOG_FILE" 2>&1; then
    log "MySQL 备份成功"
  else
    log "FATAL: MySQL 备份失败（exit=$?）"
    return 1
  fi
  # dump 含全量业务数据，统一收紧为 600（含 04:00 宿主机任务产生的文件）
  chmod 600 /backups/huakey_crm_*.sql.gz 2>/dev/null
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

  COUNT=$(tar -tzf "$FILE" 2>/dev/null | grep -c -v '/$')
  chmod 600 "$FILE"
  log "uploads 备份成功: $(basename "$FILE") (${SIZE} bytes, ${COUNT} 个文件)"

  # 保留 7 天
  find /backups/uploads -maxdepth 1 -type f -name 'uploads_*.tar.gz' -mtime +7 -delete 2>/dev/null
}

# ---- 3. 配置文件 + 证书备份（/stack 下为宿主机关键文件只读挂载）----
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
  cp -p /stack/.env.secrets "$STAGE/" 2>/dev/null
  cp -p /stack/docker-compose.synology.yml "$STAGE/" 2>/dev/null

  # nginx 配置 + SSL 证书
  if [ -d /stack/nginx ]; then
    mkdir -p "$STAGE/nginx"
    cp -rp /stack/nginx/. "$STAGE/nginx/" 2>/dev/null
  else
    log "WARNING: /stack/nginx 不存在，跳过"
  fi

  FILE="/backups/config/config_$(date +%Y%m%d).tar.gz"
  if ! tar -czpf "$FILE" -C "$STAGE" . >> "$LOG_FILE" 2>&1; then
    log "FATAL: config tar 打包失败"
    rm -f "$FILE" "$STAGE"
    return 1
  fi
  rm -rf "$STAGE"

  # 备份文件仅 root 可读（含 .env.secrets）
  chmod 600 "$FILE"

  SIZE=$(stat -c%s "$FILE" 2>/dev/null || echo 0)
  if [ "$SIZE" -lt 100 ]; then
    log "FATAL: config 备份文件过小（${SIZE} bytes），疑似失败"
    rm -f "$FILE"
    return 1
  fi

  COUNT=$(tar -tzf "$FILE" 2>/dev/null | grep -c -v '/$')
  log "配置备份成功: $(basename "$FILE") (${SIZE} bytes, ${COUNT} 个文件，权限 600)"

  # 保留 7 天
  find /backups/config -maxdepth 1 -type f -name 'config_*.tar.gz' -mtime +7 -delete 2>/dev/null
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

log "===== 备份调度器启动（02:00 MySQL / 02:30 uploads / 02:45 config，TZ=${TZ:-未设置}）====="
while true; do
  wait_until "02:00"
  run_mysql || log "本轮回结束后将继续下一任务（失败不中断调度）"
  wait_until "02:30"
  run_uploads || log "本轮 uploads 失败，等待明日重试"
  wait_until "02:45"
  run_config || log "本轮 config 失败，等待明日重试"
done

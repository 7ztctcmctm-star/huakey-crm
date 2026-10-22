#!/bin/bash
# ============================================================
# HuakeyCRM MySQL 入口包装器（D3 · buffer pool 自适应）
#
# 背景：原 compose 写死 --innodb_buffer_pool_size=256M，NAS 内存因机型
#       与升级而变化，固定值要么浪费（大内存机型）要么吃紧（小内存机型）。
#       本脚本在容器启动时读取 /proc/meminfo，按总内存 25% 计算并钳制在
#       [128MB, 1024MB]，再交回官方 docker-entrypoint.sh 完成原有初始化
#       逻辑（首启建库 / 执行 /docker-entrypoint-initdb.d/*.sql / exec mysqld）。
#
# 参数与 docker-compose.synology.yml 原 command: 段落逐条等价（仅 pool 改为自适应）。
# 手动覆盖：设环境变量 INNODB_BUFFER_POOL_SIZE_MB 则优先使用该值。
# 探测失败（/proc/meminfo 不可读）时回退 256M，与原行为一致。
# ============================================================
set -eu

TOTAL_KB=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
TOTAL_MB=$(( TOTAL_KB / 1024 ))

if [ -n "${INNODB_BUFFER_POOL_SIZE_MB:-}" ]; then
  POOL_MB="$INNODB_BUFFER_POOL_SIZE_MB"
  POOL_SRC="env override"
elif [ "$TOTAL_MB" -gt 0 ]; then
  POOL_MB=$(( TOTAL_MB / 4 ))
  if [ "$POOL_MB" -lt 128 ]; then POOL_MB=128; fi
  if [ "$POOL_MB" -gt 1024 ]; then POOL_MB=1024; fi
  POOL_SRC="MemTotal/4"
else
  POOL_MB=256
  POOL_SRC="fallback"
fi

echo "[mysql-entrypoint] MemTotal=${TOTAL_MB}MB -> innodb_buffer_pool_size=${POOL_MB}MB (${POOL_SRC})"

exec /usr/local/bin/docker-entrypoint.sh mysqld \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci \
  --default-authentication-plugin=mysql_native_password \
  --innodb_buffer_pool_size="${POOL_MB}M" \
  --innodb_log_file_size=128M \
  --max_connections=100 \
  --skip-host-cache \
  --skip-name-resolve \
  --explicit_defaults_for_timestamp=1 \
  --slow_query_log=ON \
  --long_query_time=2 \
  --default-time-zone=+08:00 \
  "$@"

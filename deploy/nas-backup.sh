#!/bin/bash
# ============================================
# 铧旗CRM 数据库自动备份脚本
# 部署位置：NAS /volume1/docker/crm-stack/backup.sh
# 执行方式：群晖任务计划 每日 03:00
# 保留策略：每日备份保留 7 天，每周备份保留 4 周
# ============================================

set -euo pipefail

# 加载环境变量
export PATH=/usr/local/bin:/usr/bin:/bin
source /volume1/docker/crm-stack/.env.secrets

# 配置
BACKUP_DIR="/volume1/docker/crm-backups"
DB_NAME="huakey_crm"

# MySQL 容器名：必须与 deploy/docker-compose.prod.yml 的 container_name 保持一致。
# 【P0-3 缺陷背景】原值为 huakey-mysql，来自已废弃的 docker-compose.synology.yml，
# 与生产实际容器名 crm-prod-mysql 不符 —— docker exec 找不到容器，
# 管道产出空文件，而 2>/dev/null 吞掉了错误，导致【备份长期静默失败且无人察觉】。
# 允许用环境变量覆盖，以适配不同部署拓扑。
MYSQL_CONTAINER="${MYSQL_CONTAINER:-crm-prod-mysql}"
DATE_DAILY=$(date +%Y%m%d)
DATE_WEEKLY=$(date +%Y%m%d_weekly)
WEEKDAY=$(date +%u)  # 1=Monday, 7=Sunday

# 创建备份目录
mkdir -p "$BACKUP_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始备份数据库 $DB_NAME"

# 前置校验：容器必须存在，否则立即失败并给出可诊断信息。
# 原实现直接 docker exec 且丢弃 stderr，容器名不符时会静默产出空备份。
if ! docker inspect "$MYSQL_CONTAINER" >/dev/null 2>&1; then
  echo "[ERROR] 未找到 MySQL 容器：$MYSQL_CONTAINER"
  echo "        请确认该名称与 docker-compose 的 container_name 一致，"
  echo "        或通过环境变量指定：MYSQL_CONTAINER=<实际容器名>"
  echo "        当前运行中的容器："
  docker ps --format '          {{.Names}}' 2>/dev/null | head -20
  exit 1
fi

# 执行备份（通过 docker exec 调用容器内 mysqldump）
BACKUP_FILE="$BACKUP_DIR/huakey_crm_${DATE_DAILY}.sql.gz"
DUMP_ERR="$BACKUP_DIR/huakey_crm_${DATE_DAILY}.err"

# stderr 写入旁路日志而非丢弃：mysqldump 的「命令行密码」提示属正常，
# 但真正的失败原因必须留痕，不能再被静默吞掉。
if ! docker exec "$MYSQL_CONTAINER" mysqldump \
  -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --default-character-set=utf8mb4 \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  "$DB_NAME" 2>"$DUMP_ERR" | gzip > "$BACKUP_FILE"; then
  echo "[ERROR] 备份失败：mysqldump 执行出错（容器：$MYSQL_CONTAINER）"
  echo "        stderr 详见：$DUMP_ERR"
  tail -5 "$DUMP_ERR" 2>/dev/null | sed 's/^/          /'
  exit 1
fi

# 验证备份文件
# 仅检查「非空」无法发现截断或损坏的 gzip——那样会得到一个「看似成功但不可还原」的备份，
# 直到真正需要恢复时才会暴露。故追加 gzip 完整性校验。
if [ ! -s "$BACKUP_FILE" ]; then
  echo "[ERROR] 备份文件为空，备份失败！"
  exit 1
fi

if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
  echo "[ERROR] 备份文件完整性校验失败（gzip -t），文件可能已损坏：$BACKUP_FILE"
  exit 1
fi
echo "  ✓ 备份文件完整性校验通过"

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 每日备份完成: $BACKUP_FILE ($FILE_SIZE)"

# 每周日额外创建周备份（保留 4 周）
if [ "$WEEKDAY" = "7" ]; then
  WEEKLY_FILE="$BACKUP_DIR/huakey_crm_${DATE_WEEKLY}.sql.gz"
  cp "$BACKUP_FILE" "$WEEKLY_FILE"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 周备份完成: $WEEKLY_FILE"
fi

# 清理过期备份：每日备份保留 7 天
find "$BACKUP_DIR" -name "huakey_crm_*_weekly.sql.gz" -prune -o -name "huakey_crm_*.sql.gz" -mtime +7 -exec rm -f {} \;
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 已清理 7 天前的每日备份"

# 清理过期周备份：保留 4 周（28 天）
find "$BACKUP_DIR" -name "huakey_crm_*_weekly.sql.gz" -mtime +28 -exec rm -f {} \;
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 已清理 4 周前的周备份"

# 列出当前备份
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 当前备份文件列表:"
ls -lh "$BACKUP_DIR"/huakey_crm_*.sql.gz 2>/dev/null || echo "  (无)"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 备份流程完成"

#!/bin/bash
# ============================================================
# HuakeyCRM 恢复演练脚本（v3 - MYSQL_PWD 方式）
# 使用 MYSQL_PWD 环境变量避免密码特殊字符问题
# ============================================================
set -eu

STACK_DIR="/volume1/docker/crm-stack"
SECRETS_FILE="${STACK_DIR}/.env.secrets"
BACKUP_DIR="${STACK_DIR}/database/backups"
MYSQL_CONTAINER="huakey-mysql"
TEST_DB="huakey_crm_restore_test"
PROD_DB="huakey_crm"
LOG_FILE="${BACKUP_DIR}/restore-test.log"
DOCKER="/usr/local/bin/docker"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 加载密码
set +u
. "$SECRETS_FILE"
set -u
export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"

# 找最新备份
LATEST=$(ls -t "${BACKUP_DIR}"/huakey_crm_[0-9]*.sql.gz 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  log "FATAL: 未找到备份文件"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
touch "$LOG_FILE"

log "=========================================="
log "HuakeyCRM 恢复演练开始"
log "=========================================="
log "备份文件: $(basename "$LATEST")"
log "备份大小: $(stat -c%s "$LATEST") bytes"

# 辅助函数：执行 SQL（用 MYSQL_PDD 环境变量，不需 -p 参数）
run_sql() {
  $DOCKER exec -i "$MYSQL_CONTAINER" mysql -u root 2>/dev/null <<EOF
$1
EOF
}

run_sql_silent() {
  $DOCKER exec -i "$MYSQL_CONTAINER" mysql -u root -s -N 2>/dev/null <<EOF
$1
EOF
}

# 1. 清理旧临时库
log ""
log "=== 步骤 1: 清理旧临时库 ==="
run_sql "DROP DATABASE IF EXISTS ${TEST_DB};"
log "已清理"

# 2. 创建临时库
log ""
log "=== 步骤 2: 创建临时数据库 ==="
run_sql "CREATE DATABASE ${TEST_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
log "创建完成"

# 3. 解压 + docker cp + 容器内导入
log ""
log "=== 步骤 3: 导入备份 ==="
START_TIME=$(date +%s)

TMP_SQL="/tmp/restore_test_$(date +%s).sql"
log "解压备份..."
gunzip -c "$LATEST" > "$TMP_SQL"
SQL_SIZE=$(stat -c%s "$TMP_SQL")
log "解压完成: ${SQL_SIZE} bytes"

CONTAINER_SQL="/tmp/restore_test.sql"
log "拷贝到容器..."
$DOCKER cp "$TMP_SQL" "${MYSQL_CONTAINER}:${CONTAINER_SQL}"

log "执行导入..."
$DOCKER exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" "$MYSQL_CONTAINER" \
  sh -c "mysql -u root ${TEST_DB} < ${CONTAINER_SQL}" 2>/dev/null
log "导入完成"

rm -f "$TMP_SQL"
$DOCKER exec "$MYSQL_CONTAINER" rm -f "$CONTAINER_SQL" 2>/dev/null || true

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "导入耗时: ${DURATION} 秒"

# 4. 验证表数量
log ""
log "=== 步骤 4: 验证表数量 ==="
TABLE_COUNT=$(run_sql_silent "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${TEST_DB}';")
PROD_TABLE_COUNT=$(run_sql_silent "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${PROD_DB}';")
log "生产库表数量: ${PROD_TABLE_COUNT}"
log "恢复库表数量: ${TABLE_COUNT}"
if [ "${TABLE_COUNT:-0}" -eq "${PROD_TABLE_COUNT:-0}" ]; then
  log "表数量验证: PASS"
else
  log "表数量验证: WARN"
fi

# 5. 验证关键表数据
log ""
log "=== 步骤 5: 验证关键表数据 ==="
for TABLE in crm_customer crm_opportunity crm_quote crm_contract; do
  TEST_COUNT=$(run_sql_silent "SELECT COUNT(*) FROM ${TEST_DB}.${TABLE};" 2>/dev/null || echo "N/A")
  PROD_COUNT=$(run_sql_silent "SELECT COUNT(*) FROM ${PROD_DB}.${TABLE};" 2>/dev/null || echo "N/A")
  log "  ${TABLE}: 生产=${PROD_COUNT} 恢复=${TEST_COUNT}"
done

# 6. 验证关键表结构
log ""
log "=== 步骤 6: 验证关键表结构 ==="
for TABLE in crm_customer crm_opportunity crm_quote crm_contract; do
  COL_COUNT=$(run_sql_silent "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='${TEST_DB}' AND table_name='${TABLE}';")
  log "  ${TABLE}: ${COL_COUNT} 列"
done

# 7. 抽样数据验证
log ""
log "=== 步骤 7: 抽样数据验证 ==="
SAMPLE=$(run_sql_silent "SELECT CONCAT('id=', id, ' name=', name) FROM ${TEST_DB}.crm_customer LIMIT 1;" 2>/dev/null || echo "无数据")
log "  crm_customer 抽样: ${SAMPLE}"

# 8. 清理临时库
log ""
log "=== 步骤 8: 清理临时库 ==="
run_sql "DROP DATABASE IF EXISTS ${TEST_DB};"
log "临时库已删除"

log ""
log "=========================================="
log "恢复演练完成"
log "恢复耗时: ${DURATION} 秒"
log "表数量: ${TABLE_COUNT}/${PROD_TABLE_COUNT}"
log "=========================================="

#!/usr/bin/env bash
# ============================================================
# 在**临时库**上验证 database/seeds/*.sql 能否真正执行、且落库结果符合业务语义。
#
# 为什么需要：
#   seed 文件长期「从未被成功执行过」（2026-09-12 才发现其环境守卫是死代码，
#   任何库上都报 ERROR 1054）。没有实跑验证，schema 漂移（如漏写 business_status
#   导致正式客户列表恒空）只会在 CI 上以「E2E 红灯」的形式暴露，且极难定位。
#
# 安全性：
#   · **绝不触碰任何既有库** —— 全程只操作本脚本自建的临时库（名字含 test）
#   · 结构来源：mysqldump --no-data 从 $SOURCE_DB 导出
#   · 结束（含失败）时自动 DROP 临时库
#
# 用法：
#   bash scripts/verify-seeds.sh
#   环境变量（均有默认值）：
#     DB_HOST(127.0.0.1) DB_PORT(3306) DB_USER(root) DB_PASSWORD
#     SOURCE_DB(huakey_crm_test)   结构来源库
#     TMP_DB(huakey_seed_verify_test)  临时库名（必须含 test，否则守卫会中止）
#     MYSQL_BIN / MYSQLDUMP_BIN    可执行文件路径（自动探测，找不到时需手动指定）
#
# 退出码：0 = 全部通过；非 0 = 有检查项失败
# ============================================================
set -uo pipefail

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
SOURCE_DB="${SOURCE_DB:-huakey_crm_test}"
TMP_DB="${TMP_DB:-huakey_seed_verify_test}"

# 定位 mysql 客户端 与 mysqldump（两者需分别解析 —— 曾误用 mysql 执行 dump 选项）
resolve_bin() { # $1=环境变量值 $2=命令名
  if [ -n "$1" ] && { command -v "$1" >/dev/null 2>&1 || [ -x "$1" ]; }; then echo "$1"; return; fi
  if command -v "$2" >/dev/null 2>&1; then echo "$2"; return; fi
  for d in "/c/Program Files/MySQL/mysql-8.0.46-winx64/bin" \
           "/c/Program Files/MySQL/MySQL Server 8.0/bin" \
           "/usr/local/mysql/bin" "/usr/bin"; do
    [ -x "$d/$2" ] && { echo "$d/$2"; return; }
  done
  echo ""
}
MYSQL_BIN="$(resolve_bin "${MYSQL_BIN:-}" mysql)"
DUMP_BIN="$(resolve_bin "${MYSQLDUMP_BIN:-}" mysqldump)"
for pair in "mysql:$MYSQL_BIN" "mysqldump:$DUMP_BIN"; do
  name="${pair%%:*}"; path="${pair#*:}"
  if [ -z "$path" ]; then
    echo "❌ 找不到 $name。请设置 MYSQL_BIN / MYSQLDUMP_BIN 指向可执行文件。" >&2
    exit 2
  fi
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PWF=""
[ -n "$DB_PASSWORD" ] && PWF="-p${DB_PASSWORD}"

my() { "$MYSQL_BIN" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" $PWF "$@" 2>/dev/null; }
mydb() { my "$TMP_DB" "$@"; }

FAIL=0
cleanup() {
  echo ""
  echo "── 清理临时库 $TMP_DB ──"
  my -e "DROP DATABASE IF EXISTS \`$TMP_DB\`;" && echo "✅ 已删除（既有库未受影响）"
}
trap cleanup EXIT

echo "=== 零、连通性与前置检查 ==="
if ! my -N -B -e "SELECT 1" | grep -q '^1$'; then
  echo "❌ 无法连接 MySQL（$DB_USER@$DB_HOST:$DB_PORT）。请检查凭据。" >&2
  exit 2
fi
echo "✅ 连接成功"
SRC_TABLES=$(my -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$SOURCE_DB'")
if [ "${SRC_TABLES:-0}" -lt 50 ]; then
  echo "❌ 源库 $SOURCE_DB 不存在或表数过少（$SRC_TABLES）" >&2
  exit 2
fi
echo "✅ 源库 $SOURCE_DB 有 $SRC_TABLES 张表"

echo ""
echo "=== 一、建临时库并导入结构 ==="
my -e "DROP DATABASE IF EXISTS \`$TMP_DB\`; CREATE DATABASE \`$TMP_DB\` DEFAULT CHARACTER SET utf8mb4;"
DUMP="${ROOT}/.tmp-seed-verify-schema.sql"
if ! "$DUMP_BIN" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" $PWF \
      --no-data --skip-triggers --skip-add-drop-table "$SOURCE_DB" > "$DUMP" 2>"${DUMP}.err"; then
  echo "❌ mysqldump 失败："
  grep -v "Using a password" "${DUMP}.err" | head -5 | sed 's/^/     /'
  rm -f "${DUMP}.err"; exit 2
fi
rm -f "${DUMP}.err"
if ! my "$TMP_DB" < "$DUMP"; then
  echo "❌ 结构导入失败（详情见上）"; FAIL=1
fi
rm -f "$DUMP"
T=$(my -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$TMP_DB'")
echo "✅ 临时库表数: $T"
if [ "${T:-0}" -eq 0 ]; then
  echo "❌ 结构未导出成功，后续断言无意义，提前退出"; exit 2
fi

echo ""
echo "=== 二、按真实顺序执行 seed ==="
# N-04 已修复（2026-09-12）：test_data_modules.sql 现在**自带** sys_dept 数据
# （INSERT IGNORE 固定 id + 按名兜底），并用 @变量按名称解析 dept_id，
# 不再硬编码 1/2，也不需要调用方预置部门数据。
#
# 因此这里**刻意不再做任何前置补齐** —— 让结构空库保持「空」的状态直接跑 seed。
# 这既是对 N-04 修复效果的验证（下方 §三 有对应断言），
# 也保证脚本能真实复现「干净库上 seed 是否可用」这一场景。
DEPT_BEFORE=$(my -N -B -e "SELECT COUNT(*) FROM \`$TMP_DB\`.sys_dept")
echo "ℹ️  执行前 sys_dept 行数 = $DEPT_BEFORE（应为 0，即结构空库；由 seed 自行兜底）"

for f in database/seeds/seed_test_data.sql database/seeds/test_data_modules.sql; do
  [ -f "$ROOT/$f" ] || { echo "⚠️  跳过（不存在）: $f"; continue; }
  echo "── 执行 $f"
  OUT=$("$MYSQL_BIN" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" $PWF "$TMP_DB" < "$ROOT/$f" 2>&1 \
        | grep -v "Using a password")
  RC=$?
  if echo "$OUT" | grep -qE "^ERROR"; then
    echo "❌ 出现错误："
    echo "$OUT" | grep -E "^ERROR" | head -10 | sed 's/^/     /'
    # 守卫在非测试库上中止是预期行为，临时库名含 test 故不应触发
    if echo "$OUT" | grep -q "ABORT__NOT_A_TEST_DATABASE"; then
      echo "     ↑ 守卫被触发 —— 临时库名必须含 'test'（当前 $TMP_DB）"
    fi
    FAIL=1
  else
    echo "✅ 无错误"
  fi
done

echo ""
echo "=== 三、落库结果断言 ==="
assert() { # $1=说明 $2=SQL $3=期望
  local got; got=$(mydb -N -B -e "$2")
  if [ "$got" = "$3" ]; then
    printf '✅ %-42s = %s\n' "$1" "$got"
  else
    printf '❌ %-42s = %s （期望 %s）\n' "$1" "$got" "$3"; FAIL=1
  fi
}

# 核心不变量：seed 客户不得堆积在 lead（否则正式客户列表恒空 → E2E 必红）
assert "客户总数" \
  "SELECT COUNT(*) FROM crm_customer WHERE deleted_at IS NULL" "142"
assert "堆积为 lead 的客户数（必须 0）" \
  "SELECT COUNT(*) FROM crm_customer WHERE deleted_at IS NULL AND business_status='lead'" "0"
assert "正式客户列表可见数" \
  "SELECT COUNT(*) FROM crm_customer WHERE deleted_at IS NULL AND business_status IN ('following','quoted','negotiating','signed') AND pool_status='private'" "142"
assert "pool_status 全为 private 的客户数" \
  "SELECT COUNT(*) FROM crm_customer WHERE deleted_at IS NULL AND pool_status='private'" "142"
assert "逾期提醒条数（>0 证明 WHERE 修复生效）" \
  "SELECT COUNT(*) > 0 FROM crm_follow_up_reminder" "1"
assert "110 号对账漂移行数（必须 0）" \
  "SELECT COUNT(*) FROM crm_customer WHERE deleted_at IS NULL AND ((status IN ('lead','following','quoted','negotiating','signed','lost') AND business_status <> status) OR (status IN ('sea','paused') AND business_status='lead'))" "0"

# ── N-04 专项断言（2026-09-12）：seed 必须在结构空库上自带部门并正确解析 dept_id ──
assert "N-04 部门由 seed 自带（总经办/销售部）" \
  "SELECT COUNT(*) FROM sys_dept WHERE name IN ('总经办','销售部')" "2"
assert "N-04 测试用户 dept_id 均非 NULL（外键不再失败）" \
  "SELECT COUNT(*) FROM sys_user WHERE username IN ('boss','manager_zhang','sales_wang','sales_li','sales_zhao','sales_chen') AND dept_id IS NULL" "0"
assert "N-04 老板归属「总经办」" \
  "SELECT COUNT(*) FROM sys_user u JOIN sys_dept d ON u.dept_id=d.id WHERE u.username='boss' AND d.name='总经办'" "1"
assert "N-04 经理与销售归属「销售部」" \
  "SELECT COUNT(*) FROM sys_user u JOIN sys_dept d ON u.dept_id=d.id WHERE u.username IN ('manager_zhang','sales_wang','sales_li','sales_zhao','sales_chen') AND d.name='销售部'" "5"

echo ""
echo "=== 四、结果 ==="
if [ "$FAIL" -eq 0 ]; then
  echo "✅ 全部通过 —— seed 可在测试库正确执行，落库结果符合业务语义"
else
  echo "❌ 存在失败项，见上方 ❌ 标记"
fi
exit "$FAIL"

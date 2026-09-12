#!/usr/bin/env bash
# ============================================================
# scripts/verify-ci-missing-tables.sh
# ============================================================
# 作用:在 apply deploy/ci-missing-tables.sql 之后,执行
#       deploy/ci-missing-tables-verify.sql,检查 92 项
#       information_schema invariant 是否满足。
# CI workflow 与本机 verify 都需要。
#
# 用法:
#   ./scripts/verify-ci-missing-tables.sh <DB_NAME> [HOST] [PORT] [USER] [PASS]
#
#   默认:DB_NAME=huakey_crm_test
#         HOST=127.0.0.1 PORT=3306 USER=root PASS=huakey123
#
# CI 内调用形态(.github/workflows/ci.yml):
#   sed "s/\`huakey_crm\`/\`huakey_crm_test\`/g; s/'huakey_crm'/'huakey_crm_test'/g" \
#       deploy/ci-missing-tables-verify.sql | \
#     docker exec -i ci-mysql mysql -u root -ptest_root_pass huakey_crm_test
#   # CI 自身要把 exit 1 传给 step,做法:捕获输出 grep 'N-05 FAIL' 且 N-05_FAILED != 0
#   # 推荐用本脚本的 --ci-strict 模式替之。
# ============================================================

set -uo pipefail

DB_NAME="${1:-huakey_crm_test}"
HOST="${2:-127.0.0.1}"
PORT="${3:-3306}"
USER="${4:-root}"
PASS="${5:-huakey123}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERIFY_SQL="$ROOT_DIR/deploy/ci-missing-tables-verify.sql"

if [ ! -f "$VERIFY_SQL" ]; then
  echo "✗ $VERIFY_SQL not found" >&2
  exit 2
fi

# 翻译:verify.sql 里没有 huakey_crm 库名出现 (走 DATABASE()),但保险起见也 sed 一下
TMP_SQL="$(mktemp -t n05_verify.XXXXXX.sql)"
trap 'rm -f "$TMP_SQL"' EXIT
sed "s/\`huakey_crm\`/\`${DB_NAME}\`/g; s/'huakey_crm'/'${DB_NAME}'/g" \
  "$VERIFY_SQL" > "$TMP_SQL"

# 跑 verify (管道模式 mysql EXIT 才能反映 SIGNAL;但这里的设计不需要 SIGNAL,只读 stdout)
# 用 --batch 模式输出 TSV,便于 awk 解析; table 模式输出有 ASCII 框会乱匹配
OUT=$(mysql -h "$HOST" -P "$PORT" -u "$USER" -p"$PASS" --batch "$DB_NAME" < "$TMP_SQL" 2>&1)
RAW_EXIT=$?

# 输出原样回放 (CI 日志需要)
echo "$OUT"

# 解析 N-05_FINAL 与 N-05_PASSED/TOTAL/FAILED
# batch 模式下输出结构(grep 去掉 mysql warning 后):
#   L1: header  "N-05_ITEM_REPORT\tN-05_PASSED\tN-05_TOTAL\tN-05_FAILED"
#   L2: data    "<item_report>\t<passed>\t<total>\t<failed>"
#   L3: header  "N-05_FINAL"
#   L4: data    "<final report>"
CLEAN=$(echo "$OUT" | grep -v "Using a password")
# 行号是相对于 CLEAN
N05_PASSED=$(echo "$CLEAN" | awk -F'\t' 'NR==2{print $2}')
N05_TOTAL=$(echo "$CLEAN" | awk -F'\t' 'NR==2{print $3}')
N05_FAILED=$(echo "$CLEAN" | awk -F'\t' 'NR==2{print $4}')
N05_FINAL=$(echo "$CLEAN" | awk -F'\t' 'NR==4{print $1}')

# 兜底:若 N05_FAILED 没解析到,从 N05_FINAL 提取 "92/92" 形式
if [ -z "$N05_FAILED" ] || [ -z "$N05_TOTAL" ]; then
  N05_NUMS=$(echo "$N05_FINAL" | grep -oE '[0-9]+/[0-9]+' | head -1)
  N05_FAILED_HINT=$(echo "$N05_NUMS" | awk -F'/' '{print $1}')
  N05_TOTAL_HINT=$(echo "$N05_NUMS" | awk -F'/' '{print $2}')
  : "${N05_FAILED:=$N05_FAILED_HINT}"
  : "${N05_TOTAL:=$N05_TOTAL_HINT}"
fi

# 默认值兜底
: "${N05_PASSED:=0}"
: "${N05_TOTAL:=0}"
: "${N05_FAILED:=0}"

echo ""
echo "=== N-05 verify summary ==="
echo "DB:                 $DB_NAME"
echo "Passed:             $N05_PASSED/$N05_TOTAL"
echo "Failed:             $N05_FAILED"
echo "Raw mysql exit:     $RAW_EXIT"

if echo "$N05_FINAL" | grep -q "^N-05 FAIL:"; then
  echo "Result:             ✗ FAIL"
  echo "Detail: $N05_FINAL"
  exit 1
fi

if [ "${N05_FAILED}" -gt 0 ]; then
  echo "Result:             ✗ FAIL (parser reported failed=$N05_FAILED)"
  exit 1
fi

echo "Result:             ✓ PASS"
exit 0

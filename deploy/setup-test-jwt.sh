#!/bin/bash
# ============================================
# 铧旗CRM — 测试环境 JWT 密钥生成脚本
#
# 背景：
#   deploy/docker-compose.test.yml 使用 JWT_SECRET_TEST（fail-fast 必填），
#   且该密钥必须与生产 JWT_SECRET 不同，否则测试环境签发的 token 在生产同样有效。
#
# 用法：
#   bash deploy/setup-test-jwt.sh            # 默认处理 .env.secrets
#   bash deploy/setup-test-jwt.sh <文件>     # 指定 secrets 文件
#
# 行为：
#   - 已有合法的 128 位 hex 值：不覆盖，校验与 JWT_SECRET 不重复后退出 0
#   - 值为空或仍是模板占位：生成新值并原地替换
#   - 文件不存在：报错退出（先 cp .env.secrets.example .env.secrets）
#
# 安全：脚本不会输出密钥值；写入后文件权限强制为 600。
# ============================================

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SECRETS_ARG="${1:-.env.secrets}"

case "$SECRETS_ARG" in
  /*) SECRETS_PATH="$SECRETS_ARG" ;;
  *)  SECRETS_PATH="$PROJECT_DIR/$SECRETS_ARG" ;;
esac

if [ ! -f "$SECRETS_PATH" ]; then
  echo "FATAL: 未找到 secrets 文件: $SECRETS_PATH"
  echo "请先执行: cp .env.secrets.example .env.secrets"
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "FATAL: 未找到 openssl，无法生成随机密钥"
  exit 1
fi

# 读取文件中某个变量的值（最后一个定义生效，与 shell source 行为一致）
read_var() {
  local name="$1"
  local value
  value=$(grep -E "^${name}=" "$SECRETS_PATH" | tail -n 1 | cut -d= -f2- || true)
  # 去掉可能存在的行尾 \r（Windows 编辑器保存）
  value="${value%$'\r'}"
  # 去掉包裹引号
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}

JWT_TEST="$(read_var JWT_SECRET_TEST)"
JWT_PROD="$(read_var JWT_SECRET)"

is_valid_hex() {
  [[ "$1" =~ ^[a-fA-F0-9]{128}$ ]]
}

is_placeholder() {
  case "$1" in
    ''|*your_*|*YOUR_*|*changeme*|*CHANGEME*|*replace_me*|*REPLACE_ME*) return 0 ;;
    *) return 1 ;;
  esac
}

if [ -n "$JWT_TEST" ] && is_valid_hex "$JWT_TEST"; then
  if [ -n "$JWT_PROD" ] && [ "$JWT_TEST" = "$JWT_PROD" ]; then
    echo "FATAL: JWT_SECRET_TEST 与 JWT_SECRET 相同，测试环境 token 会与生产互通"
    echo "请手动删除 $SECRETS_PATH 中的 JWT_SECRET_TEST 行后重新执行本脚本"
    exit 1
  fi
  chmod 600 "$SECRETS_PATH" 2>/dev/null || true
  echo "OK: JWT_SECRET_TEST 已存在且格式合法（未修改，值不显示）"
  exit 0
fi

if [ -n "$JWT_TEST" ] && ! is_placeholder "$JWT_TEST"; then
  echo "FATAL: JWT_SECRET_TEST 已存在但不是 128 位 hex，且不像模板占位值"
  echo "为避免覆盖可能仍在使用中的密钥，脚本已中止；请人工确认后修正该行"
  exit 1
fi

NEW_SECRET="$(openssl rand -hex 64)"

if [ -n "$JWT_PROD" ] && [ "$NEW_SECRET" = "$JWT_PROD" ]; then
  # 概率可忽略，但保持 fail-closed
  echo "FATAL: 生成的密钥与 JWT_SECRET 相同，请重新执行"
  exit 1
fi

TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/crm-test-jwt.XXXXXX")"
cleanup() { rm -f "$TMP_FILE"; }
trap cleanup EXIT

if grep -qE '^JWT_SECRET_TEST=' "$SECRETS_PATH"; then
  # 保留最后一条定义，其余重复行删除；用 awk 而非 sed，避免密钥进入命令行参数
  awk -v new="$NEW_SECRET" '
    BEGIN { last = 0 }
    /^JWT_SECRET_TEST=/ { last = NR }
    { lines[NR] = $0 }
    END {
      for (i = 1; i <= NR; i++) {
        if (lines[i] ~ /^JWT_SECRET_TEST=/) {
          if (i == last) print "JWT_SECRET_TEST=" new
        } else {
          print lines[i]
        }
      }
    }
  ' "$SECRETS_PATH" > "$TMP_FILE"
else
  cat "$SECRETS_PATH" > "$TMP_FILE"
  # 保证追加前有换行
  if [ -s "$TMP_FILE" ] && [ "$(tail -c 1 "$TMP_FILE" | od -An -t u1 | tr -d ' ')" != "10" ]; then
    printf '\n' >> "$TMP_FILE"
  fi
  printf 'JWT_SECRET_TEST=%s\n' "$NEW_SECRET" >> "$TMP_FILE"
fi

chmod 600 "$TMP_FILE"
mv -f "$TMP_FILE" "$SECRETS_PATH"
trap - EXIT
chmod 600 "$SECRETS_PATH" 2>/dev/null || true

echo "OK: 已写入 JWT_SECRET_TEST 到 $SECRETS_PATH（值不显示，权限 600）"
echo "提示: 部署测试栈前需 source deploy/inject-secrets.sh 导出环境变量"

#!/bin/bash
# ============================================
# 铧旗CRM 生产环境敏感凭据注入脚本
#
# 用法（必须由父 shell source，不能单独执行）：
#   source deploy/inject-secrets.sh
#   # 或
#   . deploy/inject-secrets.sh
#
# 说明：
#   1. 从 .env.secrets 读取生产真实敏感值并导出到当前 shell 环境。
#   2. docker-compose 会优先使用当前 shell 环境变量，覆盖 .env 文件中的值。
#   3. .env.secrets 必须已加入 .gitignore，禁止提交到版本库。
# ============================================

set -e

SECRETS_FILE="${SECRETS_FILE:-.env.secrets}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SECRETS_PATH="$PROJECT_DIR/$SECRETS_FILE"

if [ ! -f "$SECRETS_PATH" ]; then
  echo "FATAL: 未找到 secrets 文件: $SECRETS_PATH"
  echo "请复制 .env.secrets.example 为 .env.secrets 并填写生产真实值"
  exit 1
fi

# 权限检查：必须 600/400，拒绝组/其他可读
perms=$(stat -c %a "$SECRETS_PATH" 2>/dev/null || stat -f %Lp "$SECRETS_PATH" 2>/dev/null)
if [ -n "$perms" ] && [ "$perms" != "600" ] && [ "$perms" != "400" ]; then
  echo "FATAL: $SECRETS_FILE 权限为 $perms，存在泄露风险"
  echo "请执行: chmod 600 $SECRETS_PATH"
  exit 1
fi

# 将 secrets 导出到当前 shell 环境
set -a
# shellcheck source=/dev/null
source "$SECRETS_PATH"
set +a

echo "✓ 已从 $SECRETS_FILE 加载生产敏感凭据"

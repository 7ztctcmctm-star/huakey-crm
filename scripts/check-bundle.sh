#!/bin/bash
set -e
DIST_DIR="frontend/dist"

echo "[Bundle Check] 检查打包产物..."

# 1. dist 存在
[ -d "$DIST_DIR" ] || { echo "FAIL: dist 目录不存在"; exit 1; }

# 2. index.html 存在且非空
[ -s "$DIST_DIR/index.html" ] || { echo "FAIL: index.html 不存在或为空"; exit 1; }

# 3. 总大小不超过 10MB
TOTAL_SIZE=$(du -sm "$DIST_DIR" | cut -f1)
echo "[Bundle Check] dist 总大小: ${TOTAL_SIZE}MB"
if [ "$TOTAL_SIZE" -gt 10 ]; then
  echo "::warning::dist 目录超过 10MB (${TOTAL_SIZE}MB)"
fi

# 4. 单个 JS 文件不超过 1MB
OVERSIZED=$(find "$DIST_DIR/assets" -name "*.js" -size +1M 2>/dev/null)
if [ -n "$OVERSIZED" ]; then
  echo "::warning::以下 JS 文件超过 1MB:"
  echo "$OVERSIZED"
fi

# 5. 不应有 sourcemap
MAPS=$(find "$DIST_DIR" -name "*.map" 2>/dev/null)
if [ -n "$MAPS" ]; then
  echo "::warning::发现 sourcemap 文件，生产构建应禁用"
fi

echo "[Bundle Check] 通过"

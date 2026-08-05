#!/bin/bash
# 华科 CRM 部署后冒烟测试 (Phase 10 P3-2)
# 用法：bash scripts/smoke-test.sh [BASE_URL]
# 默认 BASE_URL=http://localhost

set -e

BASE_URL="${1:-http://localhost}"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local url="$2"
  local expected="$3"
  local resp
  resp=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url" 2>/dev/null || echo "000")
  if [ "$resp" = "$expected" ]; then
    echo "  [PASS] $desc (HTTP $resp)"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $desc — expected HTTP $expected, got $resp"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== 华科 CRM Smoke Test ==="
echo "Target: $BASE_URL"
echo ""

# 1. 健康检查（无需认证）
check "Health endpoint"      "$BASE_URL/api/v1/health"        "200"

# 2. 验证码（无需认证）
check "Captcha endpoint"     "$BASE_URL/api/v1/auth/captcha"  "200"

# 3. 登录页静态资源（前端 SPA 入口）
check "Frontend index.html"  "$BASE_URL/"                     "200"

# 4. 不存在的 API 路由应返回 404（验证路由层正常工作）
check "Unknown API 404"      "$BASE_URL/api/v1/__nonexistent__" "404"

echo ""
echo "Result: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

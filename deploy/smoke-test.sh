#!/bin/bash
# ============================================
# 铧旗CRM — 部署冒烟测试
# 用法: bash smoke-test.sh [BASE_URL]
# ============================================

set -e

BASE_URL=${1:-http://localhost:5000}
ADMIN_PASS=${ADMIN_PASS:-huakey123}

echo "==========================================="
echo "  冒烟测试 — $BASE_URL"
echo "==========================================="

# 1. Health check
echo ""
echo "[1/4] 健康检查..."
HEALTH=$(curl -sf "$BASE_URL/api/health")
STATUS=$(echo "$HEALTH" | jq -r '.data.status')
if [ "$STATUS" != "ok" ]; then
    echo "FAIL: /api/health 返回 status=$STATUS，期望 ok"
    exit 1
fi
echo "  ✓ health check passed"

# 2. 登录获取 token
echo "[2/4] 登录测试..."
LOGIN_RESP=$(curl -sf -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASS\"}")
TOKEN=$(echo "$LOGIN_RESP" | jq -r '.data.token')
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "FAIL: 登录失败，未获取到 token"
    exit 1
fi
echo "  ✓ login passed"

# 3. 客户列表接口
echo "[3/4] 客户列表接口..."
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
    -X POST "$BASE_URL/api/customer/list" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{}")
if [ "$HTTP_CODE" != "200" ]; then
    echo "FAIL: /api/customer/list 返回 HTTP $HTTP_CODE，期望 200"
    exit 1
fi
echo "  ✓ customer list passed"

# 4. 前端静态文件
echo "[4/4] 前端静态文件..."
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/")
if [ "$HTTP_CODE" != "200" ]; then
    echo "FAIL: / 返回 HTTP $HTTP_CODE，期望 200"
    exit 1
fi
echo "  ✓ frontend passed"

echo ""
echo "==========================================="
echo "  SMOKE TEST PASSED"
echo "==========================================="

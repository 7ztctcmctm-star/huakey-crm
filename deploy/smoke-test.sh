#!/bin/bash
# ============================================
# 铧旗CRM — 部署冒烟测试
# 用法: bash smoke-test.sh [BASE_URL]
# ============================================

set -e

# 默认走容器 nginx 的 8443（生产链路：DSM nginx 443 → 容器 nginx 8443 → app 5000）
BASE_URL=${1:-https://localhost:8443}
# 只验健康检查（不登录）：admin 初始密码已改或不想用真实密码跑冒烟时使用
SMOKE_HEALTH_ONLY=${SMOKE_HEALTH_ONLY:-0}
if [ "$SMOKE_HEALTH_ONLY" != "1" ]; then
    ADMIN_PASS=${ADMIN_PASS:?请设置 ADMIN_PASS 环境变量（例如: export ADMIN_PASS=your_secure_password）；只验健康请设 SMOKE_HEALTH_ONLY=1}
fi

# 生产证书为自签（deploy/_https_deploy.sh 生成），-k 跳过校验；
# 对 http 目标 -k 无副作用，故统一带上，避免换环境时反复踩 SSL 校验。
CURL="curl -sfk"

echo "==========================================="
echo "  冒烟测试 — $BASE_URL"
echo "==========================================="

# 1. Health check
echo ""
echo "[1/4] 健康检查..."
HEALTH=$($CURL "$BASE_URL/api/v1/health")
STATUS=$(echo "$HEALTH" | jq -r '.data.status')
if [ "$STATUS" != "ok" ]; then
    echo "FAIL: /api/v1/health 返回 status=$STATUS，期望 ok"
    exit 1
fi
echo "  ✓ health check passed"

if [ "$SMOKE_HEALTH_ONLY" = "1" ]; then
    echo ""
    echo "  （SMOKE_HEALTH_ONLY=1：跳过登录 / 业务接口 / 前端步骤）"
    echo "==========================================="
    echo "  SMOKE TEST PASSED（仅健康检查）"
    echo "==========================================="
    exit 0
fi

# 2. 登录获取 token
echo "[2/4] 登录测试..."
LOGIN_RESP=$($CURL -X POST "$BASE_URL/api/v1/auth/login" \
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
HTTP_CODE=$($CURL -o /dev/null -w "%{http_code}" \
    -X POST "$BASE_URL/api/v1/customer/list" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{}")
if [ "$HTTP_CODE" != "200" ]; then
    echo "FAIL: /api/v1/customer/list 返回 HTTP $HTTP_CODE，期望 200"
    exit 1
fi
echo "  ✓ customer list passed"

# 4. 前端静态文件
echo "[4/4] 前端静态文件..."
HTTP_CODE=$($CURL -o /dev/null -w "%{http_code}" "$BASE_URL/")
if [ "$HTTP_CODE" != "200" ]; then
    echo "FAIL: / 返回 HTTP $HTTP_CODE，期望 200"
    exit 1
fi
echo "  ✓ frontend passed"

echo ""
echo "==========================================="
echo "  SMOKE TEST PASSED"
echo "==========================================="

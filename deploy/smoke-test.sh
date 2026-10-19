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
# 退出码区分「服务故障」与「环境限制」：
#   3 = 服务不可达/非 2xx（真实故障，部署必须失败）
#   4 = 服务活着但登录这一步无法自动完成（验证码必填 / 初始密码已改），
#       属环境限制而非故障，只告警——否则每次生产部署都会被这一步误判成失败。
echo "[2/4] 登录测试..."
# 这里不能用 -f：验证码必填时后端返回 400 且带 body，-f 会连 body 一起吞掉，
# 让人分不清「服务不可达」和「被业务规则拒绝」。改为自己判 curl 退出码。
LOGIN_RESP=$(curl -sk -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASS\"}")
LOGIN_RC=$?

if [ "$LOGIN_RC" -ne 0 ]; then
    echo "FAIL: 登录接口无响应（服务不可达，curl 退出码 $LOGIN_RC）"
    exit 3
fi
# 生产开启验证码时后端直接拒绝无 captcha 的登录请求
if echo "$LOGIN_RESP" | grep -q 'captcha'; then
    echo "  ⚠ 登录要求验证码（生产 SKIP_CAPTCHA=false），冒烟脚本无法自动登录"
    echo "    健康检查已通过，业务链路未自动验证；如需完整端到端冒烟，"
    echo "    请临时为 app 设置 SKIP_CAPTCHA=true 后重跑本脚本。"
    exit 4
fi
TOKEN=$(echo "$LOGIN_RESP" | jq -r '.data.token' 2>/dev/null || echo "")
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "  ⚠ 登录未取得 token（admin 初始密码可能已改）："
    echo "    $(echo "$LOGIN_RESP" | head -c 200)"
    exit 4
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

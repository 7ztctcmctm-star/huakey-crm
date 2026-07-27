#!/bin/bash
# ============================================
# 铧旗CRM — 灰度部署脚本
# 用法: bash canary-deploy.sh
# ============================================

set -e

# 配置
DEPLOY_DIR=/volume1/docker/huakey-crm
CANARY_PORT=5001
MONITOR_DURATION=300
HEALTH_CHECK_INTERVAL=2
NGINX_CONF=nginx-canary.conf
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==========================================="
echo "  铧旗CRM 灰度部署"
echo "  监控时长: ${MONITOR_DURATION}s"
echo "==========================================="

# [1/7] 构建 canary 镜像
echo ""
echo "[1/7] 构建 canary 镜像..."
cd "$DEPLOY_DIR"
docker build -t huakey-backend:canary -f Dockerfile backend/

# [2/7] 启动 canary 容器
echo "[2/7] 启动 canary 容器..."
docker run -d \
    --name huakey-backend-canary \
    --network huakey-crm_default \
    --env-file .env \
    -p "$CANARY_PORT:5000" \
    huakey-backend:canary

# [3/7] 健康检查 canary
echo "[3/7] 健康检查 canary..."
CANARY_OK=false
for i in $(seq 1 15); do
    if curl -sf "http://localhost:$CANARY_PORT/api/v1/health" > /dev/null 2>&1; then
        CANARY_OK=true
        break
    fi
    sleep $HEALTH_CHECK_INTERVAL
done

if [ "$CANARY_OK" = false ]; then
    echo "FAIL: canary 健康检查超时，回滚..."
    docker rm -f huakey-backend-canary 2>/dev/null || true
    exit 1
fi
echo "  ✓ canary 启动成功"

# [4/7] 切换 Nginx 到灰度模式
echo "[4/7] 切换 Nginx 到灰度模式..."
cp "$SCRIPT_DIR/nginx-canary.conf" "$DEPLOY_DIR/nginx/conf.d/default.conf"
docker exec huakey-nginx nginx -s reload 2>/dev/null || nginx -s reload 2>/dev/null || true
echo "  ✓ Nginx 灰度模式已激活 (90/10)"

# [5/7] 监控 canary
echo "[5/7] 监控 canary (${MONITOR_DURATION}s)..."
ELAPSED=0
while [ $ELAPSED -lt $MONITOR_DURATION ]; do
    if ! curl -sf "http://localhost:$CANARY_PORT/api/v1/health" > /dev/null 2>&1; then
        echo "FAIL: canary 容机，执行回滚..."
        cp "$SCRIPT_DIR/nginx-stable.conf" "$DEPLOY_DIR/nginx/conf.d/default.conf"
        docker exec huakey-nginx nginx -s reload 2>/dev/null || nginx -s reload 2>/dev/null || true
        docker rm -f huakey-backend-canary 2>/dev/null || true
        echo "ROLLBACK: 已恢复稳定版本"
        exit 1
    fi
    sleep 30
    ELAPSED=$((ELAPSED + 30))
    echo "  ✓ canary 健康 (${ELAPSED}/${MONITOR_DURATION}s)"
done
echo "  ✓ 监控完成，canary 稳定运行"

# [6/7] 提升 canary 为主版本
echo "[6/7] 提升 canary 为主版本..."
docker stop huakey-backend 2>/dev/null || true
docker rm huakey-backend 2>/dev/null || true
docker rename huakey-backend-canary huakey-backend
cp "$SCRIPT_DIR/nginx-stable.conf" "$DEPLOY_DIR/nginx/conf.d/default.conf"
docker exec huakey-nginx nginx -s reload 2>/dev/null || nginx -s reload 2>/dev/null || true
echo "  ✓ canary 已提升为主版本"

# [7/7] 冒烟测试
echo "[7/7] 冒烟测试..."
if bash "$SCRIPT_DIR/smoke-test.sh" http://localhost:5000; then
    echo ""
    echo "==========================================="
    echo "  灰度部署完成！"
    echo "==========================================="
else
    echo ""
    echo "[WARNING] 冒烟测试失败，请手动检查！"
    exit 1
fi

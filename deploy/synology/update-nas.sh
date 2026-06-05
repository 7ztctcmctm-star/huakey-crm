#!/bin/bash
# ============================================
# 铧旗CRM - NAS 更新脚本（Git 同步方式）
# 在本地执行，自动更新 NAS 上的系统
# ============================================

set -e

# 配置
NAS_HOST="192.168.0.200"
NAS_USER="syadmin"
NAS_DIR="/volume1/web/huakey-crm"
COMPOSE_FILE="docker-compose.synology.yml"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}铧旗CRM - NAS 更新${NC}"
echo -e "${GREEN}========================================${NC}"

# 1. 本地提交并推送
echo -e "${YELLOW}[1/4] 推送本地代码到 Git...${NC}"
cd "$(dirname "$0")/../.."
git add .
COMMIT_MSG="更新系统 $(date +%Y-%m-%d_%H:%M:%S)"
git commit -m "$COMMIT_MSG" || echo "没有新的更改"
git push origin main
echo -e "${GREEN}✓ 代码已推送到 Git${NC}"

# 2. SSH 到 NAS 执行更新
echo -e "${YELLOW}[2/4] 连接 NAS 并拉取代码...${NC}"
ssh "$NAS_USER@$NAS_HOST" << EOF
cd $NAS_DIR
git pull origin main
echo "✓ 代码已更新"
EOF

# 3. 重新构建镜像
echo -e "${YELLOW}[3/4] 构建 Docker 镜像（可能需要几分钟）...${NC}"
ssh "$NAS_USER@$NAS_HOST" << EOF
cd $NAS_DIR
docker-compose -f $COMPOSE_FILE build --no-cache
echo "✓ 镜像构建完成"
EOF

# 4. 重启容器
echo -e "${YELLOW}[4/4] 重启容器...${NC}"
ssh "$NAS_USER@$NAS_HOST" << EOF
cd $NAS_DIR
docker-compose -f $COMPOSE_FILE down
docker-compose -f $COMPOSE_FILE up -d
echo "✓ 容器已重启"
EOF

# 5. 检查状态
echo -e "${YELLOW}检查服务状态...${NC}"
ssh "$NAS_USER@$NAS_HOST" << EOF
sleep 5
docker ps | grep huakey
echo ""
echo "=== 应用日志（最近10行）==="
docker logs --tail 10 huakey-app
EOF

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}更新完成！${NC}"
echo -e "${GREEN}访问地址：http://192.168.0.200:5000${NC}"
echo -e "${GREEN}========================================${NC}"

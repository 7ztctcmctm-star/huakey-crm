#!/bin/bash
# ============================================
# 铧旗CRM 一键部署脚本（群晖NAS专用）
# 用法：bash deploy.sh
# ============================================

set -e

echo "=========================================="
echo "  铧旗CRM 部署开始"
echo "=========================================="

# 配置
DEPLOY_DIR="/volume1/docker/huakey-crm"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 1. 创建部署目录
echo ""
echo "[1/6] 创建部署目录..."
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

# 2. 复制文件
echo "[2/6] 复制项目文件..."
cp "$PROJECT_DIR/docker-compose.synology.yml" ./docker-compose.yml
cp "$PROJECT_DIR/Dockerfile.synology" ./Dockerfile
cp -r "$PROJECT_DIR/backend" ./
cp -r "$PROJECT_DIR/frontend" ./
cp -r "$PROJECT_DIR/database" ./

# 删除不需要的文件
rm -rf ./backend/node_modules
rm -rf ./frontend/node_modules
rm -rf ./frontend/dist
rm -rf ./backend/.vercel
rm -rf ./frontend/.vercel
rm -rf ./.git

# 3. 停止旧容器（如果存在）
echo "[3/6] 停止旧容器..."
docker-compose down 2>/dev/null || true

# 4. 构建并启动
echo "[4/6] 构建Docker镜像（首次约5-10分钟）..."
docker-compose build --no-cache

echo "[5/6] 启动容器..."
docker-compose up -d

# 5. 等待服务就绪
echo "[6/6] 等待服务启动..."
sleep 30

# 6. 验证
echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo ""
echo "访问地址：http://$(hostname -I | awk '{print $1}'):5000"
echo "默认账号：admin"
echo "默认密码：huakey123"
echo ""
echo "查看日志：docker-compose logs -f"
echo "停止服务：docker-compose down"
echo "重启服务：docker-compose restart"
echo ""

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

# 0. 从安全源注入生产敏感凭据
# 说明：真实密码/JWT Secret 等敏感信息存放在 .env.secrets 中，
# 通过 source 注入当前 shell，docker-compose 会优先使用环境变量。
echo ""
echo "[0/9] 注入生产敏感凭据..."
if [ -f "$PROJECT_DIR/.env.secrets" ]; then
    # shellcheck source=inject-secrets.sh
    source "$PROJECT_DIR/deploy/inject-secrets.sh"
    echo "  ✓ 已从 .env.secrets 注入生产敏感凭据"
else
    echo "FATAL: 未找到 .env.secrets"
    echo "生产环境部署必须从安全源注入真实凭据。请执行："
    echo "  cp $PROJECT_DIR/.env.secrets.example $PROJECT_DIR/.env.secrets"
    echo "  # 编辑 .env.secrets 填入真实生产值"
    exit 1
fi

# 0. 生产环境安全校验
echo ""
echo "[1/9] 生产环境配置校验..."
if ! node "$PROJECT_DIR/deploy/validate-env.js"; then
    echo "FATAL: 环境变量校验未通过，终止部署"
    exit 1
fi
echo "  ✓ 环境变量校验通过"

# 1. 创建部署目录
echo ""
echo "[2/9] 创建部署目录..."
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

# 2. 复制文件
echo "[3/9] 复制项目文件..."
cp "$PROJECT_DIR/docker-compose.synology.yml" ./docker-compose.yml
cp "$PROJECT_DIR/Dockerfile.synology" ./Dockerfile
cp "$PROJECT_DIR/.env" ./.env
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
echo "[4/9] 停止旧容器..."
docker-compose down 2>/dev/null || true

# 4. 构建并启动
echo "[5/9] 构建Docker镜像（首次约5-10分钟）..."
docker-compose build --no-cache

echo "[6/9] 启动容器..."
docker-compose up -d

# 6. 等待服务就绪
echo "[7/9] 等待服务启动..."
sleep 30

# 7. 执行数据库迁移
echo "[8/9] 执行数据库迁移..."
docker-compose exec -T app node database/migrations/run_migrations.js || echo "[WARNING] 数据库迁移执行失败，请手动检查"

# 8. 初始化角色权限
echo "[9/9] 初始化角色权限..."
docker-compose exec -T app node scripts/init_role_permissions.js || echo "[WARNING] 角色权限初始化失败，请手动检查"

# 9. 验证
echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo ""
echo "HTTPS 访问地址：https://$(hostname -I | awk '{print $1}')"
echo "HTTP 已自动 301 重定向到 HTTPS"
echo ""
echo "查看日志：docker-compose logs -f"
echo "停止服务：docker-compose down"
echo "重启服务：docker-compose restart"
echo ""

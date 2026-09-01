#!/bin/bash
# ============================================
# 铧旗CRM 一键部署脚本（群晖NAS专用）
#
# 用法：在部署目录中执行
#   cd /volume1/docker/crm-stack
#   bash deploy/deploy.sh
#
# 前置条件：
#   1. 已按部署攻略第 8-9 步将项目文件上传并解压到当前目录
#   2. 当前目录应包含：docker-compose.synology.yml、.env.synology、.env.secrets、backend/、frontend/、database/、deploy/
#   3. .env.secrets 已填入真实凭据并设置 chmod 600
# ============================================

set -e

# 群晖 NAS 的 docker 命令在 /usr/local/bin，SSH 非交互式 shell 默认 PATH 不含此路径
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

echo "=========================================="
echo "  铧旗CRM 部署开始"
echo "=========================================="

# 配置：部署目录为脚本所在目录的上一级（即项目根目录）
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "[0/12] 当前部署目录: $PROJECT_DIR"

# 关键文件检查
for f in docker-compose.synology.yml .env.synology .env.secrets; do
    if [ ! -f "$PROJECT_DIR/$f" ]; then
        echo "FATAL: 未找到 $f"
        echo "请确认已按部署攻略第 8-9 步上传并解压项目文件"
        exit 1
    fi
done

# 1. 从安全源注入生产敏感凭据
# 说明：真实密码/JWT Secret 等敏感信息存放在 .env.secrets 中，
# 通过 source 注入当前 shell，docker-compose 会优先使用环境变量。
echo ""
echo "[1/12] 注入生产敏感凭据..."
# shellcheck source=inject-secrets.sh
source "$PROJECT_DIR/deploy/inject-secrets.sh"
echo "  ✓ 已从 .env.secrets 注入生产敏感凭据"

# 2. 准备 .env 文件（docker-compose 默认读取 .env）
echo ""
echo "[2/12] 准备 .env 文件..."
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cp "$PROJECT_DIR/.env.synology" "$PROJECT_DIR/.env"
    echo "  ✓ 已从 .env.synology 复制为 .env"
else
    echo "  ✓ .env 已存在，跳过复制"
fi

# 加载 .env 中的非敏感配置（NODE_ENV/REDIS_ENABLED/CORS_ORIGIN 等）
# 注意：.env 中的密码是占位符，source 后需要重新 source .env.secrets 恢复真实值
set -a
# shellcheck source=/dev/null
source "$PROJECT_DIR/.env"
set +a

# 重新加载 .env.secrets，确保真实密码覆盖 .env 中的占位符
set -a
# shellcheck source=/dev/null
source "$PROJECT_DIR/.env.secrets"
set +a

# 3. 生产环境安全校验
echo ""
echo "[3/12] 生产环境配置校验..."
# --no-env-file 模式校验当前 shell 环境变量（已 source .env.secrets）
# NAS 上可能没有安装 Node.js，此时跳过本地校验（Docker 容器内有 node 可后续校验）
if command -v node &>/dev/null; then
    if ! node "$PROJECT_DIR/deploy/validate-env.js" --no-env-file; then
        echo "FATAL: 环境变量校验未通过，终止部署"
        exit 1
    fi
    echo "  ✓ 环境变量校验通过"
else
    echo "  ⚠ NAS 上未安装 Node.js，跳过本地校验"
    echo "  ⚠ 将在 Docker 容器启动后通过 docker exec 执行校验"
    # 基础检查：确认关键环境变量已设置
    for var in DB_PASSWORD MYSQL_ROOT_PASSWORD JWT_SECRET REDIS_PASSWORD ADMIN_INITIAL_PASSWORD; do
        val=$(eval echo "\$$var")
        if [ -z "$val" ] || [ "$val" = "placeholder_will_be_overridden" ]; then
            echo "FATAL: $var 未设置或仍为占位符"
            exit 1
        fi
    done
    echo "  ✓ 关键环境变量基础检查通过"
fi

# 4. 停止旧容器（如果存在）
echo ""
echo "[4/12] 停止旧容器..."
docker compose -f docker-compose.synology.yml down 2>/dev/null || true

# 5. 构建Docker镜像
echo ""
echo "[5/12] 构建Docker镜像（首次约10-15分钟）..."
docker compose -f docker-compose.synology.yml build --no-cache

# 6. 启动容器
echo ""
echo "[6/12] 启动容器..."
docker compose -f docker-compose.synology.yml --env-file .env up -d

# 7. 等待服务就绪
echo ""
echo "[7/12] 等待服务启动..."
echo "  等待 MySQL 健康检查通过..."
for i in $(seq 1 30); do
    MYSQL_STATUS=$(docker inspect --format='{{.State.Health.Status}}' huakey-mysql 2>/dev/null || echo "none")
    if [ "$MYSQL_STATUS" = "healthy" ]; then
        echo "  ✓ MySQL 已就绪（第 $i 次检查）"
        break
    fi
    if [ "$i" = "30" ]; then
        echo "  ⚠ MySQL 30 次检查仍未就绪，请手动查看日志：docker logs huakey-mysql"
        exit 1
    fi
    sleep 5
done

# 8. 等待 App 容器就绪（迁移自动执行）
echo ""
echo "[8/12] 等待 App 容器完成数据库迁移..."
for i in $(seq 1 60); do
    if docker logs huakey-app 2>&1 | grep -q "服务已启动"; then
        echo "  ✓ App 服务已启动（第 $i 次检查）"
        break
    fi
    if [ "$i" = "60" ]; then
        echo "  ⚠ App 60 次检查仍未启动，请查看日志：docker logs huakey-app"
        exit 1
    fi
    sleep 3
done

# 9. 验证数据库迁移结果
echo ""
echo "[9/12] 验证数据库迁移结果..."
MIGRATE_LOG=$(docker logs huakey-app 2>&1 | grep "迁移.*完成" || echo "")
if [ -z "$MIGRATE_LOG" ]; then
    echo "  ⚠ 未找到迁移完成日志，请手动检查：docker logs huakey-app | grep 迁移"
else
    echo "  ✓ $MIGRATE_LOG"
fi

# 10. 创建初始管理员账号（首次部署必须）
echo ""
echo "[10/12] 创建初始管理员账号..."
if [ -z "${ADMIN_INITIAL_PASSWORD:-}" ]; then
    echo "FATAL: 未设置 ADMIN_INITIAL_PASSWORD 环境变量"
    echo "请在 .env.secrets 中设置 ADMIN_INITIAL_PASSWORD（至少8位强密码）"
    echo "部署后请立即使用该密码登录系统并修改"
    exit 1
fi
docker exec -e ADMIN_INITIAL_PASSWORD="$ADMIN_INITIAL_PASSWORD" huakey-app node scripts/create-admin.js
echo "  ✓ 初始管理员账号 admin 已就绪（首次登录强制改密）"

# 11. 初始化角色权限
echo ""
echo "[11/12] 初始化角色权限..."
docker exec huakey-app node scripts/init_role_permissions.js || echo "  [WARNING] 角色权限初始化失败，请手动检查"

# 12. 完成
echo ""
echo "[12/12] 部署完成"
echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo ""
echo "访问地址：https://crm.huakey.local"
echo "（内网域名，客户端 hosts 需配置：192.168.0.200 crm.huakey.local；或直接访问 https://<NAS_IP>）"
echo ""
echo "常用命令："
echo "  查看日志：docker compose -f docker-compose.synology.yml logs -f app"
echo "  停止服务：docker compose -f docker-compose.synology.yml down"
echo "  重启服务：docker compose -f docker-compose.synology.yml restart app"
echo ""
echo "⚠️ 安全提醒：部署后请立即执行"
echo "  1. 用 admin 账号登录并修改初始密码"
echo "  2. 确认 .env.secrets 权限为 600：chmod 600 .env.secrets"
echo "  3. 禁止在生产环境执行 npm run seed:demo（Demo 数据会污染生产库）"
echo ""

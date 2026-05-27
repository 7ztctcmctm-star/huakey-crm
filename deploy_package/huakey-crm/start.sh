#!/bin/bash
# 铧旗CRM 一键启动脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== 铧旗CRM 启动 ==="

# 1. 检查 .env
if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
    echo "[!] 请先配置 backend/.env 文件"
    echo "    cp $SCRIPT_DIR/backend/.env.example $SCRIPT_DIR/backend/.env"
    echo "    然后编辑 .env 修改数据库密码和 JWT 密钥"
    exit 1
fi

# 2. 安装依赖
if [ ! -d "$SCRIPT_DIR/backend/node_modules" ]; then
    echo "[*] 安装依赖..."
    cd "$SCRIPT_DIR/backend" && npm ci --production
fi

# 3. 创建日志表
echo "[*] 创建系统日志表..."
cd "$SCRIPT_DIR/backend" && node create_sys_log_table.js

# 4. 启动后端
echo "[*] 启动后端服务..."
mkdir -p "$SCRIPT_DIR/backend/logs"
cd "$SCRIPT_DIR/backend" && node server.js >> logs/app.log 2>&1 &

echo "[+] 后端已启动 (PID: $!)"
echo "[+] 访问地址: http://localhost:5000/api/health"

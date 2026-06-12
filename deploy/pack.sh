#!/bin/bash
# 在本地Windows/Git Bash执行，打包部署文件

echo "打包部署文件..."

cd /c/huakey-crm

# 创建临时目录
TMP_DIR="/tmp/huakey-crm-deploy"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

# 复制必要文件
cp docker-compose.synology.yml "$TMP_DIR/"
cp Dockerfile.synology "$TMP_DIR/"
cp -r backend "$TMP_DIR/"
cp -r frontend "$TMP_DIR/"
cp -r database "$TMP_DIR/"
cp deploy/deploy.sh "$TMP_DIR/"
cp deploy/init-complete.sql "$TMP_DIR/"

# 删除不需要的文件
rm -rf "$TMP_DIR/backend/node_modules"
rm -rf "$TMP_DIR/frontend/node_modules"
rm -rf "$TMP_DIR/frontend/dist"
rm -rf "$TMP_DIR/backend/.vercel"
rm -rf "$TMP_DIR/frontend/.vercel"
rm -rf "$TMP_DIR/backend/uploads"
rm -rf "$TMP_DIR/.git"

# 打包
cd /tmp
tar czf /c/huakey-crm/huakey-crm-nas-deploy.tar.gz huakey-crm-deploy/

echo ""
echo "打包完成！"
echo "文件：C:\huakey-crm\huakey-crm-nas-deploy.tar.gz"
echo ""
echo "上传到NAS后执行："
echo "  1. tar xzf huakey-crm-nas-deploy.tar.gz"
echo "  2. cd huakey-crm-deploy"
echo "  3. bash deploy.sh"

#!/bin/bash
# 配置 SSH 密钥免密登录

NAS_HOST="192.168.0.200"
NAS_USER="syadmin"

echo "生成 SSH 密钥..."
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa_nas -N ""

echo "复制公钥到 NAS..."
ssh-copy-id -i ~/.ssh/id_rsa_nas.pub "$NAS_USER@$NAS_HOST"

echo "配置 SSH 别名..."
cat >> ~/.ssh/config << EOF
Host nas
    HostName $NAS_HOST
    User $NAS_USER
    IdentityFile ~/.ssh/id_rsa_nas
EOF

echo "SSH 密钥配置完成！"
echo "现在可以使用 'ssh nas' 免密登录"

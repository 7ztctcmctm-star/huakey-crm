#!/bin/bash
# admin 密码重置脚本 — 通过 heredoc 传 SQL，$ 符号不被 shell 展开
export PATH=/usr/local/bin:/usr/bin:/bin
source /volume1/docker/crm-stack/.env.secrets

echo "===== 更新 admin 密码 ====="
# [P2-16] 口令不放在宿主机 argv：容器内由 MYSQL_PWD 读取 mysql 容器已有的环境变量
docker exec -i huakey-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot huakey_crm' << 'EOSQL'
UPDATE sys_user SET password='$2b$10$0DuKGZH041BMKPhW4eql6.VK8a.x.qeekoiQV47GrB3VTPfKuzRK2', must_change_password=1 WHERE id=1;
SELECT id,username,must_change_password,status FROM sys_user WHERE id=1;
EOSQL

echo ""
echo "===== admin 密码重置完成 ====="
echo "临时密码: Admin@2026"
echo "首次登录将强制改密"

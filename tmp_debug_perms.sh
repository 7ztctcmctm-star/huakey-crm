#!/bin/sh
export PATH=/usr/local/bin:/usr/bin:/bin
DOCKER=/usr/local/bin/docker

echo "=== role_id=1 (boss) 权限码详情 ==="
$DOCKER exec huakey-mysql mysql -uroot -p_IrN8eVnWdDfxxfaCU7S huakey_crm --default-character-set=utf8mb4 -e "SELECT p.permission_code FROM sys_role_permission rp JOIN sys_permission p ON rp.permission_id=p.id WHERE rp.role_id=1 ORDER BY p.permission_code;" 2>/dev/null

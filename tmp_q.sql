SELECT p.permission_code FROM sys_role_permission rp JOIN sys_permission p ON rp.permission_id=p.id WHERE rp.role_id=1 ORDER BY p.permission_code;

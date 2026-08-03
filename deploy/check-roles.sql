-- 检查 sys_role 表内容
SELECT '=== sys_role 全部角色 ===' AS info;
SELECT id, code, name, view_all, manage_all FROM sys_role ORDER BY id;

-- 检查 init-complete.sql 中的角色定义
SELECT '=== sys_user 用户列表 ===' AS info;
SELECT id, username, role_id, status FROM sys_user;

-- 检查 boss 角色的权限数
SELECT '=== boss 权限数 ===' AS info;
SELECT COUNT(*) AS boss_perms FROM sys_role_permission WHERE role_id = (SELECT id FROM sys_role WHERE code = 'boss');

-- 040_fix_boss_permissions_down.sql
-- 回滚：将 boss 角色权限恢复为 0（不推荐，仅用于回滚）
-- 注意：回滚后 boss 将无法登录系统（无权限访问任何页面）

UPDATE sys_role SET view_all = 0, manage_all = 0 WHERE code = 'boss';

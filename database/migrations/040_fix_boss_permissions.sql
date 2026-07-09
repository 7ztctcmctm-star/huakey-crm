-- 040_fix_boss_permissions.sql
-- 修复 boss 角色权限：view_all=1, manage_all=1
-- 根因：004_boss_rbac_and_reminder.sql 使用 INSERT...WHERE NOT EXISTS，
-- 若 boss 角色已存在（从旧备份恢复），不会更新 view_all/manage_all，导致保持为 0
-- 此迁移确保 boss 角色始终拥有全部权限

UPDATE sys_role SET view_all = 1, manage_all = 1 WHERE code = 'boss';

SELECT id, code, name, view_all, manage_all FROM sys_role WHERE code = 'boss';

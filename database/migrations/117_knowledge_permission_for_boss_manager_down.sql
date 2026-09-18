-- 117_knowledge_permission_for_boss_manager_down.sql
-- 回滚：移除本次授予的 knowledge 权限

DELETE FROM sys_role_permission
WHERE role_id IN (SELECT id FROM sys_role WHERE code IN ('boss', 'manager', 'finance', 'purchaser', 'hr', 'engineer'))
  AND permission_id = (SELECT id FROM sys_permission WHERE code = 'knowledge');

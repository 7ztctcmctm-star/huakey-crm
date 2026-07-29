-- 086_down: 销售权限修复回滚
-- 警告：此操作将撤销权限修复，仅在需要回滚 086 时使用
DELETE FROM sys_role_permission WHERE role_id IN (SELECT id FROM sys_role WHERE code = 'sales')
  AND permission_id IN (SELECT id FROM sys_permission WHERE code IN ('customer:view', 'customer:edit', 'customer:import'));

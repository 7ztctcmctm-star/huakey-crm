-- 085_down: 移除采购专员权限种子
DELETE FROM sys_role_permission WHERE role_id IN (SELECT id FROM sys_role WHERE code = 'purchaser')
  AND permission_id IN (SELECT id FROM sys_permission WHERE code IN ('purchase', 'purchase:request', 'purchase:comparison'));

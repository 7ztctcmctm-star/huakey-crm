-- =============================================================================
-- 121_finance_sales_permission_gaps_down.sql
-- 回滚：删除迁移 121 新增的权限码映射
-- =============================================================================

-- finance 删除 quotation
DELETE FROM sys_role_permission
WHERE role_id = 6 AND permission_id IN (
  SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'quotation') t
);

-- sales 删除 competitor 系列
DELETE FROM sys_role_permission
WHERE role_id = 3 AND permission_id IN (
  SELECT id FROM (SELECT id FROM sys_permission WHERE code IN ('competitor', 'competitor:view', 'competitor:add')) t
);

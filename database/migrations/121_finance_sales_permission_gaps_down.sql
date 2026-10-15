-- =============================================================================
-- 121_finance_sales_permission_gaps_down.sql
-- 回滚：删除迁移 121 新增的权限码映射
-- 2026-10-15 · 改按 roleCode 定位角色（原硬编码 role_id=6/3，跨环境不可靠）
-- =============================================================================

-- finance 删除 quotation
DELETE rp FROM sys_role_permission rp
JOIN sys_role r ON r.id = rp.role_id AND r.code = 'finance'
WHERE rp.permission_id IN (
  SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'quotation') t
);

-- sales 删除 competitor 系列
DELETE rp FROM sys_role_permission rp
JOIN sys_role r ON r.id = rp.role_id AND r.code = 'sales'
WHERE rp.permission_id IN (
  SELECT id FROM (SELECT id FROM sys_permission WHERE code IN ('competitor', 'competitor:view', 'competitor:add')) t
);

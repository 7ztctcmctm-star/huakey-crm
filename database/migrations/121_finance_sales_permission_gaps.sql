-- =============================================================================
-- 121_finance_sales_permission_gaps.sql
-- 2026-09-30 · Phase 20 权限矩阵验证修复
-- =============================================================================
-- 根因：
--   Phase 20 权限矩阵 v3 脚本实测发现：
--   1. finance(role_id=6) 报价 list → 403：缺 quotation 基础权限码
--      quote.js L316 list 路由 checkPermission('quotation')
--   2. sales(role_id=3) 竞品 list/add → 403：缺 competitor 系列权限码
--      competitor.js 路由 checkPermission('competitor:view'), checkPermission('competitor:add')
-- =============================================================================

-- Step 1: finance 补 quotation 权限码（报价 list 路由需要基础 quotation 码）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT 6, p.id FROM sys_permission p WHERE p.code = 'quotation';

-- Step 2: sales 补 competitor 权限码（竞品 list/add 路由需要）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT 3, p.id FROM sys_permission p
WHERE p.code IN ('competitor', 'competitor:view', 'competitor:add');

-- Step 3: 验证
SELECT 'finance' AS role_name, COUNT(*) AS perms FROM sys_role_permission WHERE role_id = 6
UNION ALL
SELECT 'sales', COUNT(*) FROM sys_role_permission WHERE role_id = 3;

-- finance 对 quotation 的权限
SELECT rp.role_id, p.code AS finance_quotation FROM sys_role_permission rp
JOIN sys_permission p ON p.id = rp.permission_id
WHERE rp.role_id = 6 AND p.code LIKE '%quot%';

-- sales 对 competitor 的权限
SELECT rp.role_id, p.code AS sales_competitor FROM sys_role_permission rp
JOIN sys_permission p ON p.id = rp.permission_id
WHERE rp.role_id = 3 AND p.code LIKE '%compet%';

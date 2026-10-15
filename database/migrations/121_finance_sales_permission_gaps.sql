-- =============================================================================
-- 121_finance_sales_permission_gaps.sql
-- 2026-09-30 · Phase 20 权限矩阵验证修复
-- 2026-10-15 · 改按 roleCode 定位角色（原硬编码 role_id=6/3）
--   背景：本项目铁律「role_id 映射三方冲突，一律 roleCode」。原版给 finance 授
--   role_id=6 —— 生产库当年 finance 恰好是 6 所以生效，但本机测试库 finance=31
--   ⇒ 授权静默丢失（INSERT ... SELECT 6, ... 无匹配行时不报错！）⇒ 守卫按 roleCode
--   断言立刻红。sales=3 在两个库都巧合命中，同样改为按 code 定位。
--   生产库 2026-09-30 已按旧版执行过（finance=32），本改动不影响生产终态。
-- =============================================================================
-- 根因：
--   Phase 20 权限矩阵 v3 脚本实测发现：
--   1. finance 报价 list → 403：缺 quotation 基础权限码
--      quote.js L316 list 路由 checkPermission('quotation')
--   2. sales 竞品 list/add → 403：缺 competitor 系列权限码
--      competitor.js 路由 checkPermission('competitor:view'), checkPermission('competitor:add')
-- =============================================================================

-- Step 1: finance 补 quotation 权限码（报价 list 路由需要基础 quotation 码）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'finance' AND p.code = 'quotation';

-- Step 2: sales 补 competitor 权限码（竞品 list/add 路由需要）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales'
  AND p.code IN ('competitor', 'competitor:view', 'competitor:add');

-- Step 3: 验证（按 roleCode，跨环境一致）
SELECT r.code AS role_name, COUNT(*) AS perms
FROM sys_role_permission rp JOIN sys_role r ON r.id = rp.role_id
WHERE r.code IN ('finance', 'sales') GROUP BY r.code;

-- finance 对 quotation 的权限
SELECT r.code, p.code AS finance_quotation FROM sys_role_permission rp
JOIN sys_role r ON r.id = rp.role_id
JOIN sys_permission p ON p.id = rp.permission_id
WHERE r.code = 'finance' AND p.code LIKE '%quot%';

-- sales 对 competitor 的权限
SELECT r.code, p.code AS sales_competitor FROM sys_role_permission rp
JOIN sys_role r ON r.id = rp.role_id
JOIN sys_permission p ON p.id = rp.permission_id
WHERE r.code = 'sales' AND p.code LIKE '%compet%';

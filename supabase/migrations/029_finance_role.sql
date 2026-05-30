-- ============================================================
-- 迁移: 财务角色 + 权限配置
-- 日期: 2026-05-26
-- ============================================================

-- Step 1: 创建财务角色
INSERT INTO sys_role (name, code, description, status, view_all, manage_all)
SELECT '财务', 'finance', '财务人员，查看合同/回款/报价全部数据', 1, TRUE, FALSE
WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE code = 'finance');

-- Step 2: 分配菜单权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
CROSS JOIN sys_permission p
WHERE r.code = 'finance'
  AND p.code IN ('dashboard', 'contract', 'quotation', 'service')
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Step 3: 分配按钮权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
CROSS JOIN sys_permission p
WHERE r.code = 'finance'
  AND p.code IN (
    'contract:add', 'contract:edit',
    'quotation:edit',
    'service:add', 'service:edit'
  )
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Step 4: 配置数据权限
INSERT INTO sys_data_permission (role_id, module, data_scope)
SELECT r.id, d.module, 'all'
FROM sys_role r
CROSS JOIN (
  SELECT 'contract' AS module
  UNION ALL SELECT 'quotation'
  UNION ALL SELECT 'service'
) d
WHERE r.code = 'finance'
  AND NOT EXISTS (
    SELECT 1 FROM sys_data_permission dp
    WHERE dp.role_id = r.id AND dp.module = d.module
  );

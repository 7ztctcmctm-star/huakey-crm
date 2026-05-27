-- ============================================================
-- 迁移: 财务角色 + 权限配置
-- 日期: 2026-05-26
-- ============================================================

USE huakey_crm;

-- Step 1: 创建财务角色（view_all=1 可查看全部数据，manage_all=0 不可管理）
INSERT INTO sys_role (name, code, description, status, view_all, manage_all)
SELECT '财务', 'finance', '财务人员，查看合同/回款/报价全部数据', 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE code = 'finance');

-- Step 2: 分配菜单权限
-- 首页(dashboard), 合同管理(contract), 报价管理(quotation), 售后服务(service)
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
-- 合同: 新增/编辑（不需要删除）, 报价: 编辑, 售后: 新增/编辑
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

-- Step 4: 配置数据权限（全部数据范围）
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

SELECT '财务角色创建完成' AS result;
SELECT id, name, code, view_all, manage_all FROM sys_role WHERE code = 'finance';

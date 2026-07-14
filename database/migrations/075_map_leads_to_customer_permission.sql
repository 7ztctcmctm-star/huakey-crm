-- ============================================================
-- 迁移: 线索(leads)权限映射到客户(customer)权限
-- 日期: 2026-07-14
-- 说明: Prompt 4-1 将线索模块统一为客户潜客(prospect)后，原 leads 菜单及
--       API 权限需等价映射到 customer 对应权限，确保原线索使用者在新统一
--       客户模块下仍能访问潜客功能，并将 leads 权限标记为废弃(不可见)。
-- 幂等: 所有角色权限授予均带 NOT EXISTS 判定；可见性标记可重复执行。
-- ============================================================

USE huakey_crm;

-- 1. 凡拥有 leads 菜单权限的角色，确保拥有 customer:list 菜单权限
--    统一后潜客页挂在客户列表下，原线索使用者需能进入客户列表
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'leads'
JOIN sys_permission p_dst ON p_dst.code = 'customer:list'
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);

-- 2. API 权限映射
--    2a. api:leads:claim  -> api:customer:claim (客户池认领接口)
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'api:leads:claim'
JOIN sys_permission p_dst ON p_dst.code = 'api:customer:claim'
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);

--    2b. api:leads:convert  -> customer:edit
--        (convert-to-customer 路由使用 checkPermission('customer:edit'))
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'api:leads:convert'
JOIN sys_permission p_dst ON p_dst.code = 'customer:edit'
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);

--    2c. api:leads:mark-lost  -> customer:edit
--        (潜客标记丢失复用 customer:edit 权限)
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'api:leads:mark-lost'
JOIN sys_permission p_dst ON p_dst.code = 'customer:edit'
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);

-- 3. 标记 leads 及关联 API 权限为废弃(不可见)，前端菜单/权限检查不再展示
UPDATE sys_permission
SET is_visible = 0
WHERE code IN ('leads', 'api:leads:convert', 'api:leads:claim', 'api:leads:mark-lost');

SELECT 'leads 权限已映射到 customer 权限并标记废弃' AS result;

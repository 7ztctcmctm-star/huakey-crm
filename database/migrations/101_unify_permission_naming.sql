-- ============================================================
-- 101: 全局权限命名统一 - create → add 风格
-- ============================================================
-- 变更内容：
--   1. backup:create → backup:add（与全项目 add/edit/delete 风格统一）
--   2. leads:create → leads:add（同上）
--   3. 删除 user:create（与 system:user:add 语义重复，auth.js 已改用 system:user:add）
--
-- 背景：
--   全项目审计结果：12 个模块使用 add/edit/delete 风格（36 个权限码），
--   仅 backup 和 leads 使用 create（3 个权限码）。
--   按"整个 CRM 权限命名只能保留一种风格"要求统一为 add 风格。
--
-- 注：098 迁移（历史，不修改）已定义 leads:create，
--     本迁移做重命名 + 角色权限关联同步。
-- ============================================================

USE huakey_crm;

-- ============================================================
-- 第一步：backup:create → backup:add
-- ============================================================

-- 1.1 新建 backup:add（如不存在）
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '创建备份', 'backup:add', 'button',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'backup') AS p),
       1, 1
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'backup:add');

-- 1.2 将拥有 backup:create 的角色迁移到 backup:add
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'backup:create'
JOIN sys_permission p_dst ON p_dst.code = 'backup:add'
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);

-- 1.3 删除 backup:create 关联与定义
DELETE rp FROM sys_role_permission rp
JOIN sys_permission p ON rp.permission_id = p.id
WHERE p.code = 'backup:create';
DELETE FROM sys_permission WHERE code = 'backup:create';

-- ============================================================
-- 第二步：leads:create → leads:add
-- ============================================================

-- 2.1 新建 leads:add（如不存在）
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '录入线索', 'leads:add', 'api',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'leads') AS p),
       2, 0
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'leads:add');

-- 2.2 将拥有 leads:create 的角色迁移到 leads:add
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'leads:create'
JOIN sys_permission p_dst ON p_dst.code = 'leads:add'
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);

-- 2.3 删除 leads:create 关联与定义
DELETE rp FROM sys_role_permission rp
JOIN sys_permission p ON rp.permission_id = p.id
WHERE p.code = 'leads:create';
DELETE FROM sys_permission WHERE code = 'leads:create';

-- ============================================================
-- 第三步：删除 user:create（已由 system:user:add 替代）
-- ============================================================

DELETE rp FROM sys_role_permission rp
JOIN sys_permission p ON rp.permission_id = p.id
WHERE p.code = 'user:create';
DELETE FROM sys_permission WHERE code = 'user:create';

-- ============================================================
-- 第四步：验证
-- ============================================================

SELECT '=== 验证：旧码应已删除 ===' AS info;
SELECT COUNT(*) AS remaining_old_codes FROM sys_permission
WHERE code IN ('backup:create', 'leads:create', 'user:create');

SELECT '=== 验证：新码存在 ===' AS info;
SELECT code, name FROM sys_permission
WHERE code IN ('backup:add', 'leads:add')
ORDER BY code;

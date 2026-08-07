-- 099: 合并 purchaser 角色到 purchase（统一采购专员角色 code）
-- 背景：历史脚本同时创建了 code='purchaser'（fix-roles.sql/迁移 085/086）和
--       code='purchase'（demo_roles.sql/roles.js ROLE_CODES）两个"采购专员"角色，
--       导致角色管理页面出现两个采购专员，且 init_role_permissions.js 的权限配置
--       因 key 不匹配而静默失效。
-- 本迁移把 purchaser 的用户/权限/数据权限合并到 purchase 后删除 purchaser。
-- 幂等：无论当前数据库状态如何，执行后都收敛到"只有 purchase，没有 purchaser"。

USE huakey_crm;

-- ============================================================
-- 第一步：如果 purchase 不存在但 purchaser 存在，直接改 code
-- （处理只有 purchaser 没有 purchase 的历史部署场景）
-- ============================================================
UPDATE sys_role
SET code = 'purchase', update_time = NOW()
WHERE code = 'purchaser'
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT id FROM sys_role WHERE code = 'purchase' AND deleted_at IS NULL) t
  );

-- ============================================================
-- 第二步：若两者都存在，把 purchaser 角色的用户迁到 purchase
-- ============================================================
UPDATE sys_user
SET role_id = (SELECT id FROM (SELECT id FROM sys_role WHERE code = 'purchase' AND deleted_at IS NULL LIMIT 1) t)
WHERE role_id = (
  SELECT id FROM (SELECT id FROM sys_role WHERE code = 'purchaser' AND deleted_at IS NULL LIMIT 1) t
);

-- ============================================================
-- 第三步：把 purchaser 的功能权限合并到 purchase（INSERT IGNORE 去重）
-- ============================================================
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT p.id, rp.permission_id
FROM sys_role_permission rp
JOIN sys_role r ON r.id = rp.role_id AND r.code = 'purchaser' AND r.deleted_at IS NULL
JOIN sys_role p ON p.code = 'purchase' AND p.deleted_at IS NULL;

-- ============================================================
-- 第四步：把 purchaser 的数据权限合并到 purchase（INSERT IGNORE 去重）
-- ============================================================
INSERT IGNORE INTO sys_data_permission (role_id, module, data_scope, custom_dept_ids)
SELECT p.id, dp.module, dp.data_scope, dp.custom_dept_ids
FROM sys_data_permission dp
JOIN sys_role r ON r.id = dp.role_id AND r.code = 'purchaser' AND r.deleted_at IS NULL
JOIN sys_role p ON p.code = 'purchase' AND p.deleted_at IS NULL;

-- ============================================================
-- 第五步：删除 purchaser 的功能权限关联和数据权限（已合并到 purchase）
-- ============================================================
DELETE FROM sys_role_permission
WHERE role_id = (SELECT id FROM (SELECT id FROM sys_role WHERE code = 'purchaser' LIMIT 1) t);

DELETE FROM sys_data_permission
WHERE role_id = (SELECT id FROM (SELECT id FROM sys_role WHERE code = 'purchaser' LIMIT 1) t);

-- ============================================================
-- 第六步：软删除 purchaser 角色（保留记录便于审计，不硬删除避免外键问题）
-- ============================================================
UPDATE sys_role
SET deleted_at = NOW(), status = 0, update_time = NOW()
WHERE code = 'purchaser' AND deleted_at IS NULL;

-- ============================================================
-- 验证输出
-- ============================================================
SELECT '=== 099 合并完成 ===' AS result;
SELECT id, code, name, status, deleted_at FROM sys_role WHERE code IN ('purchase', 'purchaser') ORDER BY id;
SELECT COUNT(*) AS purchaser_users_remaining FROM sys_user WHERE role_id = (SELECT id FROM (SELECT id FROM sys_role WHERE code = 'purchaser' LIMIT 1) t);

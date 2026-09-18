-- 117_knowledge_permission_for_boss_manager.sql
-- 给 boss / manager / finance / purchaser 角色授予 knowledge 权限码
-- 背景：迁移 086 仅给 sales 授予了 knowledge，导致 knowledge.js 路由从 requireAdmin
--       改为 checkPermission('knowledge') 后，boss/manager 无法管理产品知识库
--       （sales 读/写、其他角色只读 boss/manager 管理产品资料更合理）

INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code IN ('boss', 'manager', 'finance', 'purchaser', 'hr', 'engineer')
  AND p.code = 'knowledge';

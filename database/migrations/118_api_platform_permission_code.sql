-- 118_api_platform_permission_code.sql
-- 背景：api-platform.js 全 12 处 requireAdmin 且零 checkPermission，
--       因为 api_platform 权限码从未在 sys_permission 中定义，
--       导致路由只能用 requireAdmin 硬锁，经理/财务无法管理 API 密钥和 Webhook
-- 动作：
--   1. 创建 api_platform 系列权限码（主码 + 4 个子码）
--   2. 给 super_admin/boss/manager/finance 分配
-- 实测 schema: sys_permission(code, name, type[menu/button/api], parent_id, path, icon, sort, is_visible)
-- 无 sort_order、status、module/action 枚举

-- 1. 创建权限码（主码 + 操作级子码）
INSERT IGNORE INTO sys_permission (code, name, type, parent_id, sort, is_visible) VALUES
('api_platform',         'API 平台管理',    'menu', 0, 60, 1);

-- 获取刚插入的 api_platform 主权限 ID，用于子码 parent_id
SET @api_platform_id = (SELECT id FROM sys_permission WHERE code = 'api_platform' LIMIT 1);

INSERT IGNORE INTO sys_permission (code, name, type, parent_id, sort, is_visible) VALUES
('api_platform:view',    '查看 API 密钥/Webhook', 'button', @api_platform_id, 1, 1),
('api_platform:add',     '创建 API 密钥/Webhook', 'button', @api_platform_id, 2, 1),
('api_platform:edit',    '编辑 API 密钥/Webhook', 'button', @api_platform_id, 3, 1),
('api_platform:delete',  '删除 API 密钥/Webhook', 'button', @api_platform_id, 4, 1);

-- 2. 给 super_admin/boss/manager/finance 分配 api_platform 权限
--    super_admin 已绕过所有权限检查，但为保持数据一致性仍分配
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code IN ('super_admin', 'boss', 'manager', 'finance')
  AND p.code IN ('api_platform', 'api_platform:view', 'api_platform:add', 'api_platform:edit', 'api_platform:delete');

-- 3. 迁移记录
INSERT IGNORE INTO schema_migrations (version, name) VALUES ('118', '118_api_platform_permission_code.sql');

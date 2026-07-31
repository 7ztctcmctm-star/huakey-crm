-- ============================================================
-- 迁移: 补全缺失的功能权限码
-- 编号: 093
-- 说明: 前端路由守卫和侧边栏菜单使用的权限码需要与数据库一致
--       本迁移补全前端已使用但数据库中未注册的权限码
-- ============================================================

-- 确保父级权限存在
INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort) VALUES
  ('审批管理', 'approval', 'menu', NULL, 50),
  ('系统设置', 'settings', 'menu', NULL, 100),
  ('通知中心', 'notification', 'menu', NULL, 90);

-- 评分模块子权限
INSERT INTO sys_permission (name, code, type, parent_id, sort)
SELECT '查看评分', 'scoring:view', 'button', id, 1
FROM sys_permission WHERE code = 'scoring'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'scoring:view');

-- 审批模块子权限
INSERT INTO sys_permission (name, code, type, parent_id, sort)
SELECT '查看审批', 'approval:view', 'button', id, 1
FROM sys_permission WHERE code = 'approval'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'approval:view');

-- 权限管理子权限
INSERT INTO sys_permission (name, code, type, parent_id, sort)
SELECT '查看权限', 'permission:view', 'button', id, 1
FROM sys_permission WHERE code = 'system:permission'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'permission:view');

-- 回款管理子权限
INSERT INTO sys_permission (name, code, type, parent_id, sort)
SELECT '查看回款', 'payment:view', 'button', id, 1
FROM sys_permission WHERE code = 'payment'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'payment:view');

-- 团队看板权限
INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort)
SELECT '团队看板', 'team-dashboard', 'menu', id, 80
FROM sys_permission WHERE code = 'dashboard'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'team-dashboard');

-- 通知中心子权限
INSERT INTO sys_permission (name, code, type, parent_id, sort)
SELECT '查看通知', 'notification:view', 'button', id, 1
FROM sys_permission WHERE code = 'notification'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'notification:view');

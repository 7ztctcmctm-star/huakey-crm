-- 062_seed_module_permissions.sql
-- 为 D 组 12 个路由文件补充模块级权限码
-- 使用 IF NOT EXISTS 保证可重复执行

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT 'AI助手', 'ai', 'menu', 0, '/ai', 100 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'ai');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '数据分析', 'analysis', 'menu', 0, '/analysis', 101 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'analysis');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '日程管理', 'calendar', 'menu', 0, '/calendar', 102 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'calendar');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '跟进提醒', 'reminder', 'menu', 0, '/reminder', 103 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'reminder');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '客户评分', 'scoring', 'menu', 0, '/scoring', 104 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'scoring');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '全局搜索', 'search', 'menu', 0, '/search', 105 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'search');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '社媒沟通', 'social', 'menu', 0, '/social', 106 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'social');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '满意度调查', 'survey', 'menu', 0, '/survey', 107 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'survey');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '客户标签', 'tag', 'menu', 0, '/tag', 108 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'tag');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '合同模板', 'contract_template', 'menu', 0, '/contract-template', 109 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'contract_template');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '跟进模板', 'followup_template', 'menu', 0, '/followup-template', 110 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'followup_template');

-- 将新权限授予 ADMIN 和 MANAGER 角色
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 1, id FROM sys_permission WHERE code IN ('ai','analysis','calendar','reminder','scoring','search','social','survey','tag','contract_template','followup_template')
AND NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp WHERE rp.role_id = 1 AND rp.permission_id = sys_permission.id
);

INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 2, id FROM sys_permission WHERE code IN ('ai','analysis','calendar','reminder','scoring','search','social','survey','tag','contract_template','followup_template')
AND NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp WHERE rp.role_id = 2 AND rp.permission_id = sys_permission.id
);

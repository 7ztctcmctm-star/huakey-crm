-- 119_log_permission_codes.sql
-- 先取 parent_id 再 insert（MySQL 不允许同表 UPDATE/INSERT 子查询）
SET @sys_log_id = (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'system:log') AS t LIMIT 1);

INSERT IGNORE INTO sys_permission (code, name, type, parent_id, sort, is_visible) VALUES
('log:export',  '导出操作日志', 'button', @sys_log_id, 10, 1),
('log:delete',  '删除操作日志', 'button', @sys_log_id, 11, 1);

INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code IN ('super_admin', 'boss', 'manager', 'finance')
  AND p.code IN ('log:export', 'log:delete', 'system:log');

INSERT IGNORE INTO schema_migrations (version, name) VALUES ('119', '119_log_permission_codes.sql');

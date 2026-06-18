-- ============================================================
-- Test环境种子数据
-- 用途：从prod环境导出核心配置数据，供test环境初始化使用
-- 用法：mysql -u root -p huakey_crm < seed_test_data.sql
-- 注意：使用 INSERT IGNORE 避免重复插入
-- ============================================================

USE huakey_crm;

-- 角色数据
INSERT IGNORE INTO sys_role (id, role_name, description, view_all, manage_all, status, create_time)
SELECT id, role_name, description, view_all, manage_all, status, create_time FROM sys_role;

-- 部门数据
INSERT IGNORE INTO sys_dept (id, dept_name, parent_id, sort, status, create_time)
SELECT id, dept_name, parent_id, sort, status, create_time FROM sys_dept;

-- 用户数据（至少包含admin）
-- 默认密码：Admin@123（bcrypt hash）
INSERT IGNORE INTO sys_user (id, username, password, real_name, phone, email, dept_id, role_id, status, create_time)
VALUES (1, 'admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '管理员', '13800138000', 'admin@huakey.com', 1, 1, 1, NOW());

-- 系统配置
INSERT IGNORE INTO sys_config (id, config_key, config_value, description, create_time)
SELECT id, config_key, config_value, description, create_time FROM sys_config;

-- 权限数据（菜单+按钮）
INSERT IGNORE INTO sys_permission (id, name, code, type, parent_id, path, icon, sort, create_time)
SELECT id, name, code, type, parent_id, path, icon, sort, create_time FROM sys_permission;

-- 角色权限关联
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT role_id, permission_id FROM sys_role_permission;

-- 数据权限配置
INSERT IGNORE INTO sys_data_permission (role_id, module, data_scope)
SELECT role_id, module, data_scope FROM sys_data_permission;

-- 输出验证信息
SELECT '=== 种子数据导入完成 ===' AS result;
SELECT COUNT(*) AS user_count FROM sys_user;
SELECT COUNT(*) AS role_count FROM sys_role;
SELECT COUNT(*) AS permission_count FROM sys_permission;

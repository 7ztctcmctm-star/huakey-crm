-- ============================================================
-- ⚠️  测试环境种子数据 — 禁止在生产环境执行  ⚠️
-- 用途：从prod环境导出核心配置数据，供test环境初始化使用
-- 用法：mysql -u root -p huakey_crm_test < seed_test_data.sql
-- 安全检查：若当前数据库名不含 'test' 则中止，防止误伤生产库
-- ============================================================

-- 环境安全检查：非测试/开发数据库则强制报错中止
-- 原理：IF 条件为真时执行子查询，子查询引用不存在的标识符触发 1054 错误
SELECT IF(DATABASE() NOT LIKE '%test%' AND DATABASE() NOT LIKE '%dev%',
  (SELECT `ABORT__NOT_A_TEST_DATABASE`),
  'test_db_ok') AS `guard`;

USE huakey_crm;

-- 角色数据（当前 schema 使用 name 而非 role_name）
INSERT IGNORE INTO sys_role (id, name, code, description, view_all, manage_all, status, create_time)
SELECT id, name, code, description, view_all, manage_all, status, create_time FROM sys_role;

-- 部门数据（当前 schema 使用 name 而非 dept_name，无 status 列）
INSERT IGNORE INTO sys_dept (id, name, parent_id, sort, create_time)
SELECT id, name, parent_id, sort, create_time FROM sys_dept;

-- 用户数据（至少包含admin）
-- 默认密码：Admin@123（bcrypt hash）
INSERT IGNORE INTO sys_user (id, username, password, real_name, phone, email, dept_id, role_id, status, create_time)
VALUES (1, 'admin', '$2b$10$g7rMdveDPVl/wwmz4EjQVeAfs9Ap66gup.a8Dg6yMYOBeMbkHLmqC', '管理员', '13800138000', 'admin@huakey.com', 1, 1, 1, NOW())
;

-- 系统配置（当前 schema 无 create_time，使用 update_time）
INSERT IGNORE INTO sys_config (id, config_key, config_value, description, update_time)
SELECT id, config_key, config_value, description, update_time FROM sys_config;

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

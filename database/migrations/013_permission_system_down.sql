-- 回滚 013_permission_system: 删除权限相关表（注意：FK 约束需先删子表）
DROP TABLE IF EXISTS sys_data_permission;
DROP TABLE IF EXISTS sys_role_permission;
DROP TABLE IF EXISTS sys_permission;

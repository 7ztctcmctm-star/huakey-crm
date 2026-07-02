-- Down script for 029_finance_role.sql
USE huakey_crm;

-- 删除财务角色的数据权限、角色权限、角色记录
DELETE FROM sys_data_permission WHERE role_id = (SELECT id FROM sys_role WHERE code = 'finance');
DELETE FROM sys_role_permission WHERE role_id = (SELECT id FROM sys_role WHERE code = 'finance');
DELETE FROM sys_role WHERE code = 'finance';
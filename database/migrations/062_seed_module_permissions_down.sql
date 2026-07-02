-- Down script for 062_seed_module_permissions.sql
USE huakey_crm;

-- 删除 D 组补充的模块级菜单权限（同时清理角色权限关联）
DELETE FROM sys_role_permission WHERE permission_id IN (
  SELECT id FROM sys_permission WHERE code IN ('ai','analysis','calendar','reminder','scoring','search','social','survey','tag','contract_template','followup_template')
);
DELETE FROM sys_permission WHERE code IN ('ai','analysis','calendar','reminder','scoring','search','social','survey','tag','contract_template','followup_template');
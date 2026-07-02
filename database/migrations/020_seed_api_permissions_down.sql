-- Down script for 020_seed_api_permissions.sql
USE huakey_crm;

-- 回滚种子 API 权限数据
DELETE FROM sys_permission WHERE code LIKE 'api:%';
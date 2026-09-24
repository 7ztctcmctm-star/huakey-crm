-- 118_api_platform_permission_code_down.sql
-- 回滚：删除 api_platform 系列权限码 + 角色分配
-- 注意：此迁移是幂等的，已删除的不会报错

START TRANSACTION;

-- 1. 先删角色-权限关联
DELETE rp FROM sys_role_permission rp
JOIN sys_permission p ON rp.permission_id = p.id
WHERE p.code IN (
  'api_platform',
  'api_platform:view',
  'api_platform:add',
  'api_platform:edit',
  'api_platform:delete'
);

-- 2. 再删权限码本身
DELETE FROM sys_permission
WHERE code IN (
  'api_platform',
  'api_platform:view',
  'api_platform:add',
  'api_platform:edit',
  'api_platform:delete'
);

-- 3. 从 schema_migrations 移除版本记录（让 run_migrations 允许重跑正向迁移）
DELETE FROM schema_migrations WHERE version = '118';

COMMIT;

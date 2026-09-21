-- 118_api_platform_permission_code_down.sql
-- 回滚：删除 api_platform 系列权限码及其角色关联
-- 警告：如果有生产数据已分配，回滚前必须确认无业务依赖

DELETE rp FROM sys_role_permission rp
  JOIN sys_permission p ON rp.permission_id = p.id
  WHERE p.code LIKE 'api_platform%';

DELETE FROM sys_permission WHERE code LIKE 'api_platform%';

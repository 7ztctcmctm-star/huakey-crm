-- 125_permission_sync_down.sql
-- 回滚 125 新增的 12 个权限码及其角色/用户关联。
-- 注意：125 同时删除了旧版 120 给 manager 的系统管理权限；这些删除**不可自动恢复**。
--       若需恢复旧版 120 的经理权限，必须按审计结论人工重新授权，禁止直接重放旧 120。
USE huakey_crm;

DELETE rp FROM sys_role_permission rp
JOIN sys_permission p ON p.id = rp.permission_id
WHERE p.code IN (
  'file','file:upload','invoice:view','payment:edit','quotation:view',
  'quotation:approve','purchase:request','purchase:comparison','email:send',
  'recycle_bin:view','data:restore','system:cron'
);

DELETE up FROM crm_user_permission up
JOIN sys_permission p ON p.id = up.permission_id
WHERE p.code IN (
  'file','file:upload','invoice:view','payment:edit','quotation:view',
  'quotation:approve','purchase:request','purchase:comparison','email:send',
  'recycle_bin:view','data:restore','system:cron'
);

DELETE FROM sys_permission
WHERE code IN (
  'file','file:upload','invoice:view','payment:edit','quotation:view',
  'quotation:approve','purchase:request','purchase:comparison','email:send',
  'recycle_bin:view','data:restore','system:cron'
);

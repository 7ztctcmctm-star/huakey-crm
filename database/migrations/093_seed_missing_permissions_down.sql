-- ============================================================
-- 回滚: 移除 093 补全的权限码
-- 注意: 仅删除 093 插入的记录，不删除可能已分配给角色的权限记录
-- ============================================================

DELETE FROM sys_permission WHERE code IN (
  'scoring:view', 'approval:view', 'permission:view',
  'payment:view', 'team-dashboard', 'notification:view'
);

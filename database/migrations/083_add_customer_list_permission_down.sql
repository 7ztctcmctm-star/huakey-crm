-- 083_down: 移除客户列表权限种子
-- 仅删除本迁移新增的权限条目（按 code 匹配）
DELETE FROM sys_permission WHERE code = 'customer:list' AND id NOT IN (
  SELECT id FROM (SELECT MIN(id) as id FROM sys_permission WHERE code = 'customer:list' GROUP BY code) AS keep
);
DELETE FROM sys_role_permission WHERE permission_id NOT IN (SELECT id FROM sys_permission);

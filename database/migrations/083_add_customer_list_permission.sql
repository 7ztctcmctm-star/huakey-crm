-- 083: 创建 customer:list 权限并分配给 boss/manager/sales 角色
-- 修复销售角色无法访问客户列表的 Bug (RBAC-002)

USE huakey_crm;

-- 1. 创建 customer:list 权限（幂等）
INSERT IGNORE INTO sys_permission (code, name, type, parent_id, sort, is_visible, create_time, update_time)
VALUES ('customer:list', '客户列表查看', 'button', 0, 0, 1, NOW(), NOW());

-- 2. 将 customer:list 分配给 boss、manager、sales 角色（幂等）
SET @perm_id = (SELECT id FROM sys_permission WHERE code = 'customer:list');

INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, @perm_id FROM sys_role r
WHERE r.code IN ('boss', 'manager', 'sales');

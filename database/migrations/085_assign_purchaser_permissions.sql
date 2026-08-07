-- 085: 为采购专员角色分配缺失的权限
-- 修复 purchase 角色无任何权限导致无法操作采购/供应商/产品模块

USE huakey_crm;

-- 为 purchase 角色分配供应商查看权限
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'purchase' AND p.code = 'supplier';

-- 为 purchase 角色分配产品查看权限
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'purchase' AND p.code = 'product:view';

-- 分配采购相关权限（如果存在）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'purchase' AND p.code = 'purchase:add';

INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'purchase' AND p.code = 'purchase:view';

INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'purchase' AND p.code = 'purchase:edit';

-- 分配客户查看权限（采购需查看客户基本信息）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'purchase' AND p.code IN ('customer:view', 'customer:list');

-- =============================================================
-- 132 · 回滚（真实可执行）：恢复 S3 收敛前的授予关系、显示名、状态字典与角色描述
-- 旧值取自 098/020/070 迁移与 2026-11-05 测试库实测基线。
-- =============================================================

-- ① 恢复 manager 的 customer:assign（S3 收敛前的授予关系）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
JOIN sys_permission p ON p.code = 'customer:assign'
WHERE r.code = 'manager';

-- ② 恢复 sales 的 pool:claim / pool:view
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
JOIN sys_permission p ON p.code IN ('pool:claim', 'pool:view')
WHERE r.code = 'sales';

-- ③ 撤销本迁移新增的 hr / finance 资源库只读授予（仅删本迁移引入的两码）
DELETE rp FROM sys_role_permission rp
JOIN sys_role r ON r.id = rp.role_id AND r.code IN ('hr', 'finance')
JOIN sys_permission p ON p.id = rp.permission_id AND p.code IN ('leads', 'leads:view');

-- ④ 显示名还原
UPDATE sys_permission SET name = '线索管理'       WHERE code = 'leads';
UPDATE sys_permission SET name = '公海池'         WHERE code = 'pool';
UPDATE sys_permission SET name = '查看线索'       WHERE code = 'leads:view';
UPDATE sys_permission SET name = '转化为客户'     WHERE code = 'leads:convert';
UPDATE sys_permission SET name = '查看公海'       WHERE code = 'pool:view';
UPDATE sys_permission SET name = '认领公海客户'   WHERE code = 'pool:claim';
UPDATE sys_permission SET name = '释放到公海'     WHERE code = 'customer:release';
UPDATE sys_permission SET name = '客户池认领接口' WHERE code = 'api:customer:claim';
UPDATE sys_permission SET name = '线索认领接口'   WHERE code = 'api:leads:claim';

-- ⑤ 状态字典还原
UPDATE sys_customer_status SET name = '公海客户' WHERE code = 'sea';

-- ⑥ 角色描述还原
UPDATE sys_role SET description = '各销售部门经理，可看全部客户、管理本部门'
WHERE code = 'manager';

-- ============================================================
-- 100 回滚：恢复旧权限码 customer:pool（仅回滚结构，不恢复角色关联）
-- ============================================================

USE huakey_crm;

-- 恢复 customer:pool 权限定义
INSERT INTO sys_permission (name, code, type, parent_id, path, sort, is_visible)
SELECT '客户池', 'customer:pool', 'menu',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'customer') AS p),
       '/customer/pool', 2, 1
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'customer:pool');

SELECT '=== 回滚完成：customer:pool 已恢复 ===' AS info;

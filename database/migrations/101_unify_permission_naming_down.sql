-- ============================================================
-- 101 回滚：恢复旧权限码（仅恢复结构，不恢复角色关联）
-- ============================================================

USE huakey_crm;

-- 恢复 backup:create
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '创建备份', 'backup:create', 'button',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'backup') AS p),
       1, 1
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'backup:create');

-- 恢复 leads:create
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '录入线索', 'leads:create', 'api',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'leads') AS p),
       2, 0
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'leads:create');

-- 恢复 user:create
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '创建用户', 'user:create', 'button',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'system:user') AS p),
       1, 1
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'user:create');

SELECT '=== 回滚完成：旧权限码已恢复 ===' AS info;

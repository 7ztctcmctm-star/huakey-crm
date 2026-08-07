-- 099_down: 回滚 purchaser 合并
-- 注意：回滚只能恢复 purchaser 角色记录，无法把已合并的权限/用户拆分回去
-- 如需完全回滚，需从备份恢复或手动重新分配

USE huakey_crm;

-- 恢复 purchaser 角色（如果被软删除）
UPDATE sys_role
SET deleted_at = NULL, status = 1, update_time = NOW()
WHERE code = 'purchaser' AND deleted_at IS NOT NULL;

SELECT '=== 099 回滚完成（注意：权限/用户未自动拆分）===' AS result;
SELECT id, code, name, status, deleted_at FROM sys_role WHERE code IN ('purchase', 'purchaser') ORDER BY id;

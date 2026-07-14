-- ============================================================
-- 回滚: 075_map_leads_to_customer_permission
-- 说明: 恢复 leads 及关联 API 权限的可见性标记。
--       注意: 第 1/2 步已映射的 sys_role_permission 为增量授予，
--       本回滚仅恢复可见性；若需撤销角色映射请人工核对后删除对应记录。
-- ============================================================

USE huakey_crm;

UPDATE sys_permission
SET is_visible = 1
WHERE code IN ('leads', 'api:leads:convert', 'api:leads:claim', 'api:leads:mark-lost');

SELECT 'leads 权限可见性已恢复' AS result;

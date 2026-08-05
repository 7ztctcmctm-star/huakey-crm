-- ============================================================
-- 103_down: 回滚阶段日志扩展 + 商机查看权限码
-- ============================================================

USE huakey_crm;

-- 1. 删除 opportunity:view 角色关联（通过 permission_id 外键）
DELETE FROM sys_role_permission
WHERE permission_id = (SELECT id FROM sys_permission WHERE code = 'opportunity:view');

-- 2. 删除 opportunity:view 权限定义
DELETE FROM sys_permission WHERE code = 'opportunity:view';

-- 3. 删除 change_reason 字段（幂等）
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_opportunity_stage_log'
    AND COLUMN_NAME = 'change_reason'
);

SET @sql := IF(@col_exists > 0,
  'ALTER TABLE crm_opportunity_stage_log DROP COLUMN change_reason',
  'SELECT ''change_reason column does not exist'' AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

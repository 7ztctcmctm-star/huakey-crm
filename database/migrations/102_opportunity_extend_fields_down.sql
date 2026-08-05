-- ============================================================
-- 102_down: 回滚商机字段扩展
-- ============================================================
-- 回滚 102 迁移：删除 lost_reason 字段
-- ============================================================

USE huakey_crm;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_opportunity'
    AND COLUMN_NAME = 'lost_reason'
);

SET @sql := IF(@col_exists > 0,
  'ALTER TABLE crm_opportunity DROP COLUMN lost_reason',
  'SELECT ''lost_reason column does not exist'' AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

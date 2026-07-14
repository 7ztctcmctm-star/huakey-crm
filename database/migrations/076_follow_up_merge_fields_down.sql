-- ============================================================
-- 回滚 076: 删除 crm_follow_up 合并字段及索引
-- ============================================================

USE huakey_crm;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND INDEX_NAME = 'idx_follow_source_plan');
SET @sql = IF(@idx_exists = 0, 'SELECT 1', 'DROP INDEX idx_follow_source_plan ON crm_follow_up');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND INDEX_NAME = 'idx_follow_next_time');
SET @sql = IF(@idx_exists = 0, 'SELECT 1', 'DROP INDEX idx_follow_next_time ON crm_follow_up');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND INDEX_NAME = 'idx_follow_is_plan');
SET @sql = IF(@idx_exists = 0, 'SELECT 1', 'DROP INDEX idx_follow_is_plan ON crm_follow_up');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'source_plan_id');
SET @sql = IF(@col_exists = 0, 'SELECT 1', 'ALTER TABLE crm_follow_up DROP COLUMN source_plan_id');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'plan_status');
SET @sql = IF(@col_exists = 0, 'SELECT 1', 'ALTER TABLE crm_follow_up DROP COLUMN plan_status');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'finish_time');
SET @sql = IF(@col_exists = 0, 'SELECT 1', 'ALTER TABLE crm_follow_up DROP COLUMN finish_time');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'is_plan');
SET @sql = IF(@col_exists = 0, 'SELECT 1', 'ALTER TABLE crm_follow_up DROP COLUMN is_plan');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'crm_follow_up 合并字段已回滚' AS result;

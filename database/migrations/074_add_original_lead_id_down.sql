-- Auto-generated down script for 074_add_original_lead_id.sql
-- Generated for Prompt 4-1: 回滚 original_lead_id 字段与索引
USE huakey_crm;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_original_lead_id');
SET @sql = IF(@idx_exists > 0, 'DROP INDEX idx_original_lead_id ON crm_customer', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'original_lead_id');
SET @sql2 = IF(@col_exists > 0, 'ALTER TABLE crm_customer DROP COLUMN original_lead_id', 'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

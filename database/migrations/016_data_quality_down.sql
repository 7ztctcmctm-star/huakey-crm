-- Auto-generated down script for 016_data_quality.sql
-- Generated at: 2026-07-01T08:25:56.842Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_customer` DROP COLUMN `deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP TABLE IF EXISTS `sys_data_quality_report`;
DROP TABLE IF EXISTS `sys_validation_rule`;
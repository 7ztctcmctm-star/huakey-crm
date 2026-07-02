-- Auto-generated down script for 042_lead_scoring.sql
-- Generated at: 2026-07-01T08:25:56.889Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND COLUMN_NAME='score');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_customer` DROP COLUMN `score`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP TABLE IF EXISTS `crm_customer_score_log`;
DROP TABLE IF EXISTS `crm_score_rule`;
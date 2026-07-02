-- Auto-generated down script for 024_quote_opportunity_id.sql
-- Generated at: 2026-07-01T08:25:56.856Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND CONSTRAINT_NAME='fk_quote_opportunity' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_quote` DROP FOREIGN KEY `fk_quote_opportunity`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND INDEX_NAME='idx_quote_opportunity');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_quote` DROP INDEX `idx_quote_opportunity`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND COLUMN_NAME='opportunity_id');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_quote` DROP COLUMN `opportunity_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

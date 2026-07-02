-- Auto-generated down script for 054_multi_currency.sql
-- Generated at: 2026-07-01T08:25:56.916Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND COLUMN_NAME='exchange_rate');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_contract` DROP COLUMN `exchange_rate`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND COLUMN_NAME='currency');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_contract` DROP COLUMN `currency`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND COLUMN_NAME='exchange_rate');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_quote` DROP COLUMN `exchange_rate`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND COLUMN_NAME='currency');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_quote` DROP COLUMN `currency`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP TABLE IF EXISTS `crm_product_price`;
DROP TABLE IF EXISTS `crm_currency`;
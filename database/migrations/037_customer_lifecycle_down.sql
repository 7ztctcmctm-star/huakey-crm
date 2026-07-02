-- Auto-generated down script for 037_customer_lifecycle.sql
-- Generated at: 2026-07-01T08:25:56.883Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND COLUMN_NAME='lifecycle_status');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_customer` DROP COLUMN `lifecycle_status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND COLUMN_NAME='customer_type');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_customer` DROP COLUMN `customer_type`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

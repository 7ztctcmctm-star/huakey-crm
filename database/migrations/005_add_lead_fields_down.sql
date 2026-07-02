-- Auto-generated down script for 005_add_lead_fields.sql
-- Generated at: 2026-07-01T08:25:56.823Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND COLUMN_NAME='converted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_customer` DROP COLUMN `converted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND COLUMN_NAME='follow_status');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_customer` DROP COLUMN `follow_status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND COLUMN_NAME='lead_level');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_customer` DROP COLUMN `lead_level`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Auto-generated down script for 058_soft_delete_batch2.sql
-- Generated at: 2026-07-01T08:25:56.922Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_tag' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_tag` DROP COLUMN `deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_social_contact' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_social_contact` DROP COLUMN `deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_email_account' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_email_account` DROP COLUMN `deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract_template' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_contract_template` DROP COLUMN `deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_competitor_intel' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_competitor_intel` DROP COLUMN `deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_competitor_encounter' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_competitor_encounter` DROP COLUMN `deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_attachment' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_attachment` DROP COLUMN `deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

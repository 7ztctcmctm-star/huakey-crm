-- Auto-generated down script for 026_approval_fields.sql
-- Generated at: 2026-07-01T08:25:56.861Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND INDEX_NAME='idx_contract_approval');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_contract` DROP INDEX `idx_contract_approval`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND INDEX_NAME='idx_quote_approval');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_quote` DROP INDEX `idx_quote_approval`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND COLUMN_NAME='approver_id');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_contract` DROP COLUMN `approver_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND COLUMN_NAME='approval_status');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_contract` DROP COLUMN `approval_status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND COLUMN_NAME='approver_id');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_quote` DROP COLUMN `approver_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND COLUMN_NAME='approval_status');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_quote` DROP COLUMN `approval_status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

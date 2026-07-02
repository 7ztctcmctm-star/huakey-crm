-- Auto-generated down script for 027_approval_remark.sql
-- Generated at: 2026-07-01T08:25:56.865Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND COLUMN_NAME='approval_remark');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_contract` DROP COLUMN `approval_remark`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND COLUMN_NAME='approval_remark');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_quote` DROP COLUMN `approval_remark`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Auto-generated down script for 018_payment_plan_status.sql
-- Generated at: 2026-07-01T08:25:56.846Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment_plan' AND COLUMN_NAME='overdue_days');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_payment_plan` DROP COLUMN `overdue_days`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment_plan' AND COLUMN_NAME='paid_amount');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_payment_plan` DROP COLUMN `paid_amount`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment_plan' AND COLUMN_NAME='status');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_payment_plan` DROP COLUMN `status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

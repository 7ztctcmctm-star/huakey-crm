-- Auto-generated down script for 032_field_level_log.sql
-- Generated at: 2026-07-01T08:25:56.872Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sys_log' AND COLUMN_NAME='new_value');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `sys_log` DROP COLUMN `new_value`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sys_log' AND COLUMN_NAME='old_value');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `sys_log` DROP COLUMN `old_value`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sys_log' AND COLUMN_NAME='changed_fields');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `sys_log` DROP COLUMN `changed_fields`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

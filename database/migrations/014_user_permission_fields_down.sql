-- Auto-generated down script for 014_user_permission_fields.sql
-- Generated at: 2026-07-01T08:25:56.837Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sys_user' AND COLUMN_NAME='last_login_ip');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `sys_user` DROP COLUMN `last_login_ip`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sys_user' AND COLUMN_NAME='last_login_time');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `sys_user` DROP COLUMN `last_login_time`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

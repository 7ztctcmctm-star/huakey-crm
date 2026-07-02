-- Auto-generated down script for 004_boss_rbac_and_reminder.sql
-- Generated at: 2026-07-01T08:25:56.820Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sys_user' AND COLUMN_NAME='manager_id');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `sys_user` DROP COLUMN `manager_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sys_role' AND COLUMN_NAME='manage_all');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `sys_role` DROP COLUMN `manage_all`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sys_role' AND COLUMN_NAME='view_all');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `sys_role` DROP COLUMN `view_all`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP TABLE IF EXISTS `crm_follow_up_reminder`;
DROP TABLE IF EXISTS `crm_assign_log`;
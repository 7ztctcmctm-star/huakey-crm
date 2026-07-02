-- Auto-generated down script for 015_data_protection.sql
-- Generated at: 2026-07-01T08:25:56.839Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_product' AND INDEX_NAME='idx_deleted_at');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_product` DROP INDEX `idx_deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sys_user' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `sys_user` DROP COLUMN `deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sys_role' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `sys_role` DROP COLUMN `deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sys_dept' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `sys_dept` DROP COLUMN `deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_pool_log' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_pool_log` DROP COLUMN `deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_follow_up` DROP COLUMN `deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_product' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_product` DROP COLUMN `deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP TABLE IF EXISTS `sys_backup_record`;
DROP TABLE IF EXISTS `sys_operation_log`;
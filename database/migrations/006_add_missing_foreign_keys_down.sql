-- Auto-generated down script for 006_add_missing_foreign_keys.sql
-- Generated at: 2026-07-01T08:25:56.825Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sys_log' AND CONSTRAINT_NAME='fk_log_user' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `sys_log` DROP FOREIGN KEY `fk_log_user`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up_reminder' AND CONSTRAINT_NAME='fk_reminder_manager' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_follow_up_reminder` DROP FOREIGN KEY `fk_reminder_manager`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up_reminder' AND CONSTRAINT_NAME='fk_reminder_owner' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_follow_up_reminder` DROP FOREIGN KEY `fk_reminder_owner`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up_reminder' AND CONSTRAINT_NAME='fk_reminder_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_follow_up_reminder` DROP FOREIGN KEY `fk_reminder_customer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_assign_log' AND CONSTRAINT_NAME='fk_assign_log_operator' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_assign_log` DROP FOREIGN KEY `fk_assign_log_operator`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_assign_log' AND CONSTRAINT_NAME='fk_assign_log_to_user' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_assign_log` DROP FOREIGN KEY `fk_assign_log_to_user`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_assign_log' AND CONSTRAINT_NAME='fk_assign_log_from_user' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_assign_log` DROP FOREIGN KEY `fk_assign_log_from_user`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_assign_log' AND CONSTRAINT_NAME='fk_assign_log_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_assign_log` DROP FOREIGN KEY `fk_assign_log_customer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_pool_log' AND CONSTRAINT_NAME='fk_pool_log_to_user' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_pool_log` DROP FOREIGN KEY `fk_pool_log_to_user`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_pool_log' AND CONSTRAINT_NAME='fk_pool_log_from_user' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_pool_log` DROP FOREIGN KEY `fk_pool_log_from_user`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='sys_user' AND CONSTRAINT_NAME='fk_user_manager' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `sys_user` DROP FOREIGN KEY `fk_user_manager`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Auto-generated down script for 060_support_foreign_keys.sql
-- Generated at: 2026-07-01T08:25:56.926Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_competitor_encounter' AND CONSTRAINT_NAME='fk_compenc_opp' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_competitor_encounter` DROP FOREIGN KEY `fk_compenc_opp`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_competitor_encounter' AND CONSTRAINT_NAME='fk_compenc_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_competitor_encounter` DROP FOREIGN KEY `fk_compenc_customer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_sales_target' AND CONSTRAINT_NAME='fk_salestarget_user' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_sales_target` DROP FOREIGN KEY `fk_salestarget_user`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment_reminder' AND CONSTRAINT_NAME='fk_payremind_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_payment_reminder` DROP FOREIGN KEY `fk_payremind_customer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_notification' AND CONSTRAINT_NAME='fk_notif_to_user' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_notification` DROP FOREIGN KEY `fk_notif_to_user`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_notification' AND CONSTRAINT_NAME='fk_notif_from_user' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_notification` DROP FOREIGN KEY `fk_notif_from_user`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_email_account' AND CONSTRAINT_NAME='fk_email_account_user' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_email_account` DROP FOREIGN KEY `fk_email_account_user`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_email' AND CONSTRAINT_NAME='fk_email_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_email` DROP FOREIGN KEY `fk_email_customer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_calendar_event' AND CONSTRAINT_NAME='fk_calendar_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_calendar_event` DROP FOREIGN KEY `fk_calendar_customer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_pool_log' AND CONSTRAINT_NAME='fk_poollog_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_pool_log` DROP FOREIGN KEY `fk_poollog_customer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity_stage_log' AND CONSTRAINT_NAME='fk_stagelog_opp' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_opportunity_stage_log` DROP FOREIGN KEY `fk_stagelog_opp`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

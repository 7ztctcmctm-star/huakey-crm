-- Auto-generated down script for 059_core_foreign_keys.sql
-- Generated at: 2026-07-01T08:25:56.924Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_invoice' AND CONSTRAINT_NAME='fk_invoice_create_by' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_invoice` DROP FOREIGN KEY `fk_invoice_create_by`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_invoice' AND CONSTRAINT_NAME='fk_invoice_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_invoice` DROP FOREIGN KEY `fk_invoice_customer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND CONSTRAINT_NAME='fk_quote_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_quote` DROP FOREIGN KEY `fk_quote_customer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND CONSTRAINT_NAME='fk_contract_opp' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_contract` DROP FOREIGN KEY `fk_contract_opp`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND CONSTRAINT_NAME='fk_contract_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_contract` DROP FOREIGN KEY `fk_contract_customer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity' AND CONSTRAINT_NAME='fk_opp_owner' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_opportunity` DROP FOREIGN KEY `fk_opp_owner`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity' AND CONSTRAINT_NAME='fk_opp_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_opportunity` DROP FOREIGN KEY `fk_opp_customer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_followup_template' AND CONSTRAINT_NAME='fk_followup_tpl_create_by' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_followup_template` DROP FOREIGN KEY `fk_followup_tpl_create_by`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_plan' AND CONSTRAINT_NAME='fk_followplan_create_by' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_follow_plan` DROP FOREIGN KEY `fk_followplan_create_by`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_plan' AND CONSTRAINT_NAME='fk_followplan_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_follow_plan` DROP FOREIGN KEY `fk_followplan_customer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up' AND CONSTRAINT_NAME='fk_followup_create_by' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_follow_up` DROP FOREIGN KEY `fk_followup_create_by`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up' AND CONSTRAINT_NAME='fk_followup_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_follow_up` DROP FOREIGN KEY `fk_followup_customer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND CONSTRAINT_NAME='fk_customer_owner' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE `crm_customer` DROP FOREIGN KEY `fk_customer_owner`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

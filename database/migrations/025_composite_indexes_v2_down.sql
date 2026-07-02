-- Auto-generated down script for 025_composite_indexes_v2.sql
-- Generated at: 2026-07-01T08:25:56.858Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_sales_target' AND INDEX_NAME='idx_target_user_year_month');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_sales_target` DROP INDEX `idx_target_user_year_month`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up' AND INDEX_NAME='idx_follow_cust_del_time');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_follow_up` DROP INDEX `idx_follow_cust_del_time`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_service_order' AND INDEX_NAME='idx_service_assignee_status');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_service_order` DROP INDEX `idx_service_assignee_status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment' AND INDEX_NAME='idx_payment_contract_del');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_payment` DROP INDEX `idx_payment_contract_del`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND INDEX_NAME='idx_contract_del_status_ctime');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_contract` DROP INDEX `idx_contract_del_status_ctime`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity' AND INDEX_NAME='idx_opp_del_stage_amount');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_opportunity` DROP INDEX `idx_opp_del_stage_amount`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_cust_status_owner_follow');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_customer` DROP INDEX `idx_cust_status_owner_follow`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

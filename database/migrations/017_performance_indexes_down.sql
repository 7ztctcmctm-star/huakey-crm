-- Auto-generated down script for 017_performance_indexes.sql
-- Generated at: 2026-07-01T08:25:56.843Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_customer_deleted_at');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_customer` DROP INDEX `idx_customer_deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_pool_log' AND INDEX_NAME='idx_pool_log_deleted_at');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_pool_log` DROP INDEX `idx_pool_log_deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up' AND INDEX_NAME='idx_follow_deleted_at');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_follow_up` DROP INDEX `idx_follow_deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contact' AND INDEX_NAME='idx_contact_deleted_at');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_contact` DROP INDEX `idx_contact_deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_supplier' AND INDEX_NAME='idx_supplier_deleted_at');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_supplier` DROP INDEX `idx_supplier_deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_service_order' AND INDEX_NAME='idx_service_deleted_at');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_service_order` DROP INDEX `idx_service_deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment' AND INDEX_NAME='idx_payment_deleted_at');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_payment` DROP INDEX `idx_payment_deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND INDEX_NAME='idx_quote_deleted_at');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_quote` DROP INDEX `idx_quote_deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity' AND INDEX_NAME='idx_opp_deleted_at');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_opportunity` DROP INDEX `idx_opp_deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @db = 'huakey_crm';
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND INDEX_NAME='idx_contract_deleted_at');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE `crm_contract` DROP INDEX `idx_contract_deleted_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

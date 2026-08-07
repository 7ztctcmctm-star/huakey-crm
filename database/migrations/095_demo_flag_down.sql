-- Auto-generated down script for 095_demo_flag.sql
-- 回滚：移除核心 12 表的 is_demo 字段及相关索引
-- 注意：回滚前请先清理 is_demo=1 的 Demo 数据，避免残留

-- 先删索引
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND INDEX_NAME = 'idx_user_is_demo');
SET @sql = IF(@idx_exists > 0, 'DROP INDEX idx_user_is_demo ON sys_user', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_customer_is_demo');
SET @sql = IF(@idx_exists > 0, 'DROP INDEX idx_customer_is_demo ON crm_customer', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 再删列（顺序与正向相反）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_approval_workflow' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_approval_workflow` DROP COLUMN `is_demo`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_supplier` DROP COLUMN `is_demo`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_payment' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_payment` DROP COLUMN `is_demo`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_payment_plan' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_payment_plan` DROP COLUMN `is_demo`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contract' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_contract` DROP COLUMN `is_demo`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_quote' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_quote` DROP COLUMN `is_demo`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_product' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_product` DROP COLUMN `is_demo`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_follow_up` DROP COLUMN `is_demo`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_opportunity' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_opportunity` DROP COLUMN `is_demo`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_contact` DROP COLUMN `is_demo`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_customer` DROP COLUMN `is_demo`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `sys_user` DROP COLUMN `is_demo`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

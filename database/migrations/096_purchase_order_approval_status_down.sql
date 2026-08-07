-- 回滚 096: 删除 crm_purchase_order.approval_status 字段及索引
-- 用法：mysql -u root -p huakey_crm < 096_purchase_order_approval_status_down.sql

-- 1. 删除索引（幂等）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_order' AND INDEX_NAME = 'idx_purchase_order_approval_status');

SET @sql = IF(@idx_exists > 0,
  'DROP INDEX idx_purchase_order_approval_status ON crm_purchase_order',
  'SELECT 1 AS already_dropped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 删除字段（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_order' AND COLUMN_NAME = 'approval_status');

SET @sql = IF(@col_exists > 0,
  'ALTER TABLE crm_purchase_order DROP COLUMN approval_status',
  'SELECT 1 AS already_dropped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

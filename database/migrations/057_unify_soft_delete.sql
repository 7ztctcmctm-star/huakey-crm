-- 057: 统一3表软删除模式为 deleted_at IS NULL
-- crm_product_price、crm_score_rule、crm_currency

USE huakey_crm;

-- 1. crm_product_price 添加 deleted_at（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_product_price' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists=0,
  'ALTER TABLE crm_product_price ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL AFTER status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_product_price' AND INDEX_NAME='idx_product_price_deleted');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX idx_product_price_deleted ON crm_product_price(deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. crm_score_rule 添加 deleted_at（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_score_rule' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists=0,
  'ALTER TABLE crm_score_rule ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL AFTER status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_score_rule' AND INDEX_NAME='idx_score_rule_deleted');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX idx_score_rule_deleted ON crm_score_rule(deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. crm_currency 添加 deleted_at（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_currency' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists=0,
  'ALTER TABLE crm_currency ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL AFTER status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_currency' AND INDEX_NAME='idx_currency_deleted');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX idx_currency_deleted ON crm_currency(deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 将已禁用的货币标记为软删除
UPDATE crm_currency SET deleted_at = NOW() WHERE status = 0 AND deleted_at IS NULL;

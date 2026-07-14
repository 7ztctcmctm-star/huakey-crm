-- Rollback: Prompt 4-3-1 删除 crm_contract.quote_id 字段（幂等）

USE huakey_crm;

-- 1. 删除索引
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_contract'
    AND INDEX_NAME = 'idx_contract_quote_id'
);
SET @sql = IF(@idx_exists > 0,
  'ALTER TABLE crm_contract DROP INDEX idx_contract_quote_id',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 删除列
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_contract'
    AND COLUMN_NAME = 'quote_id'
);
SET @sql = IF(@col_exists > 0,
  'ALTER TABLE crm_contract DROP COLUMN quote_id',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Prompt 4-3-1: 新增 crm_contract.quote_id 字段（幂等）
-- 合同关联合同来源报价单，形成 商机→报价→合同 完整链路

USE huakey_crm;

-- 1. 添加 quote_id 列（幂等）
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_contract'
    AND COLUMN_NAME = 'quote_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_contract ADD COLUMN quote_id INT DEFAULT NULL COMMENT ''关联合同来源报价单ID''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 添加索引 idx_contract_quote_id（幂等）
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_contract'
    AND INDEX_NAME = 'idx_contract_quote_id'
);
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_contract_quote_id ON crm_contract(quote_id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

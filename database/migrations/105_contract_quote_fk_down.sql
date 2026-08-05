-- ============================================================
-- 105_down: 回滚 Contract quote_id FK
-- ============================================================

USE huakey_crm;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_contract'
    AND CONSTRAINT_NAME = 'fk_contract_quote'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql := IF(@fk_exists > 0,
  'ALTER TABLE crm_contract DROP FOREIGN KEY fk_contract_quote',
  'SELECT ''fk_contract_quote does not exist'' AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

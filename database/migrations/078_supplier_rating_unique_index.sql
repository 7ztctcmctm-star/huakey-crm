-- 078: 供应商评分唯一索引（Prompt 4-5-1）
-- 确保 crm_supplier_rating 表 (supplier_id, rating_period) 唯一，防止重复评分

USE huakey_crm;

-- 添加唯一索引（幂等）
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_supplier_rating'
    AND INDEX_NAME = 'uq_supplier_rating_period'
);
SET @sql = IF(@idx_exists = 0,
  'CREATE UNIQUE INDEX uq_supplier_rating_period ON crm_supplier_rating(supplier_id, rating_period)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

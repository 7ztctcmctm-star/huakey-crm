-- ============================================================
-- 迁移 074: 线索整合到客户 - 新增 original_lead_id + 潜客标记
-- 说明:
--   Prompt 4-1 废弃独立线索入口；线索已是 crm_customer 中的 prospect 记录
--   customer_type 由 037 迁移标记（prospect/customer），此处仅新增溯源字段并兜底标记
-- ============================================================

USE huakey_crm;

-- 1. 新增 original_lead_id 字段（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'original_lead_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN original_lead_id INT DEFAULT NULL COMMENT \'原始线索ID，用于线索转客户溯源\' AFTER lifecycle_status',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 索引（幂等）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_original_lead_id');
SET @sql2 = IF(@idx_exists = 0, 'CREATE INDEX idx_original_lead_id ON crm_customer(original_lead_id)', 'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 3. 兜底标记：未被分配(following)且 customer_type 为空的记录视为潜客（线索）
--    037 迁移已为绝大多数客户标记 customer_type，此处仅补漏
UPDATE crm_customer
SET customer_type = 'prospect',
    lifecycle_status = CASE WHEN lifecycle_status IS NULL OR lifecycle_status = '' THEN 'lead' ELSE lifecycle_status END
WHERE deleted_at IS NULL
  AND status = 'following'
  AND owner_id IS NULL
  AND (customer_type IS NULL OR customer_type = '' OR customer_type = 'prospect');

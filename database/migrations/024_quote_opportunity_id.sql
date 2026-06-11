-- [业务修复] crm_quote 添加 opportunity_id 列，关联商机
-- 兼容旧数据：默认 NULL，不影响已有报价单

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_quote' AND column_name='opportunity_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_quote ADD COLUMN opportunity_id INT DEFAULT NULL COMMENT ''关联商机ID'' AFTER customer_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_quote' AND CONSTRAINT_NAME='fk_quote_opportunity' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists = 0, 'ALTER TABLE crm_quote ADD CONSTRAINT fk_quote_opportunity FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_quote' AND INDEX_NAME='idx_quote_opportunity');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_quote ADD INDEX idx_quote_opportunity (opportunity_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回滚 009_soft_delete_business_tables: 移除商机/报价/合同/回款/供应商的软删除字段
SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_opportunity DROP COLUMN deleted_at', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_quote DROP COLUMN deleted_at', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_contract DROP COLUMN deleted_at', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_payment DROP COLUMN deleted_at', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_supplier' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_supplier DROP COLUMN deleted_at', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

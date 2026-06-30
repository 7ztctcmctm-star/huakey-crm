-- 回滚 003_add_customer_pool_columns: 移除公海相关字段
SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND COLUMN_NAME='pool_status');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_customer DROP COLUMN pool_status', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND COLUMN_NAME='protect_until');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_customer DROP COLUMN protect_until', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND COLUMN_NAME='last_follow_time');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_customer DROP COLUMN last_follow_time', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

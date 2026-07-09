-- 售后工单软删除
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_service_order' AND column_name='deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_service_order ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''删除时间'' AFTER create_time', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

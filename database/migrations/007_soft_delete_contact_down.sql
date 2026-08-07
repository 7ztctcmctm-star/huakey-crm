-- 回滚 007_soft_delete_contact: 移除联系人软删除字段
SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contact' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_contact DROP COLUMN deleted_at', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

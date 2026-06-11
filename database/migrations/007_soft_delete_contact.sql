-- Bug #02: 联系人软删除支持
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_contact' AND column_name='deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_contact ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

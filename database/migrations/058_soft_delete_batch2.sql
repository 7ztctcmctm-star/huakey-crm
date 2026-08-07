-- 058: 7表补齐 deleted_at 软删除字段
-- crm_attachment, crm_competitor_encounter, crm_competitor_intel,
-- crm_contract_template, crm_email_account, crm_social_contact, crm_tag
-- [幂等] 使用 information_schema 检查列是否存在，防止重复执行报错

SET @db = DATABASE();

-- crm_attachment
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_attachment' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@exists=0, 'ALTER TABLE crm_attachment ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_competitor_encounter
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_competitor_encounter' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@exists=0, 'ALTER TABLE crm_competitor_encounter ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_competitor_intel
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_competitor_intel' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@exists=0, 'ALTER TABLE crm_competitor_intel ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_contract_template
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract_template' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@exists=0, 'ALTER TABLE crm_contract_template ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_email_account
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_email_account' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@exists=0, 'ALTER TABLE crm_email_account ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_social_contact
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_social_contact' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@exists=0, 'ALTER TABLE crm_social_contact ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_tag
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_tag' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@exists=0, 'ALTER TABLE crm_tag ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

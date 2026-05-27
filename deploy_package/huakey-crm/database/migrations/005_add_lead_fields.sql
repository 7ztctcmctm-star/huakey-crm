-- ============================================================
-- 迁移: 线索管理字段
-- 为 crm_customer 增加 lead_level(意向等级) 和 follow_status(跟进状态)
-- 日期: 2026-05-19
-- ============================================================

USE huakey_crm;

SET @db_name = 'huakey_crm';

-- 检查并添加 lead_level 列
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'lead_level');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN lead_level VARCHAR(10) DEFAULT NULL COMMENT ''意向等级：高/中/低'' AFTER level',
  'SELECT ''lead_level already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 检查并添加 follow_status 列
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'follow_status');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN follow_status VARCHAR(20) DEFAULT NULL COMMENT ''跟进状态：初次联系/需求确认/报价中/已流失'' AFTER lead_level',
  'SELECT ''follow_status already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 检查并添加 converted_at 列
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'converted_at');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN converted_at DATETIME DEFAULT NULL COMMENT ''转化为客户的时间'' AFTER follow_status',
  'SELECT ''converted_at already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 为现有潜在客户(status=1)填充默认值
UPDATE crm_customer SET lead_level = '中', follow_status = '初次联系'
WHERE status = 1 AND lead_level IS NULL;

-- 为已成交客户(status=2)也设置默认值
UPDATE crm_customer SET lead_level = '高', follow_status = '需求确认'
WHERE status = 2 AND lead_level IS NULL;

SELECT 'lead_fields migration done' AS result;

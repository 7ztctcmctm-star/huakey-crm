-- ============================================================
-- 迁移: 为 crm_customer 补充公海相关字段
-- 说明:
--   pool_status: 0=归属销售 1=在公海
--   protect_until: 认领后的保护截止时间（7天）
--   last_follow_time: 最近跟进时间（用于掉公海判断）
-- ============================================================

USE huakey_crm;

-- 添加公海状态字段（安全添加，已存在则跳过）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND COLUMN_NAME='pool_status');
SET @sql = IF(@col_exists=0,
  'ALTER TABLE crm_customer ADD COLUMN pool_status TINYINT DEFAULT 0 COMMENT ''公海状态：0=归属销售 1=在公海''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND COLUMN_NAME='protect_until');
SET @sql = IF(@col_exists=0,
  'ALTER TABLE crm_customer ADD COLUMN protect_until DATETIME DEFAULT NULL COMMENT ''认领保护截止时间''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND COLUMN_NAME='last_follow_time');
SET @sql = IF(@col_exists=0,
  'ALTER TABLE crm_customer ADD COLUMN last_follow_time DATETIME DEFAULT NULL COMMENT ''最近跟进时间''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加索引（安全添加）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_customer_pool_status');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX idx_customer_pool_status ON crm_customer(pool_status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_customer_protect_until');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX idx_customer_protect_until ON crm_customer(protect_until)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_customer_last_follow');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX idx_customer_last_follow ON crm_customer(last_follow_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

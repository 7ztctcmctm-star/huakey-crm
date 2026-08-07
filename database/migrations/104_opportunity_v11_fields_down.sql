-- 104 回滚：Opportunity Center v1.1 字段扩展回滚
-- ============================================================
-- 注意：回滚会删除 opportunity_no 和 source_id 字段及字典表
-- 回滚前请确认无业务依赖
-- ============================================================
USE huakey_crm;

-- 1. 删除 idx_source_id 索引（如存在）
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_opportunity'
    AND INDEX_NAME = 'idx_source_id'
);
SET @sql := IF(@idx_exists > 0,
  'ALTER TABLE crm_opportunity DROP INDEX idx_source_id',
  'SELECT ''idx_source_id not exists'' AS msg'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 删除 uk_opportunity_no 索引（如存在）
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_opportunity'
    AND INDEX_NAME = 'uk_opportunity_no'
);
SET @sql := IF(@idx_exists > 0,
  'ALTER TABLE crm_opportunity DROP INDEX uk_opportunity_no',
  'SELECT ''uk_opportunity_no not exists'' AS msg'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 删除 source_id 字段（如存在）
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_opportunity'
    AND COLUMN_NAME = 'source_id'
);
SET @sql := IF(@col_exists > 0,
  'ALTER TABLE crm_opportunity DROP COLUMN source_id',
  'SELECT ''source_id column not exists'' AS msg'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. 删除 opportunity_no 字段（如存在）
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_opportunity'
    AND COLUMN_NAME = 'opportunity_no'
);
SET @sql := IF(@col_exists > 0,
  'ALTER TABLE crm_opportunity DROP COLUMN opportunity_no',
  'SELECT ''opportunity_no column not exists'' AS msg'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. 删除 crm_opportunity_source 字典表
DROP TABLE IF EXISTS crm_opportunity_source;

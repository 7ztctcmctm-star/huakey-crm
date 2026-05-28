-- ============================================================
-- 迁移: 操作日志字段级变更记录
-- 日期: 2026-05-28
-- ============================================================

USE huakey_crm;

-- 新增字段变更相关列（幂等执行）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_log' AND COLUMN_NAME = 'changed_fields');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sys_log ADD COLUMN changed_fields TEXT DEFAULT NULL COMMENT ''变更字段列表(JSON)'' AFTER params',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_log' AND COLUMN_NAME = 'old_value');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sys_log ADD COLUMN old_value TEXT DEFAULT NULL COMMENT ''变更前数据(JSON)'' AFTER changed_fields',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_log' AND COLUMN_NAME = 'new_value');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sys_log ADD COLUMN new_value TEXT DEFAULT NULL COMMENT ''变更后数据(JSON)'' AFTER old_value',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

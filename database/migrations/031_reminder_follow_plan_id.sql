-- 031_reminder_follow_plan_id.sql
-- 给 crm_follow_up_reminder 表添加 follow_plan_id 字段，关联跟进计划

-- 1. 添加 follow_plan_id 字段（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up_reminder' AND COLUMN_NAME = 'follow_plan_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_follow_up_reminder ADD COLUMN follow_plan_id INT DEFAULT NULL COMMENT ''关联跟进计划ID'' AFTER manager_id',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 添加索引（幂等）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up_reminder' AND INDEX_NAME = 'idx_reminder_follow_plan');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_reminder_follow_plan ON crm_follow_up_reminder(follow_plan_id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

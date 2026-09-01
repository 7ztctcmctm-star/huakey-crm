-- ============================================================
-- 109: crm_follow_up 增加商机关联字段
-- ============================================================
-- Phase 5.6 Follow Plan MVP: 支持 Customer + Opportunity 跟进
-- 变更: crm_follow_up 增加 opportunity_id (可空, 商机关联)
-- 幂等: information_schema 检查, 已存在则跳过
-- 不修改已有数据
-- ============================================================

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'opportunity_id'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE crm_follow_up ADD COLUMN opportunity_id INT DEFAULT NULL COMMENT ''关联商机ID(可选)'' AFTER customer_id',
  'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up' AND INDEX_NAME = 'idx_fu_opportunity'
);

SET @sql2 := IF(@idx_exists = 0,
  'ALTER TABLE crm_follow_up ADD INDEX idx_fu_opportunity (opportunity_id)',
  'SELECT 1');

PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

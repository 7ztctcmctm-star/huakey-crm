-- 109_down: 移除商机关联字段
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crm_follow_up' AND INDEX_NAME='idx_fu_opportunity');
SET @sql := IF(@idx_exists > 0, 'ALTER TABLE crm_follow_up DROP INDEX idx_fu_opportunity', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
ALTER TABLE crm_follow_up DROP COLUMN IF EXISTS opportunity_id;

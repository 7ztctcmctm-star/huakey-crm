-- ============================================================
-- 109_down: 移除商机关联字段
-- 注意: MySQL 8.0 不支持 DROP COLUMN IF EXISTS（MariaDB 语法）
--       ⇒ 统一用 information_schema + PREPARE/EXECUTE（项目惯例模式，同 090_down）
-- ============================================================

-- 1. 移除索引
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crm_follow_up' AND INDEX_NAME='idx_fu_opportunity');
SET @sql := IF(@idx_exists > 0, 'ALTER TABLE crm_follow_up DROP INDEX idx_fu_opportunity', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 移除列
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crm_follow_up' AND COLUMN_NAME='opportunity_id');
SET @sql2 := IF(@col_exists > 0, 'ALTER TABLE crm_follow_up DROP COLUMN opportunity_id', 'SELECT 1'); PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

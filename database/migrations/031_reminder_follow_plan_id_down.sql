-- Auto-generated down script for 031_reminder_follow_plan_id.sql
-- Generated at: 2026-07-01T08:25:56.871Z
USE huakey_crm;

SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up_reminder' AND COLUMN_NAME='follow_plan_id');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `crm_follow_up_reminder` DROP COLUMN `follow_plan_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

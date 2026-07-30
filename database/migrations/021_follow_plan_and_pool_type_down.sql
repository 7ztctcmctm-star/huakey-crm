-- 回滚 021_follow_plan_and_pool_type: 删除跟进计划表 + 移除客户池类型字段
DROP TABLE IF EXISTS crm_follow_plan;
SET @db = 'huakey_crm';
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND COLUMN_NAME='pool_type');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_customer DROP COLUMN pool_type', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

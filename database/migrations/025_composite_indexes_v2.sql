-- ============================================================
-- 迁移: 复合索引优化 v2
-- 日期: 2026-05-26
-- 说明: 为高频查询场景补充复合索引，覆盖看板、漏斗、列表等核心查询
-- 影响: 纯索引变更，不改数据，不锁表(MySQL 8.0 Online DDL)
-- ============================================================

USE huakey_crm;

SET @db = 'huakey_crm';

-- crm_customer: 看板逾期客户查询 (status NOT IN + owner_id + last_follow_time)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_cust_status_owner_follow');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_customer ADD INDEX idx_cust_status_owner_follow (status, owner_id, last_follow_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_opportunity: 销售漏斗聚合 (deleted_at + stage GROUP BY + expected_amount 覆盖)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity' AND INDEX_NAME='idx_opp_del_stage_amount');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_opportunity ADD INDEX idx_opp_del_stage_amount (deleted_at, stage, expected_amount)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_contract: 合同列表 (deleted_at + status + create_time 排序)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND INDEX_NAME='idx_contract_del_status_ctime');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_contract ADD INDEX idx_contract_del_status_ctime (deleted_at, status, create_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_payment: 合同列表中的回款子查询 (contract_id + deleted_at 精确匹配)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment' AND INDEX_NAME='idx_payment_contract_del');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_payment ADD INDEX idx_payment_contract_del (contract_id, deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_service_order: 看板待办统计 (assignee_id IN + status IN)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_service_order' AND INDEX_NAME='idx_service_assignee_status');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_service_order ADD INDEX idx_service_assignee_status (assignee_id, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_follow_up: 客户详情跟进列表 (customer_id + deleted_at + create_time 排序)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up' AND INDEX_NAME='idx_follow_cust_del_time');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_follow_up ADD INDEX idx_follow_cust_del_time (customer_id, deleted_at, create_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_sales_target: 看板目标达成率 (user_id + year + month 精确匹配)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_sales_target' AND INDEX_NAME='idx_target_user_year_month');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_sales_target ADD INDEX idx_target_user_year_month (user_id, year, month)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


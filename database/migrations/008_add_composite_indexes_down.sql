-- ============================================================
-- 回滚: 008_add_composite_indexes
-- 删除正向迁移创建的复合索引
-- ============================================================

SET @db = 'huakey_crm';

-- crm_customer 复合索引
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_cust_owner_status_ctime');
SET @sql = IF(@idx_exists > 0, 'DROP INDEX idx_cust_owner_status_ctime ON crm_customer', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_opportunity 复合索引
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity' AND INDEX_NAME='idx_opp_owner_stage_ctime');
SET @sql = IF(@idx_exists > 0, 'DROP INDEX idx_opp_owner_stage_ctime ON crm_opportunity', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_contract 复合索引
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND INDEX_NAME='idx_contract_status_ctime');
SET @sql = IF(@idx_exists > 0, 'DROP INDEX idx_contract_status_ctime ON crm_contract', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

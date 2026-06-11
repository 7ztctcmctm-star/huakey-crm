-- Bug #35: 为高频列表查询添加复合索引

SET @db = 'huakey_crm';

-- crm_customer: 列表查询固定过滤 owner_id + status，按 create_time 排序
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_cust_owner_status_ctime');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_cust_owner_status_ctime ON crm_customer(owner_id, status, create_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_opportunity: 列表查询过滤 owner_id + stage，按 create_time 排序
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity' AND INDEX_NAME='idx_opp_owner_stage_ctime');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_opp_owner_stage_ctime ON crm_opportunity(owner_id, stage, create_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_contract: 列表查询过滤 status，按 create_time 排序
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND INDEX_NAME='idx_contract_status_ctime');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_contract_status_ctime ON crm_contract(status, create_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

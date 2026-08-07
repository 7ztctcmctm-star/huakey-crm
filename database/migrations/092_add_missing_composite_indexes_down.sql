-- 092_down: 移除补充的复合索引
SET @db = DATABASE();
SET @sql1 = (SELECT IF(COUNT(*) > 0,
  'DROP INDEX idx_owner_status_deleted ON crm_customer',
  'SELECT 1') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_owner_status_deleted');
PREPARE stmt FROM @sql1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql2 = (SELECT IF(COUNT(*) > 0,
  'DROP INDEX idx_contract_cust_status ON crm_contract',
  'SELECT 1') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_contract' AND INDEX_NAME = 'idx_contract_cust_status');
PREPARE stmt FROM @sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql3 = (SELECT IF(COUNT(*) > 0,
  'DROP INDEX idx_follow_cust_deleted ON crm_follow_up',
  'SELECT 1') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_follow_up' AND INDEX_NAME = 'idx_follow_cust_deleted');
PREPARE stmt FROM @sql3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql4 = (SELECT IF(COUNT(*) > 0,
  'DROP INDEX idx_payment_contract_deleted ON crm_payment',
  'SELECT 1') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_payment' AND INDEX_NAME = 'idx_payment_contract_deleted');
PREPARE stmt FROM @sql4; EXECUTE stmt; DEALLOCATE PREPARE stmt;

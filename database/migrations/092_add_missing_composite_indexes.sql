-- ============================================
-- 迁移: 补充缺失的复合索引
-- 编号: 092
-- 说明: 为高频查询路径添加复合索引，减少回表
-- ============================================

SET @db = DATABASE();

-- 1. crm_customer: (owner_id, status, deleted_at) — 列表查询 + 数据权限 + 软删除
SET @idx1 = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_owner_status_deleted');
SET @sql1 = IF(@idx1 = 0,
  'CREATE INDEX idx_owner_status_deleted ON crm_customer(owner_id, status, deleted_at)',
  'SELECT ''idx_owner_status_deleted 已存在'' AS msg');
PREPARE stmt FROM @sql1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. crm_contract: (customer_id, status) — 合同列表 + 客户维度 + 状态筛选
SET @idx2 = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_contract' AND INDEX_NAME = 'idx_contract_cust_status');
SET @sql2 = IF(@idx2 = 0,
  'CREATE INDEX idx_contract_cust_status ON crm_contract(customer_id, status)',
  'SELECT ''idx_contract_cust_status 已存在'' AS msg');
PREPARE stmt FROM @sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. crm_follow_up: (customer_id, deleted_at) — 跟进列表常用
SET @idx3 = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_follow_up' AND INDEX_NAME = 'idx_follow_cust_deleted');
SET @sql3 = IF(@idx3 = 0,
  'CREATE INDEX idx_follow_cust_deleted ON crm_follow_up(customer_id, deleted_at)',
  'SELECT ''idx_follow_cust_deleted 已存在'' AS msg');
PREPARE stmt FROM @sql3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. crm_payment: (contract_id, deleted_at) — 回款查询常用
SET @idx4 = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_payment' AND INDEX_NAME = 'idx_payment_contract_deleted');
SET @sql4 = IF(@idx4 = 0,
  'CREATE INDEX idx_payment_contract_deleted ON crm_payment(contract_id, deleted_at)',
  'SELECT ''idx_payment_contract_deleted 已存在'' AS msg');
PREPARE stmt FROM @sql4; EXECUTE stmt; DEALLOCATE PREPARE stmt;

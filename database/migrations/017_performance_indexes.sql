-- ============================================================
-- 迁移: 性能优化 — 补充 deleted_at 索引
-- 日期: 2026-05-25
-- 说明: 为缺失 deleted_at 索引的业务大表补充索引
-- 注意: 幂等写法，先查 information_schema.STATISTICS 判断索引是否已存在
-- ============================================================

SET @db = 'huakey_crm';

-- crm_contract
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND INDEX_NAME='idx_contract_deleted_at');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_contract ADD INDEX idx_contract_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_opportunity
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity' AND INDEX_NAME='idx_opp_deleted_at');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_opportunity ADD INDEX idx_opp_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_quote
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND INDEX_NAME='idx_quote_deleted_at');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_quote ADD INDEX idx_quote_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_payment
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment' AND INDEX_NAME='idx_payment_deleted_at');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_payment ADD INDEX idx_payment_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_service_order
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_service_order' AND INDEX_NAME='idx_service_deleted_at');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_service_order ADD INDEX idx_service_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_supplier
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_supplier' AND INDEX_NAME='idx_supplier_deleted_at');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_supplier ADD INDEX idx_supplier_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_contact
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contact' AND INDEX_NAME='idx_contact_deleted_at');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_contact ADD INDEX idx_contact_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_follow_up
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up' AND INDEX_NAME='idx_follow_deleted_at');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_follow_up ADD INDEX idx_follow_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_pool_log
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_pool_log' AND INDEX_NAME='idx_pool_log_deleted_at');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_pool_log ADD INDEX idx_pool_log_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_customer
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_customer_deleted_at');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_customer ADD INDEX idx_customer_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 迁移版本由 run_migrations.js 统一以文件名注册（英文 name 用于定位 _down.sql，
-- 内嵌中文自注册会覆盖文件名导致 rollback 拼不出 down 文件路径，破坏往返对称性）

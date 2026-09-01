-- ============================================================
-- 迁移: 补充缺失的 deleted_at 软删除字段
-- 日期: 2026-05-25
-- 说明: 为 13 张缺少 deleted_at 的 crm_ 表添加软删除支持
-- ============================================================

SET @db = 'huakey_crm';

-- crm_assign_log
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_assign_log');
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_assign_log' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@tbl_exists > 0 AND @col_exists = 0, 'ALTER TABLE crm_assign_log ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_customer_supplier_relation
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer_supplier_relation');
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer_supplier_relation' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@tbl_exists > 0 AND @col_exists = 0, 'ALTER TABLE crm_customer_supplier_relation ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_follow_up_reminder
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up_reminder');
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up_reminder' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@tbl_exists > 0 AND @col_exists = 0, 'ALTER TABLE crm_follow_up_reminder ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_payment_plan
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment_plan');
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment_plan' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@tbl_exists > 0 AND @col_exists = 0, 'ALTER TABLE crm_payment_plan ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_purchase_item
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_purchase_item');
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_purchase_item' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@tbl_exists > 0 AND @col_exists = 0, 'ALTER TABLE crm_purchase_item ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_purchase_order
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_purchase_order');
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_purchase_order' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@tbl_exists > 0 AND @col_exists = 0, 'ALTER TABLE crm_purchase_order ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_purchase_payment
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_purchase_payment');
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_purchase_payment' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@tbl_exists > 0 AND @col_exists = 0, 'ALTER TABLE crm_purchase_payment ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_purchase_receipt
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_purchase_receipt');
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_purchase_receipt' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@tbl_exists > 0 AND @col_exists = 0, 'ALTER TABLE crm_purchase_receipt ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_quote_item
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote_item');
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote_item' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@tbl_exists > 0 AND @col_exists = 0, 'ALTER TABLE crm_quote_item ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_sales_target（顺序兼容：该表实际由 034 建表迁移创建且自带 deleted_at，
-- 019 早于 034 执行时表尚不存在，跳过即可）
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_sales_target');
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_sales_target' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@tbl_exists > 0 AND @col_exists = 0, 'ALTER TABLE crm_sales_target ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_supplier_contact
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_supplier_contact');
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_supplier_contact' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@tbl_exists > 0 AND @col_exists = 0, 'ALTER TABLE crm_supplier_contact ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_supplier_qualification
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_supplier_qualification');
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_supplier_qualification' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@tbl_exists > 0 AND @col_exists = 0, 'ALTER TABLE crm_supplier_qualification ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_supplier_rating
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_supplier_rating');
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_supplier_rating' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@tbl_exists > 0 AND @col_exists = 0, 'ALTER TABLE crm_supplier_rating ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 记录迁移版本
INSERT IGNORE INTO schema_migrations (version, name) VALUES ('019', '补充缺失的deleted_at软删除字段');

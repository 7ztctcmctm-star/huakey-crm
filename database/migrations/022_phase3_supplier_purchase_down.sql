-- 回滚 022_phase3_supplier_purchase: 移除供应商评分增强字段 + 采购审批字段
SET @db = DATABASE();

-- 1. 供应商评分表：移除 Phase 3 添加的字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_supplier_rating' AND COLUMN_NAME='purchase_order_id');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_supplier_rating DROP COLUMN purchase_order_id', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_supplier_rating' AND COLUMN_NAME='quality_rate');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_supplier_rating DROP COLUMN quality_rate', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_supplier_rating' AND COLUMN_NAME='delivery_rate');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_supplier_rating DROP COLUMN delivery_rate', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 采购订单表：移除审批字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_purchase_order' AND COLUMN_NAME='approve_time');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_purchase_order DROP COLUMN approve_time', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_purchase_order' AND COLUMN_NAME='approveRemark');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_purchase_order DROP COLUMN approveRemark', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

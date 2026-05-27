-- 022_phase3_supplier_purchase.sql
-- Phase 3: 供应商评分增强 + 采购审批字段

-- 1. 供应商评分表增强（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier_rating' AND COLUMN_NAME = 'purchase_order_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_supplier_rating ADD COLUMN purchase_order_id INT DEFAULT NULL COMMENT ''关联采购单'' AFTER supplier_id',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier_rating' AND COLUMN_NAME = 'quality_rate');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_supplier_rating ADD COLUMN quality_rate DECIMAL(5,2) DEFAULT 0.00 COMMENT ''质量合格率'' AFTER price_score',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier_rating' AND COLUMN_NAME = 'delivery_rate');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_supplier_rating ADD COLUMN delivery_rate DECIMAL(5,2) DEFAULT 0.00 COMMENT ''准时交付率'' AFTER quality_rate',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 采购单增加审批字段（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_order' AND COLUMN_NAME = 'approve_time');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_purchase_order ADD COLUMN approve_time DATETIME DEFAULT NULL COMMENT ''审批时间'' AFTER status',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_order' AND COLUMN_NAME = 'approveRemark');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_purchase_order ADD COLUMN approveRemark VARCHAR(500) DEFAULT NULL COMMENT ''审批备注'' AFTER approve_time',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

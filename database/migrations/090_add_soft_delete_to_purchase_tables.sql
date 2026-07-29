-- ============================================
-- 迁移: 采购申请表 + 采购比价表添加软删除
-- 编号: 090
-- 说明: 066/067 创建的表缺少 deleted_at 列，补足以支持软删除
-- ============================================

-- 1. crm_purchase_request 添加 deleted_at
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_request' AND COLUMN_NAME = 'deleted_at');
SET @add_col_sql = IF(@col_exists = 0,
  'ALTER TABLE crm_purchase_request ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT ''软删除时间'' AFTER updated_at',
  'SELECT 1');
PREPARE add_col_stmt FROM @add_col_sql;
EXECUTE add_col_stmt;
DEALLOCATE PREPARE add_col_stmt;

-- 2. crm_purchase_comparison 添加 deleted_at
SET @col_exists2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison' AND COLUMN_NAME = 'deleted_at');
SET @add_col_sql2 = IF(@col_exists2 = 0,
  'ALTER TABLE crm_purchase_comparison ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT ''软删除时间'' AFTER updated_at',
  'SELECT 1');
PREPARE add_col_stmt2 FROM @add_col_sql2;
EXECUTE add_col_stmt2;
DEALLOCATE PREPARE add_col_stmt2;

-- 3. crm_purchase_comparison_item 添加 deleted_at
SET @col_exists3 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison_item' AND COLUMN_NAME = 'deleted_at');
SET @add_col_sql3 = IF(@col_exists3 = 0,
  'ALTER TABLE crm_purchase_comparison_item ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT ''软删除时间'' AFTER created_at',
  'SELECT 1');
PREPARE add_col_stmt3 FROM @add_col_sql3;
EXECUTE add_col_stmt3;
DEALLOCATE PREPARE add_col_stmt3;

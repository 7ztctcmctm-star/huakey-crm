-- ============================================
-- 回滚: 采购申请表 + 采购比价表删除软删除列
-- 编号: 090_down
-- 说明: 移除 090 正向迁移添加的 deleted_at 列
-- 注意: MySQL 8.0 不支持 ALTER TABLE ... DROP COLUMN IF EXISTS（MariaDB 语法），
--       使用 information_schema + PREPARE/EXECUTE 条件化 DDL（项目惯例模式）
-- ============================================

-- 1. crm_purchase_request 移除 deleted_at
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_request' AND COLUMN_NAME = 'deleted_at');
SET @sql = IF(@col_exists > 0,
  'ALTER TABLE crm_purchase_request DROP COLUMN deleted_at',
  'SELECT 1 AS request_deleted_at_not_exists');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. crm_purchase_comparison 移除 deleted_at
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison' AND COLUMN_NAME = 'deleted_at');
SET @sql = IF(@col_exists > 0,
  'ALTER TABLE crm_purchase_comparison DROP COLUMN deleted_at',
  'SELECT 1 AS comparison_deleted_at_not_exists');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. crm_purchase_comparison_item 移除 deleted_at
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison_item' AND COLUMN_NAME = 'deleted_at');
SET @sql = IF(@col_exists > 0,
  'ALTER TABLE crm_purchase_comparison_item DROP COLUMN deleted_at',
  'SELECT 1 AS item_deleted_at_not_exists');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

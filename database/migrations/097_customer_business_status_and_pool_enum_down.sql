-- ============================================================
-- 097_down: 回滚 097 迁移
-- ============================================================
-- 回滚策略：
--   1. 从备份表恢复 pool_status 原始值（TINYINT 0/1）
--   2. 将 pool_status 改回 TINYINT
--   3. 删除 business_status 字段
--   4. 删除新增索引
--   5. 删除备份表
--
-- ⚠️ 注意：回滚前请确保后端代码已恢复到 097 迁移前的版本
-- ============================================================

-- 步骤 1：从备份恢复 pool_status 原始值（先转回 '0'/'1' 字符串，再改类型）
-- 备份表仅在 097 up 真实执行过的库中存在；基线导入环境（init-complete.sql + 版本标记已执行）
-- 无备份表，此时将 pool_status 统一重置为 0（私有），避免 'private'/'sea' 隐式转 TINYINT 截断报错
SET @backup_exists = (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_migration_097_backup');
SET @sql = IF(@backup_exists > 0,
  'UPDATE crm_customer c JOIN _migration_097_backup b ON c.id = b.id SET c.pool_status = b.pool_status_old WHERE c.deleted_at IS NULL',
  'UPDATE crm_customer SET pool_status = 0 WHERE pool_status IS NOT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 步骤 2：将 pool_status 改回 TINYINT
ALTER TABLE crm_customer MODIFY COLUMN pool_status TINYINT NULL DEFAULT 0 COMMENT '公海状态：0=归属销售 1=在公海';

-- 步骤 3：删除新增索引（如果存在）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_customer_business_status');
SET @sql = IF(@idx_exists > 0, 'DROP INDEX idx_customer_business_status ON crm_customer', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_customer_biz_pool');
SET @sql = IF(@idx_exists > 0, 'DROP INDEX idx_customer_biz_pool ON crm_customer', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 步骤 4：删除 business_status 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'business_status');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE crm_customer DROP COLUMN business_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 步骤 5：删除备份表
DROP TABLE IF EXISTS _migration_097_backup;

SELECT '=== 097 回滚完成 ===' AS info;
SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME IN ('business_status', 'pool_status');

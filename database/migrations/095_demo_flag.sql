-- ============================================================
-- 迁移 095: Demo 数据标识字段 is_demo
-- 日期: 2026-08-03
-- 说明: 为核心 12 表添加 is_demo TINYINT(1) DEFAULT 0，
--       用于标识 Demo/演示数据，便于本地开发/测试环境/E2E/演示使用，
--       且不污染生产真实数据（可按 is_demo=1 精准清理）。
--       选型：is_demo 布尔（而非 data_source 字符串），语义清晰、索引小、
--       不与 crm_report_config.data_source 语义混淆。
--       幂等：每表先查 information_schema.COLUMNS，已存在则跳过。
--       用 DATABASE() 替代硬编码库名，兼容 huakey_crm / huakey_crm_test。
-- ============================================================

-- 1. sys_user
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE sys_user ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. crm_customer
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_customer ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. crm_contact
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_contact ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. crm_opportunity
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_opportunity' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_opportunity ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. crm_follow_up
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_follow_up ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. crm_product
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_product' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_product ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7. crm_quote
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_quote' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_quote ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 8. crm_contract
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contract' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_contract ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 9. crm_payment_plan
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_payment_plan' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_payment_plan ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 10. crm_payment
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_payment' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_payment ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 11. crm_supplier
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_supplier ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 12. crm_approval_workflow
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_approval_workflow' AND COLUMN_NAME = 'is_demo');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_approval_workflow ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 辅助索引：加速 is_demo 过滤查询（仅对高频过滤表加索引）
-- ============================================================
-- crm_customer: 列表常按 deleted_at + is_demo 过滤
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_customer_is_demo');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_customer_is_demo ON crm_customer(is_demo)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sys_user: 管理后台常按 is_demo 过滤
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND INDEX_NAME = 'idx_user_is_demo');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_user_is_demo ON sys_user(is_demo)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 迁移 094: crm_payment_plan 补齐 create_time / update_time
-- 日期: 2026-08-03
-- 说明: contractService.getContract 查询 SELECT ... create_time, update_time FROM crm_payment_plan
--       但 init-complete.sql 早期版本未包含这两列，导致合同详情接口 500 (Unknown column 'create_time')
--       本迁移幂等补齐这两列，修复生产环境全新部署后的合同详情页空白问题。
--       用 DATABASE() 替代硬编码数据库名，确保在 huakey_crm / huakey_crm_test 等任意库中均可执行。
-- ============================================================

-- 1. create_time: 记录创建时间
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_payment_plan' AND COLUMN_NAME = 'create_time');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_payment_plan ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT ''创建时间''',
  'SELECT ''crm_payment_plan.create_time already exists'' AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. update_time: 记录更新时间（自动维护）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_payment_plan' AND COLUMN_NAME = 'update_time');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_payment_plan ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT ''更新时间''',
  'SELECT ''crm_payment_plan.update_time already exists'' AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 回填历史数据的 update_time（避免 NULL 影响排序/展示）
UPDATE crm_payment_plan SET update_time = create_time WHERE update_time IS NULL AND create_time IS NOT NULL;

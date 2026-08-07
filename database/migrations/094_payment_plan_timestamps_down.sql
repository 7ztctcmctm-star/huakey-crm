-- Auto-generated down script for 094_payment_plan_timestamps.sql
-- 回滚：移除 crm_payment_plan 的 create_time / update_time 列
-- 注意：回滚后 contractService.getContract 查询将再次报错，仅用于紧急回退场景

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_payment_plan' AND COLUMN_NAME = 'update_time');
SET @sql = IF(@col_exists > 0,
  'ALTER TABLE `crm_payment_plan` DROP COLUMN `update_time`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_payment_plan' AND COLUMN_NAME = 'create_time');
SET @sql = IF(@col_exists > 0,
  'ALTER TABLE `crm_payment_plan` DROP COLUMN `create_time`',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- 回滚: 统一客户状态机
-- 说明: 将 status 恢复为 tinyint，并删除状态配置表
-- ============================================

-- 1. 恢复 status 字段类型
ALTER TABLE crm_customer MODIFY COLUMN status TINYINT NULL DEFAULT 1;

-- 2. 恢复旧状态值（仅当 old_status_int 列存在时执行）
SET @has_old_status = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'old_status_int');
SET @restore_sql = IF(@has_old_status > 0,
  'UPDATE crm_customer SET status = old_status_int WHERE old_status_int IS NOT NULL',
  'SELECT 1');
PREPARE restore_stmt FROM @restore_sql; EXECUTE restore_stmt; DEALLOCATE PREPARE restore_stmt;

-- 3. 删除备份字段（兼容不支持 IF EXISTS 的 MySQL 版本）
SET @drop_sql = IF(@has_old_status > 0,
  'ALTER TABLE crm_customer DROP COLUMN old_status_int',
  'SELECT 1');
PREPARE drop_stmt FROM @drop_sql; EXECUTE drop_stmt; DEALLOCATE PREPARE drop_stmt;

-- 4. 删除状态流转规则表
DROP TABLE IF EXISTS sys_customer_status_transition;

-- 5. 删除客户状态配置表
DROP TABLE IF EXISTS sys_customer_status;

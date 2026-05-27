-- ============================================================
-- 迁移: 添加缺失的外键约束
-- 日期: 2026-05-22
-- 兼容 MySQL 5.7+ / 8.0
-- 策略: ON DELETE SET NULL（用户删除时置空，不级联删除业务数据）
-- ============================================================

USE huakey_crm;

SET @db_name = 'huakey_crm';

-- ========== sys_user.manager_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'sys_user'
  AND CONSTRAINT_NAME = 'fk_user_manager' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE sys_user ADD CONSTRAINT fk_user_manager FOREIGN KEY (manager_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_user_manager already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_pool_log.from_user_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_pool_log'
  AND CONSTRAINT_NAME = 'fk_pool_log_from_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_pool_log ADD CONSTRAINT fk_pool_log_from_user FOREIGN KEY (from_user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_pool_log_from_user already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_pool_log.to_user_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_pool_log'
  AND CONSTRAINT_NAME = 'fk_pool_log_to_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_pool_log ADD CONSTRAINT fk_pool_log_to_user FOREIGN KEY (to_user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_pool_log_to_user already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_assign_log.customer_id → crm_customer.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_assign_log'
  AND CONSTRAINT_NAME = 'fk_assign_log_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_assign_log ADD CONSTRAINT fk_assign_log_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE',
  'SELECT ''fk_assign_log_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_assign_log.from_user_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_assign_log'
  AND CONSTRAINT_NAME = 'fk_assign_log_from_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_assign_log ADD CONSTRAINT fk_assign_log_from_user FOREIGN KEY (from_user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_assign_log_from_user already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_assign_log.to_user_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_assign_log'
  AND CONSTRAINT_NAME = 'fk_assign_log_to_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_assign_log ADD CONSTRAINT fk_assign_log_to_user FOREIGN KEY (to_user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_assign_log_to_user already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_assign_log.operator_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_assign_log'
  AND CONSTRAINT_NAME = 'fk_assign_log_operator' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_assign_log ADD CONSTRAINT fk_assign_log_operator FOREIGN KEY (operator_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_assign_log_operator already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_follow_up_reminder.customer_id → crm_customer.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_up_reminder'
  AND CONSTRAINT_NAME = 'fk_reminder_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_follow_up_reminder ADD CONSTRAINT fk_reminder_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE',
  'SELECT ''fk_reminder_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_follow_up_reminder.owner_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_up_reminder'
  AND CONSTRAINT_NAME = 'fk_reminder_owner' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_follow_up_reminder ADD CONSTRAINT fk_reminder_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_reminder_owner already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_follow_up_reminder.manager_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_up_reminder'
  AND CONSTRAINT_NAME = 'fk_reminder_manager' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_follow_up_reminder ADD CONSTRAINT fk_reminder_manager FOREIGN KEY (manager_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_reminder_manager already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== sys_log.user_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'sys_log'
  AND CONSTRAINT_NAME = 'fk_log_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE sys_log ADD CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_log_user already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

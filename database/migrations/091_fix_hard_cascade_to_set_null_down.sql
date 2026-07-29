-- ============================================
-- 回滚: 将 SET NULL 恢复为 CASCADE
-- 迁移: 091_down
-- ============================================

SET @db_name = DATABASE();

-- 1. crm_assign_log: SET NULL → CASCADE
SET @constraint_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_assign_log'
  AND CONSTRAINT_NAME = 'fk_assign_log_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @drop_sql = IF(@constraint_exists > 0,
  'ALTER TABLE crm_assign_log DROP FOREIGN KEY fk_assign_log_customer',
  'SELECT 1');
PREPARE stmt FROM @drop_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @add_sql = IF(@constraint_exists > 0,
  'ALTER TABLE crm_assign_log ADD CONSTRAINT fk_assign_log_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @add_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. crm_follow_up_reminder: SET NULL → CASCADE
SET @constraint_exists2 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_up_reminder'
  AND CONSTRAINT_NAME = 'fk_reminder_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @drop_sql2 = IF(@constraint_exists2 > 0,
  'ALTER TABLE crm_follow_up_reminder DROP FOREIGN KEY fk_reminder_customer',
  'SELECT 1');
PREPARE stmt FROM @drop_sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @add_sql2 = IF(@constraint_exists2 > 0,
  'ALTER TABLE crm_follow_up_reminder ADD CONSTRAINT fk_reminder_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @add_sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. crm_customer_tag: SET NULL → CASCADE
SET @constraint_exists3 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer_tag'
  AND CONSTRAINT_NAME = 'fk_customer_tag_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @drop_sql3 = IF(@constraint_exists3 > 0,
  'ALTER TABLE crm_customer_tag DROP FOREIGN KEY fk_customer_tag_customer',
  'SELECT 1');
PREPARE stmt FROM @drop_sql3; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @add_sql3 = IF(@constraint_exists3 > 0,
  'ALTER TABLE crm_customer_tag ADD CONSTRAINT fk_customer_tag_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @add_sql3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. crm_customer_score_log: SET NULL → CASCADE
SET @constraint_exists4 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer_score_log'
  AND CONSTRAINT_NAME = 'fk_score_log_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @drop_sql4 = IF(@constraint_exists4 > 0,
  'ALTER TABLE crm_customer_score_log DROP FOREIGN KEY fk_score_log_customer',
  'SELECT 1');
PREPARE stmt FROM @drop_sql4; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @add_sql4 = IF(@constraint_exists4 > 0,
  'ALTER TABLE crm_customer_score_log ADD CONSTRAINT fk_score_log_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @add_sql4; EXECUTE stmt; DEALLOCATE PREPARE stmt;

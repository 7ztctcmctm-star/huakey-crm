-- ============================================
-- 迁移: 将硬 CASCADE 删除改为 SET NULL
-- 编号: 091
-- 说明: 006/035/042 中的 crm_customer ON DELETE CASCADE
--       改为 ON DELETE SET NULL，防止意外硬删除客户时
--       级联丢失分配日志、评分日志和标签数据
-- ============================================

-- 1. crm_assign_log: CASCADE → SET NULL
SET @db_name = DATABASE();
SET @constraint_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_assign_log'
  AND CONSTRAINT_NAME = 'fk_assign_log_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @drop_sql = IF(@constraint_exists > 0,
  'ALTER TABLE crm_assign_log DROP FOREIGN KEY fk_assign_log_customer',
  'SELECT 1');
PREPARE stmt FROM @drop_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @add_sql = IF(@constraint_exists > 0,
  'ALTER TABLE crm_assign_log MODIFY COLUMN customer_id INT NULL, ADD CONSTRAINT fk_assign_log_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @add_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. crm_follow_up_reminder: CASCADE → SET NULL
SET @constraint_exists2 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_up_reminder'
  AND CONSTRAINT_NAME = 'fk_reminder_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @drop_sql2 = IF(@constraint_exists2 > 0,
  'ALTER TABLE crm_follow_up_reminder DROP FOREIGN KEY fk_reminder_customer',
  'SELECT 1');
PREPARE stmt FROM @drop_sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @add_sql2 = IF(@constraint_exists2 > 0,
  'ALTER TABLE crm_follow_up_reminder MODIFY COLUMN customer_id INT NULL, ADD CONSTRAINT fk_reminder_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @add_sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. crm_customer_tag: CASCADE → SET NULL (migration 035)
-- 使用 REFERENTIAL_CONSTRAINTS 替代 TABLE_CONSTRAINTS.DELETE_RULE（兼容 MySQL < 8.0.19）
-- 必须 REFERENCED_TABLE_NAME='crm_customer' 精确匹配：该表有指向 crm_tag 的 fk_ct_tag（同为 CASCADE），
-- 不限定父表时 LIMIT 1 可能取错 FK 名，drop 删错对象后 add 同名 → Duplicate foreign key
SET @constraint_exists3 = (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA COLLATE utf8mb3_general_ci = @db_name AND TABLE_NAME = 'crm_customer_tag'
  AND REFERENCED_TABLE_NAME = 'crm_customer'
  AND DELETE_RULE = 'CASCADE' AND UNIQUE_CONSTRAINT_SCHEMA COLLATE utf8mb3_general_ci = @db_name);
SET @fk_name3 = (SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA COLLATE utf8mb3_general_ci = @db_name AND TABLE_NAME = 'crm_customer_tag'
  AND REFERENCED_TABLE_NAME = 'crm_customer'
  AND DELETE_RULE = 'CASCADE' AND UNIQUE_CONSTRAINT_SCHEMA COLLATE utf8mb3_general_ci = @db_name
  ORDER BY CONSTRAINT_NAME LIMIT 1);
SET @drop_sql3 = IF(@constraint_exists3 > 0 AND @fk_name3 IS NOT NULL,
  CONCAT('ALTER TABLE crm_customer_tag DROP FOREIGN KEY ', @fk_name3),
  'SELECT 1');
PREPARE stmt FROM @drop_sql3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @add_sql3 = IF(@constraint_exists3 > 0 AND @fk_name3 IS NOT NULL,
  'ALTER TABLE crm_customer_tag MODIFY COLUMN customer_id INT NULL, ADD CONSTRAINT fk_customer_tag_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @add_sql3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. crm_customer_score_log: CASCADE → SET NULL (migration 042)
-- 同上：REFERENCED_TABLE_NAME 精确匹配 + ORDER BY 消除 LIMIT 1 的不确定性
SET @constraint_exists4 = (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA COLLATE utf8mb3_general_ci = @db_name AND TABLE_NAME = 'crm_customer_score_log'
  AND REFERENCED_TABLE_NAME = 'crm_customer'
  AND DELETE_RULE = 'CASCADE' AND UNIQUE_CONSTRAINT_SCHEMA COLLATE utf8mb3_general_ci = @db_name);
SET @fk_name4 = (SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA COLLATE utf8mb3_general_ci = @db_name AND TABLE_NAME = 'crm_customer_score_log'
  AND REFERENCED_TABLE_NAME = 'crm_customer'
  AND DELETE_RULE = 'CASCADE' AND UNIQUE_CONSTRAINT_SCHEMA COLLATE utf8mb3_general_ci = @db_name
  ORDER BY CONSTRAINT_NAME LIMIT 1);
SET @drop_sql4 = IF(@constraint_exists4 > 0 AND @fk_name4 IS NOT NULL,
  CONCAT('ALTER TABLE crm_customer_score_log DROP FOREIGN KEY ', @fk_name4),
  'SELECT 1');
PREPARE stmt FROM @drop_sql4; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @add_sql4 = IF(@constraint_exists4 > 0 AND @fk_name4 IS NOT NULL,
  'ALTER TABLE crm_customer_score_log MODIFY COLUMN customer_id INT NULL, ADD CONSTRAINT fk_score_log_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @add_sql4; EXECUTE stmt; DEALLOCATE PREPARE stmt;

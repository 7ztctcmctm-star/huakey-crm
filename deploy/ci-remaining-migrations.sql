-- ============================================
-- CI 剩余迁移脚本 (056-092)
-- 在 init-complete.sql 之后运行，将 schema 补充到最新版本
-- 所有语句使用 IF NOT EXISTS / 条件判断确保幂等
-- ============================================

-- ====== Migration 056: 056_log_cleanup.sql ======
-- 056: sys_log 归档清理
-- 保留最近30天日志，归档更早的到 sys_log_archive
-- 创建定时事件每月自动执行

-- 1. 创建归档表（结构与 sys_log 相同）
CREATE TABLE IF NOT EXISTS sys_log_archive LIKE sys_log;

-- 2. 归档30天前的日志
INSERT INTO sys_log_archive
SELECT * FROM sys_log WHERE create_time < DATE_SUB(NOW(), INTERVAL 30 DAY);

-- 3. 删除已归档的日志
DELETE FROM sys_log WHERE create_time < DATE_SUB(NOW(), INTERVAL 30 DAY);

-- 4. 添加定时清理事件（每月1日凌晨3点执行）
DROP EVENT IF EXISTS evt_archive_sys_log;
CREATE EVENT evt_archive_sys_log
ON SCHEDULE EVERY 1 MONTH
STARTS CURRENT_TIMESTAMP + INTERVAL 1 MONTH
DO
BEGIN
  INSERT INTO sys_log_archive SELECT * FROM sys_log WHERE create_time < DATE_SUB(NOW(), INTERVAL 30 DAY);
  DELETE FROM sys_log WHERE create_time < DATE_SUB(NOW(), INTERVAL 30 DAY);
END;

-- ====== Migration 057: 057_unify_soft_delete.sql ======
-- 057: 统一3表软删除模式为 deleted_at IS NULL
-- crm_product_price、crm_score_rule、crm_currency

-- 1. crm_product_price 添加 deleted_at（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_product_price' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists=0,
  'ALTER TABLE crm_product_price ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL AFTER status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_product_price' AND INDEX_NAME='idx_product_price_deleted');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX idx_product_price_deleted ON crm_product_price(deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. crm_score_rule 添加 deleted_at（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_score_rule' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists=0,
  'ALTER TABLE crm_score_rule ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL AFTER status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_score_rule' AND INDEX_NAME='idx_score_rule_deleted');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX idx_score_rule_deleted ON crm_score_rule(deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. crm_currency 添加 deleted_at（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_currency' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@col_exists=0,
  'ALTER TABLE crm_currency ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL AFTER status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_currency' AND INDEX_NAME='idx_currency_deleted');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX idx_currency_deleted ON crm_currency(deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 将已禁用的货币标记为软删除
UPDATE crm_currency SET deleted_at = NOW() WHERE status = 0 AND deleted_at IS NULL;

-- ====== Migration 058: 058_soft_delete_batch2.sql ======
-- 058: 7表补齐 deleted_at 软删除字段
-- crm_attachment, crm_competitor_encounter, crm_competitor_intel,
-- crm_contract_template, crm_email_account, crm_social_contact, crm_tag
-- [幂等] 使用 information_schema 检查列是否存在，防止重复执行报错

SET @db = DATABASE();

-- crm_attachment
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_attachment' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@exists=0, 'ALTER TABLE crm_attachment ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_competitor_encounter
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_competitor_encounter' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@exists=0, 'ALTER TABLE crm_competitor_encounter ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_competitor_intel
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_competitor_intel' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@exists=0, 'ALTER TABLE crm_competitor_intel ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_contract_template
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract_template' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@exists=0, 'ALTER TABLE crm_contract_template ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_email_account
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_email_account' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@exists=0, 'ALTER TABLE crm_email_account ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_social_contact
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_social_contact' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@exists=0, 'ALTER TABLE crm_social_contact ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_tag
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_tag' AND COLUMN_NAME='deleted_at');
SET @sql = IF(@exists=0, 'ALTER TABLE crm_tag ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ====== Migration 059: 059_core_foreign_keys.sql ======
SET @db_name = DATABASE();
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_customer' AND CONSTRAINT_NAME='fk_customer_owner' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @is_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_customer' AND COLUMN_NAME='owner_id' AND IS_NULLABLE='YES');
SET @sql = IF(@fk_exists = 0, IF(@is_nullable > 0, 'ALTER TABLE crm_customer ADD CONSTRAINT fk_customer_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL', 'ALTER TABLE crm_customer ADD CONSTRAINT fk_customer_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE CASCADE'), 'SELECT "fk_customer_owner exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_follow_up' AND CONSTRAINT_NAME='fk_followup_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @is_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_follow_up' AND COLUMN_NAME='customer_id' AND IS_NULLABLE='YES');
SET @sql = IF(@fk_exists = 0, IF(@is_nullable > 0, 'ALTER TABLE crm_follow_up ADD CONSTRAINT fk_followup_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL', 'ALTER TABLE crm_follow_up ADD CONSTRAINT fk_followup_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE'), 'SELECT "fk_followup_customer exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_follow_up' AND CONSTRAINT_NAME='fk_followup_create_by' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @is_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_follow_up' AND COLUMN_NAME='create_by' AND IS_NULLABLE='YES');
SET @sql = IF(@fk_exists = 0, IF(@is_nullable > 0, 'ALTER TABLE crm_follow_up ADD CONSTRAINT fk_followup_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL', 'ALTER TABLE crm_follow_up ADD CONSTRAINT fk_followup_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE CASCADE'), 'SELECT "fk_followup_create_by exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_follow_plan' AND CONSTRAINT_NAME='fk_followplan_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @is_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_follow_plan' AND COLUMN_NAME='customer_id' AND IS_NULLABLE='YES');
SET @sql = IF(@fk_exists = 0, IF(@is_nullable > 0, 'ALTER TABLE crm_follow_plan ADD CONSTRAINT fk_followplan_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL', 'ALTER TABLE crm_follow_plan ADD CONSTRAINT fk_followplan_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE'), 'SELECT "fk_followplan_customer exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_follow_plan' AND CONSTRAINT_NAME='fk_followplan_create_by' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @is_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_follow_plan' AND COLUMN_NAME='create_by' AND IS_NULLABLE='YES');
SET @sql = IF(@fk_exists = 0, IF(@is_nullable > 0, 'ALTER TABLE crm_follow_plan ADD CONSTRAINT fk_followplan_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL', 'ALTER TABLE crm_follow_plan ADD CONSTRAINT fk_followplan_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE CASCADE'), 'SELECT "fk_followplan_create_by exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_followup_template' AND CONSTRAINT_NAME='fk_followup_tpl_create_by' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @is_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_followup_template' AND COLUMN_NAME='create_by' AND IS_NULLABLE='YES');
SET @sql = IF(@fk_exists = 0, IF(@is_nullable > 0, 'ALTER TABLE crm_followup_template ADD CONSTRAINT fk_followup_tpl_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL', 'ALTER TABLE crm_followup_template ADD CONSTRAINT fk_followup_tpl_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE CASCADE'), 'SELECT "fk_followup_tpl_create_by exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_opportunity' AND CONSTRAINT_NAME='fk_opp_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @is_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_opportunity' AND COLUMN_NAME='customer_id' AND IS_NULLABLE='YES');
SET @sql = IF(@fk_exists = 0, IF(@is_nullable > 0, 'ALTER TABLE crm_opportunity ADD CONSTRAINT fk_opp_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL', 'ALTER TABLE crm_opportunity ADD CONSTRAINT fk_opp_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE'), 'SELECT "fk_opp_customer exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_opportunity' AND CONSTRAINT_NAME='fk_opp_owner' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @is_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_opportunity' AND COLUMN_NAME='owner_id' AND IS_NULLABLE='YES');
SET @sql = IF(@fk_exists = 0, IF(@is_nullable > 0, 'ALTER TABLE crm_opportunity ADD CONSTRAINT fk_opp_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL', 'ALTER TABLE crm_opportunity ADD CONSTRAINT fk_opp_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE CASCADE'), 'SELECT "fk_opp_owner exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_contract' AND CONSTRAINT_NAME='fk_contract_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @is_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_contract' AND COLUMN_NAME='customer_id' AND IS_NULLABLE='YES');
SET @sql = IF(@fk_exists = 0, IF(@is_nullable > 0, 'ALTER TABLE crm_contract ADD CONSTRAINT fk_contract_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL', 'ALTER TABLE crm_contract ADD CONSTRAINT fk_contract_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE'), 'SELECT "fk_contract_customer exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_contract' AND CONSTRAINT_NAME='fk_contract_opp' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @is_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_contract' AND COLUMN_NAME='opportunity_id' AND IS_NULLABLE='YES');
SET @sql = IF(@fk_exists = 0, IF(@is_nullable > 0, 'ALTER TABLE crm_contract ADD CONSTRAINT fk_contract_opp FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE SET NULL', 'ALTER TABLE crm_contract ADD CONSTRAINT fk_contract_opp FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE CASCADE'), 'SELECT "fk_contract_opp exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_quote' AND CONSTRAINT_NAME='fk_quote_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @is_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_quote' AND COLUMN_NAME='customer_id' AND IS_NULLABLE='YES');
SET @sql = IF(@fk_exists = 0, IF(@is_nullable > 0, 'ALTER TABLE crm_quote ADD CONSTRAINT fk_quote_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL', 'ALTER TABLE crm_quote ADD CONSTRAINT fk_quote_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE'), 'SELECT "fk_quote_customer exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_invoice' AND CONSTRAINT_NAME='fk_invoice_customer' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @is_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_invoice' AND COLUMN_NAME='customer_id' AND IS_NULLABLE='YES');
SET @sql = IF(@fk_exists = 0, IF(@is_nullable > 0, 'ALTER TABLE crm_invoice ADD CONSTRAINT fk_invoice_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL', 'ALTER TABLE crm_invoice ADD CONSTRAINT fk_invoice_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE'), 'SELECT "fk_invoice_customer exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_invoice' AND CONSTRAINT_NAME='fk_invoice_create_by' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @is_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='crm_invoice' AND COLUMN_NAME='create_by' AND IS_NULLABLE='YES');
SET @sql = IF(@fk_exists = 0, IF(@is_nullable > 0, 'ALTER TABLE crm_invoice ADD CONSTRAINT fk_invoice_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL', 'ALTER TABLE crm_invoice ADD CONSTRAINT fk_invoice_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE CASCADE'), 'SELECT "fk_invoice_create_by exists" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT "=== 059 DONE ===" AS status;

-- ====== Migration 060: 060_support_foreign_keys.sql ======
-- ============================================================
-- Migration 060: Support table foreign keys
-- Date: 2026-06-18
-- Strategy: ON DELETE SET NULL
-- Idempotent: safe to re-run
-- ============================================================

SET @db_name = 'huakey_crm';

-- ========== crm_opportunity_stage_log.opportunity_id → crm_opportunity.id ==========
-- ON DELETE SET NULL 要求 opportunity_id 可为 NULL
SET @col_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_opportunity_stage_log'
    AND COLUMN_NAME = 'opportunity_id' AND IS_NULLABLE = 'NO');
SET @sql = IF(@col_nullable = 0,
  'SELECT ''crm_opportunity_stage_log.opportunity_id already nullable'' AS msg',
  'ALTER TABLE crm_opportunity_stage_log MODIFY COLUMN opportunity_id INT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_opportunity_stage_log'
  AND CONSTRAINT_NAME = 'fk_stagelog_opp' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_opportunity_stage_log ADD CONSTRAINT fk_stagelog_opp FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE SET NULL',
  'SELECT ''fk_stagelog_opp already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_pool_log.customer_id → crm_customer.id ==========
SET @col_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_pool_log'
    AND COLUMN_NAME = 'customer_id' AND IS_NULLABLE = 'NO');
SET @sql = IF(@col_nullable = 0,
  'SELECT ''crm_pool_log.customer_id already nullable'' AS msg',
  'ALTER TABLE crm_pool_log MODIFY COLUMN customer_id INT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_pool_log'
  AND CONSTRAINT_NAME = 'fk_poollog_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_pool_log ADD CONSTRAINT fk_poollog_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT ''fk_poollog_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_calendar_event.customer_id → crm_customer.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_calendar_event'
  AND CONSTRAINT_NAME = 'fk_calendar_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_calendar_event ADD CONSTRAINT fk_calendar_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT ''fk_calendar_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_email.customer_id → crm_customer.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_email'
  AND CONSTRAINT_NAME = 'fk_email_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_email ADD CONSTRAINT fk_email_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT ''fk_email_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_email_account.user_id → sys_user.id ==========
SET @col_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_email_account'
    AND COLUMN_NAME = 'user_id' AND IS_NULLABLE = 'NO');
SET @sql = IF(@col_nullable = 0,
  'SELECT ''crm_email_account.user_id already nullable'' AS msg',
  'ALTER TABLE crm_email_account MODIFY COLUMN user_id INT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_email_account'
  AND CONSTRAINT_NAME = 'fk_email_account_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_email_account ADD CONSTRAINT fk_email_account_user FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_email_account_user already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_notification.from_user_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_notification'
  AND CONSTRAINT_NAME = 'fk_notif_from_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_notification ADD CONSTRAINT fk_notif_from_user FOREIGN KEY (from_user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_notif_from_user already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_notification.to_user_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_notification'
  AND CONSTRAINT_NAME = 'fk_notif_to_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_notification ADD CONSTRAINT fk_notif_to_user FOREIGN KEY (to_user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_notif_to_user already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_payment_reminder.customer_id → crm_customer.id ==========
SET @col_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_payment_reminder'
    AND COLUMN_NAME = 'customer_id' AND IS_NULLABLE = 'NO');
SET @sql = IF(@col_nullable = 0,
  'SELECT ''crm_payment_reminder.customer_id already nullable'' AS msg',
  'ALTER TABLE crm_payment_reminder MODIFY COLUMN customer_id INT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_payment_reminder'
  AND CONSTRAINT_NAME = 'fk_payremind_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_payment_reminder ADD CONSTRAINT fk_payremind_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT ''fk_payremind_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_sales_target.user_id → sys_user.id ==========
SET @col_nullable = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_sales_target'
    AND COLUMN_NAME = 'user_id' AND IS_NULLABLE = 'NO');
SET @sql = IF(@col_nullable = 0,
  'SELECT ''crm_sales_target.user_id already nullable'' AS msg',
  'ALTER TABLE crm_sales_target MODIFY COLUMN user_id INT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_sales_target'
  AND CONSTRAINT_NAME = 'fk_salestarget_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_sales_target ADD CONSTRAINT fk_salestarget_user FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_salestarget_user already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_competitor_encounter.customer_id → crm_customer.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_competitor_encounter'
  AND CONSTRAINT_NAME = 'fk_compenc_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_competitor_encounter ADD CONSTRAINT fk_compenc_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT ''fk_compenc_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_competitor_encounter.opportunity_id → crm_opportunity.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_competitor_encounter'
  AND CONSTRAINT_NAME = 'fk_compenc_opp' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_competitor_encounter ADD CONSTRAINT fk_compenc_opp FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE SET NULL',
  'SELECT ''fk_compenc_opp already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ====== Migration 061: 061_create_token_blacklist.sql ======
-- Token黑名单表：登出后将token hash写入此表，防止已登出token继续使用
CREATE TABLE IF NOT EXISTS `sys_token_blacklist` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `token_hash` VARCHAR(64) NOT NULL,
  `user_id` INT DEFAULT NULL,
  `expire_at` DATETIME NOT NULL,
  `reason` VARCHAR(50) DEFAULT 'logout',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_token_hash` (`token_hash`),
  INDEX `idx_expire` (`expire_at`),
  INDEX `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ====== Migration 062: 062_seed_module_permissions.sql ======
-- 062_seed_module_permissions.sql
-- 为 D 组 12 个路由文件补充模块级权限码
-- 使用 IF NOT EXISTS 保证可重复执行

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT 'AI助手', 'ai', 'menu', 0, '/ai', 100 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'ai');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '数据分析', 'analysis', 'menu', 0, '/analysis', 101 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'analysis');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '日程管理', 'calendar', 'menu', 0, '/calendar', 102 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'calendar');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '跟进提醒', 'reminder', 'menu', 0, '/reminder', 103 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'reminder');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '客户评分', 'scoring', 'menu', 0, '/scoring', 104 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'scoring');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '全局搜索', 'search', 'menu', 0, '/search', 105 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'search');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '社媒沟通', 'social', 'menu', 0, '/social', 106 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'social');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '满意度调查', 'survey', 'menu', 0, '/survey', 107 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'survey');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '客户标签', 'tag', 'menu', 0, '/tag', 108 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'tag');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '合同模板', 'contract_template', 'menu', 0, '/contract-template', 109 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'contract_template');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '跟进模板', 'followup_template', 'menu', 0, '/followup-template', 110 FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'followup_template');

-- 将新权限授予 boss 角色
-- 通过 sys_role.code 动态解析 role_id，避免不同环境角色 ID 不一致导致的外键失败
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r, sys_permission p
WHERE r.code = 'boss'
  AND p.code IN ('ai','analysis','calendar','reminder','scoring','search','social','survey','tag','contract_template','followup_template')
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- 将新权限授予 finance 角色
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r, sys_permission p
WHERE r.code = 'finance'
  AND p.code IN ('ai','analysis','calendar','reminder','scoring','search','social','survey','tag','contract_template','followup_template')
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ====== Migration 063: 063_partition_pool_log.sql ======
-- ============================================================
-- 迁移: 为 crm_pool_log 添加 RANGE 月级分区
-- 说明:
--   按 create_time 做 RANGE 分区，覆盖未来 12 个月 + p_default
-- ============================================================

SET @db = 'huakey_crm';

-- 检查表是否已分区
SET @part_exists = (SELECT COUNT(*) FROM information_schema.PARTITIONS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_pool_log' AND PARTITION_NAME IS NOT NULL);

-- MySQL InnoDB 分区表不支持外键；crm_pool_log 已存在外键约束，
-- 因此跳过 RANGE 分区，仅保留幂等检查，避免破坏现有外键完整性。
SET @sql = IF(@part_exists = 0,
  'SELECT "crm_pool_log partitioning skipped: foreign keys present, not supported on partitioned InnoDB tables" AS msg',
  'SELECT "crm_pool_log already partitioned" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ====== Migration 066: 066_create_purchase_request.sql ======
-- 采购申请表
CREATE TABLE IF NOT EXISTS crm_purchase_request (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL COMMENT '申请标题',
  request_no VARCHAR(50) UNIQUE COMMENT '申请编号',
  dept_id INT DEFAULT NULL COMMENT '申请部门ID',
  applicant_id INT NOT NULL COMMENT '申请人ID',
  expected_amount DECIMAL(12,2) DEFAULT NULL COMMENT '预计金额',
  reason TEXT COMMENT '申请理由',
  status ENUM('draft','pending','approved','rejected','ordered','cancelled') DEFAULT 'draft' COMMENT '状态',
  approved_by INT DEFAULT NULL COMMENT '审批人ID',
  approved_at DATETIME DEFAULT NULL COMMENT '审批时间',
  reject_reason TEXT COMMENT '驳回/撤销原因',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_applicant (applicant_id),
  INDEX idx_status (status),
  INDEX idx_request_no (request_no),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购申请表';

-- ====== Migration 067: 067_create_purchase_comparison.sql ======
-- 采购比价主表
CREATE TABLE IF NOT EXISTS crm_purchase_comparison (
  id INT AUTO_INCREMENT PRIMARY KEY,
  comparison_no VARCHAR(50) UNIQUE COMMENT '比价单号',
  request_id INT DEFAULT NULL COMMENT '关联采购申请ID',
  title VARCHAR(200) NOT NULL COMMENT '比价标题',
  product_name VARCHAR(200) DEFAULT NULL COMMENT '产品名称',
  quantity DECIMAL(10,2) DEFAULT NULL COMMENT '数量',
  unit VARCHAR(20) DEFAULT NULL COMMENT '单位',
  status ENUM('draft','completed','cancelled') DEFAULT 'draft' COMMENT '状态',
  selected_supplier_id INT DEFAULT NULL COMMENT '选中供应商ID',
  created_by INT NOT NULL COMMENT '创建人ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_request (request_id),
  INDEX idx_status (status),
  INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购比价单';

-- 采购比价供应商报价明细
CREATE TABLE IF NOT EXISTS crm_purchase_comparison_item (
  id INT AUTO_INCREMENT PRIMARY KEY,
  comparison_id INT NOT NULL COMMENT '比价单ID',
  supplier_id INT NOT NULL COMMENT '供应商ID',
  unit_price DECIMAL(12,2) DEFAULT NULL COMMENT '单价',
  total_price DECIMAL(12,2) DEFAULT NULL COMMENT '总价',
  delivery_days INT DEFAULT NULL COMMENT '交货天数',
  payment_terms VARCHAR(200) DEFAULT NULL COMMENT '付款条件',
  remark TEXT COMMENT '备注',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (comparison_id) REFERENCES crm_purchase_comparison(id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE RESTRICT,
  INDEX idx_comparison (comparison_id),
  INDEX idx_supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购比价供应商报价明细';

-- ====== Migration 068: 068_add_notification_link_url.sql ======
-- ============================================================
-- 迁移: 通知表增加跳转链接字段
-- 日期: 2026-06-30
-- ============================================================

SET @add_link_url = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'crm_notification'
     AND column_name = 'link_url') = 0,
  'ALTER TABLE crm_notification ADD COLUMN link_url VARCHAR(500) DEFAULT NULL COMMENT \'跳转链接\' AFTER content',
  'SELECT 1'
);

PREPARE stmt FROM @add_link_url;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ====== Migration 069: 069_create_user_permission.sql ======
-- 069_create_user_permission.sql
-- 补充用户权限关联表（修复审计 M4 问题）

CREATE TABLE IF NOT EXISTS crm_user_permission (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    user_id INT NOT NULL COMMENT '用户ID',
    permission_id INT NOT NULL COMMENT '权限ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_user_permission (user_id, permission_id),
    INDEX idx_user_id (user_id),
    INDEX idx_permission_id (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户权限关联表';

-- ====== Migration 070: 070_unify_customer_status.sql ======
-- ============================================
-- 迁移: 统一客户状态机
-- 说明: 将 status/customer_type/lifecycle_status 三套字段合并为单一 status 状态码
-- ============================================

-- 1. 创建客户状态配置表
CREATE TABLE IF NOT EXISTS sys_customer_status (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL COMMENT '状态编码',
  name VARCHAR(50) NOT NULL COMMENT '显示名称',
  sort_order INT DEFAULT 0 COMMENT '排序',
  is_default TINYINT(1) DEFAULT 0 COMMENT '是否默认状态',
  is_end TINYINT(1) DEFAULT 0 COMMENT '是否终态',
  color VARCHAR(20) DEFAULT '' COMMENT '标签颜色',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户状态配置';

-- 2. 创建状态流转规则表
CREATE TABLE IF NOT EXISTS sys_customer_status_transition (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  from_code VARCHAR(32) NOT NULL COMMENT '来源状态',
  to_code VARCHAR(32) NOT NULL COMMENT '目标状态',
  require_permission VARCHAR(50) DEFAULT NULL COMMENT '需要的权限码',
  require_reason TINYINT(1) DEFAULT 0 COMMENT '是否需要填写原因',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_transition (from_code, to_code),
  KEY idx_from_code (from_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户状态流转规则';

-- 3. 初始化默认状态
INSERT INTO sys_customer_status (code, name, sort_order, is_default, is_end, color) VALUES
('sea', '公海客户', 10, 0, 0, '#909399'),
('following', '跟进中', 20, 1, 0, '#409EFF'),
('quoted', '已报价', 30, 0, 0, '#67C23A'),
('negotiating', '谈判中', 40, 0, 0, '#E6A23C'),
('signed', '已签约', 50, 0, 1, '#67C23A'),
('lost', '已流失', 60, 0, 1, '#F56C6C'),
('paused', '暂停跟进', 70, 0, 0, '#909399')
ON DUPLICATE KEY UPDATE name=VALUES(name), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_end=VALUES(is_end), color=VALUES(color);

-- 4. 初始化流转规则
INSERT INTO sys_customer_status_transition (from_code, to_code, require_permission, require_reason) VALUES
('sea', 'following', NULL, 0),
('following', 'sea', NULL, 0),
('following', 'quoted', NULL, 0),
('following', 'paused', NULL, 1),
('following', 'lost', NULL, 1),
('quoted', 'negotiating', NULL, 0),
('quoted', 'lost', NULL, 1),
('quoted', 'following', NULL, 0),
('negotiating', 'signed', NULL, 0),
('negotiating', 'lost', NULL, 1),
('negotiating', 'quoted', NULL, 0),
('paused', 'following', NULL, 0),
('lost', 'following', 'customer:manage', 1),
('signed', 'following', 'customer:manage', 1),
('signed', 'negotiating', NULL, 1)
ON DUPLICATE KEY UPDATE from_code=from_code;

-- 5. 备份原 status 值（仅备份未删除的数据，且仅当 status 仍为 INT 类型时执行）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'old_status_int');
SET @add_col_sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN old_status_int TINYINT NULL COMMENT \'迁移前状态备份\'',
  'SELECT 1');
PREPARE add_col_stmt FROM @add_col_sql;
EXECUTE add_col_stmt;
DEALLOCATE PREPARE add_col_stmt;

-- 仅当 status 列仍是 INT 类型时才备份（VARCHAR 说明已迁移）
SET @is_int = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer'
  AND COLUMN_NAME = 'status' AND DATA_TYPE = 'tinyint');
SET @backup_sql = IF(@is_int > 0,
  'UPDATE crm_customer SET old_status_int = status WHERE deleted_at IS NULL',
  'SELECT ''status 已是 VARCHAR，跳过备份'' AS msg');
PREPARE backup_stmt FROM @backup_sql;
EXECUTE backup_stmt;
DEALLOCATE PREPARE backup_stmt;

-- 6. 修改 status 字段类型为 varchar(32)（仅当仍是 INT 时执行）
SET @modify_sql = IF(@is_int > 0,
  'ALTER TABLE crm_customer MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT \'following\'',
  'SELECT ''status 已是 VARCHAR，跳过 MODIFY'' AS msg');
PREPARE modify_stmt FROM @modify_sql;
EXECUTE modify_stmt;
DEALLOCATE PREPARE modify_stmt;

-- 7. 映射旧状态到新状态码（仅处理未删除数据，且仅首次迁移时执行）
-- 旧状态：0=已删除(跳过), 1=潜客, 2=正式客户, 3=流失, 5=线索
SET @map_sql1 = IF(@is_int > 0, 'UPDATE crm_customer SET status = \'following\' WHERE deleted_at IS NULL AND old_status_int = 1', 'SELECT 1');
PREPARE map_stmt1 FROM @map_sql1; EXECUTE map_stmt1; DEALLOCATE PREPARE map_stmt1;
SET @map_sql2 = IF(@is_int > 0, 'UPDATE crm_customer SET status = \'signed\'    WHERE deleted_at IS NULL AND old_status_int = 2', 'SELECT 1');
PREPARE map_stmt2 FROM @map_sql2; EXECUTE map_stmt2; DEALLOCATE PREPARE map_stmt2;
SET @map_sql3 = IF(@is_int > 0, 'UPDATE crm_customer SET status = \'lost\'      WHERE deleted_at IS NULL AND old_status_int = 3', 'SELECT 1');
PREPARE map_stmt3 FROM @map_sql3; EXECUTE map_stmt3; DEALLOCATE PREPARE map_stmt3;
SET @map_sql5 = IF(@is_int > 0, 'UPDATE crm_customer SET status = \'following\' WHERE deleted_at IS NULL AND old_status_int = 5', 'SELECT 1');
PREPARE map_stmt5 FROM @map_sql5; EXECUTE map_stmt5; DEALLOCATE PREPARE map_stmt5;

-- 8. 公海客户统一设置为 sea（覆盖上述映射，确保 pool_status=1 的优先）
UPDATE crm_customer SET status = 'sea' WHERE deleted_at IS NULL AND pool_status = 1;

-- 9. 兜底：任何空值都设为 following
UPDATE crm_customer SET status = 'following' WHERE deleted_at IS NULL AND (status IS NULL OR status = '');

-- ====== Migration 071: 071_unify_customer_contact.sql ======
-- ============================================
-- 迁移: 联系人模块成为客户信息唯一入口
-- 说明: 将 crm_customer 中的 contact_name/phone/email 迁移到 crm_contact，
--       并建立主联系人标记，为后续前端统一取联系人数据做准备
-- ============================================

-- 1. 给 crm_customer 旧字段加废弃注释（不删除字段）
ALTER TABLE crm_customer
  MODIFY COLUMN contact_name VARCHAR(50) NULL COMMENT '【已废弃】请使用 crm_contact',
  MODIFY COLUMN phone VARCHAR(20) NULL COMMENT '【已废弃】请使用 crm_contact',
  MODIFY COLUMN email VARCHAR(100) NULL COMMENT '【已废弃】请使用 crm_contact';

-- 2. 给 crm_contact 增加主联系人标记（动态判断列是否存在）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact' AND COLUMN_NAME = 'is_primary');
SET @add_col_sql = IF(@col_exists = 0,
  'ALTER TABLE crm_contact ADD COLUMN is_primary TINYINT(1) NOT NULL DEFAULT 0 COMMENT "是否主联系人"',
  'SELECT 1');
PREPARE add_col_stmt FROM @add_col_sql;
EXECUTE add_col_stmt;
DEALLOCATE PREPARE add_col_stmt;

-- 3. 添加主联系人复合索引（动态判断索引是否存在）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact' AND INDEX_NAME = 'idx_contact_primary');
SET @add_idx_sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_contact_primary ON crm_contact(customer_id, is_primary)',
  'SELECT 1');
PREPARE add_idx_stmt FROM @add_idx_sql;
EXECUTE add_idx_stmt;
DEALLOCATE PREPARE add_idx_stmt;

-- 4. 迁移历史数据：将 crm_customer 的联系人生成到 crm_contact
--    只迁移未删除客户、且联系人姓名不为空的记录，默认标记为决策人和主联系人
-- [幂等] 使用 NOT EXISTS 防止重复执行时产生重复联系人
INSERT INTO crm_contact (customer_id, name, phone, email, is_decision, is_primary, create_time, update_time)
SELECT
  c.id,
  NULLIF(TRIM(c.contact_name), ''),
  NULLIF(TRIM(c.phone), ''),
  NULLIF(TRIM(c.email), ''),
  1,
  1,
  c.create_time,
  c.update_time
FROM crm_customer c
WHERE c.deleted_at IS NULL
  AND (c.contact_name IS NOT NULL AND TRIM(c.contact_name) != '')
  AND NOT EXISTS (
    SELECT 1 FROM crm_contact existing
    WHERE existing.customer_id = c.id
      AND existing.name = NULLIF(TRIM(c.contact_name), '')
      AND existing.deleted_at IS NULL
  )
ORDER BY c.id;

-- 5. 为已有联系人（本次迁移前存在的）补充主联系人标记：每个客户最多一个主联系人
--    优先保留 is_decision=1 的，否则取 id 最小的一个
UPDATE crm_contact c1
JOIN (
  SELECT MIN(id) AS id
  FROM crm_contact
  WHERE deleted_at IS NULL
  GROUP BY customer_id
  HAVING SUM(is_primary) = 0
) c2 ON c1.id = c2.id
SET c1.is_primary = 1;

-- ====== Migration 072: 072_prompt3_scoring_rule.sql ======
-- 072_prompt3_scoring_rule.sql
-- Prompt 3: 修复供应商评分任务因 crm_scoring_rule 表缺失报错的问题

CREATE TABLE IF NOT EXISTS crm_scoring_rule (
  id INT PRIMARY KEY AUTO_INCREMENT,
  category VARCHAR(20) NOT NULL COMMENT '评分维度：quality质量/delivery交期/service服务/price价格',
  rule_name VARCHAR(100) NOT NULL COMMENT '规则名称',
  min_score DECIMAL(3,1) NOT NULL DEFAULT 1.0 COMMENT '最低分',
  max_score DECIMAL(3,1) NOT NULL DEFAULT 5.0 COMMENT '最高分',
  weight DECIMAL(4,2) NOT NULL DEFAULT 1.00 COMMENT '权重',
  is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
  sort_order INT DEFAULT 0 COMMENT '排序',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_scoring_category (category),
  KEY idx_scoring_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商评分规则表';

-- 预置默认规则，避免空表导致评分无结果
INSERT IGNORE INTO crm_scoring_rule (category, rule_name, min_score, max_score, weight, sort_order) VALUES
('quality', '合格率 ≥ 98%', 4.5, 5.0, 0.30, 1),
('quality', '合格率 90%-98%', 3.5, 4.5, 0.30, 2),
('quality', '合格率 < 90%', 1.0, 3.0, 0.30, 3),
('delivery', '准时率 ≥ 95%', 4.5, 5.0, 0.25, 4),
('delivery', '准时率 80%-95%', 3.0, 4.5, 0.25, 5),
('delivery', '准时率 < 80%', 1.0, 3.0, 0.25, 6),
('service', '服务评分', 3.0, 5.0, 0.25, 7),
('price', '价格竞争力', 2.0, 5.0, 0.20, 8);

-- ====== Migration 073: 073_unify_pool_owner_id.sql ======
-- ============================================================
-- 迁移 073: 统一公海池语义
-- 说明:
--   以 owner_id IS NULL 作为公海/待分配唯一标准
--   pool_status 降级为只读缓存标记
-- ============================================================

-- 1. 修复 owner_id=0 的脏数据，统一视为 NULL
UPDATE crm_customer
SET owner_id = NULL
WHERE owner_id = 0 AND deleted_at IS NULL;

-- 2. 修复 owner_id 不为空但 pool_status=1 的不一致数据
UPDATE crm_customer
SET pool_status = 0
WHERE owner_id IS NOT NULL AND pool_status = 1 AND deleted_at IS NULL;

-- 3. 修复 owner_id 为空但 pool_status=0 的不一致数据
UPDATE crm_customer
SET pool_status = 1
WHERE owner_id IS NULL AND pool_status = 0 AND deleted_at IS NULL;

-- ====== Migration 074: 074_add_original_lead_id.sql ======
-- ============================================================
-- 迁移 074: 线索整合到客户 - 新增 original_lead_id + 潜客标记
-- 说明:
--   Prompt 4-1 废弃独立线索入口；线索已是 crm_customer 中的 prospect 记录
--   customer_type 由 037 迁移标记（prospect/customer），此处仅新增溯源字段并兜底标记
-- ============================================================

-- 1. 新增 original_lead_id 字段（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'original_lead_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN original_lead_id INT DEFAULT NULL COMMENT \'原始线索ID，用于线索转客户溯源\' AFTER lifecycle_status',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 索引（幂等）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_original_lead_id');
SET @sql2 = IF(@idx_exists = 0, 'CREATE INDEX idx_original_lead_id ON crm_customer(original_lead_id)', 'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 3. 兜底标记：未被分配(following)且 customer_type 为空的记录视为潜客（线索）
--    037 迁移已为绝大多数客户标记 customer_type，此处仅补漏
UPDATE crm_customer
SET customer_type = 'prospect',
    lifecycle_status = CASE WHEN lifecycle_status IS NULL OR lifecycle_status = '' THEN 'lead' ELSE lifecycle_status END
WHERE deleted_at IS NULL
  AND status = 'following'
  AND owner_id IS NULL
  AND (customer_type IS NULL OR customer_type = '' OR customer_type = 'prospect');

-- ====== Migration 075: 075_map_leads_to_customer_permission.sql ======
-- ============================================================
-- 迁移: 线索(leads)权限映射到客户(customer)权限
-- 日期: 2026-07-14
-- 说明: Prompt 4-1 将线索模块统一为客户潜客(prospect)后，原 leads 菜单及
--       API 权限需等价映射到 customer 对应权限，确保原线索使用者在新统一
--       客户模块下仍能访问潜客功能，并将 leads 权限标记为废弃(不可见)。
-- 幂等: 所有角色权限授予均带 NOT EXISTS 判定；可见性标记可重复执行。
-- ============================================================

-- 1. 凡拥有 leads 菜单权限的角色，确保拥有 customer:list 菜单权限
--    统一后潜客页挂在客户列表下，原线索使用者需能进入客户列表
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'leads'
JOIN sys_permission p_dst ON p_dst.code = 'customer:list'
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);

-- 2. API 权限映射
--    2a. api:leads:claim  -> api:customer:claim (客户池认领接口)
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'api:leads:claim'
JOIN sys_permission p_dst ON p_dst.code = 'api:customer:claim'
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);

--    2b. api:leads:convert  -> customer:edit
--        (convert-to-customer 路由使用 checkPermission('customer:edit'))
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'api:leads:convert'
JOIN sys_permission p_dst ON p_dst.code = 'customer:edit'
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);

--    2c. api:leads:mark-lost  -> customer:edit
--        (潜客标记丢失复用 customer:edit 权限)
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'api:leads:mark-lost'
JOIN sys_permission p_dst ON p_dst.code = 'customer:edit'
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);

-- 3. 标记 leads 及关联 API 权限为废弃(不可见)，前端菜单/权限检查不再展示
UPDATE sys_permission
SET is_visible = 0
WHERE code IN ('leads', 'api:leads:convert', 'api:leads:claim', 'api:leads:mark-lost');

SELECT 'leads 权限已映射到 customer 权限并标记废弃' AS result;

-- ====== Migration 076: 076_follow_up_merge_fields.sql ======
-- ============================================================
-- 迁移 076: 跟进记录与跟进计划合并 - crm_follow_up 新增合并字段
-- 日期: 2026-07-14
-- 说明: Prompt 4-2 将 crm_follow_plan 合并进 crm_follow_up（通过 is_plan 区分）。
--       本迁移为 crm_follow_up 增加：is_plan（是否计划）、finish_time（完成时间）、
--       plan_status（计划状态）、source_plan_id（溯源：原 follow_plan.id）。
--       所有字段新增均幂等（information_schema 判定）。
-- ============================================================

-- 1. is_plan: 0=实际跟进, 1=跟进计划
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'is_plan');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_follow_up ADD COLUMN is_plan TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否跟进计划: 0=实际跟进, 1=跟进计划'",
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. finish_time: 计划完成时间
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'finish_time');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_follow_up ADD COLUMN finish_time DATETIME DEFAULT NULL COMMENT \'计划完成时间（completePlan 时填充）\'',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. plan_status: 计划状态（pending/completed/overdue/cancelled）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'plan_status');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_follow_up ADD COLUMN plan_status VARCHAR(20) DEFAULT NULL COMMENT '计划状态: pending/completed/overdue/cancelled'",
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. source_plan_id: 溯源（原 crm_follow_plan.id）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'source_plan_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_follow_up ADD COLUMN source_plan_id INT DEFAULT NULL COMMENT \'溯源: 原 crm_follow_plan.id\'',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. 索引（幂等）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND INDEX_NAME = 'idx_follow_is_plan');
SET @sql2 = IF(@idx_exists = 0, 'CREATE INDEX idx_follow_is_plan ON crm_follow_up(is_plan)', 'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND INDEX_NAME = 'idx_follow_next_time');
SET @sql2 = IF(@idx_exists = 0, 'CREATE INDEX idx_follow_next_time ON crm_follow_up(next_time)', 'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND INDEX_NAME = 'idx_follow_source_plan');
SET @sql2 = IF(@idx_exists = 0, 'CREATE INDEX idx_follow_source_plan ON crm_follow_up(source_plan_id)', 'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SELECT 'crm_follow_up 合并字段已就绪' AS result;

-- ====== Migration 077: 077_migrate_follow_plan_data.sql ======
-- ============================================================
-- 迁移 077: 跟进计划数据迁移至跟进记录表
-- 日期: 2026-07-14
-- 说明: Prompt 4-2 将 crm_follow_plan 合并进 crm_follow_up（is_plan=1）。
--   字段映射: plan_time->next_time, plan_content->content, follow_type->follow_type,
--             status->plan_status, create_by/create_time 原样保留。
--   幂等: 仅迁移尚未迁移的计划（按 source_plan_id 去重）。
--   迁移后把 crm_follow_up_reminder.follow_plan_id 重新指向新的 follow_up 记录。
-- ============================================================

-- 1. 迁移数据（is_plan=1）
INSERT INTO crm_follow_up
  (customer_id, contact_id, follow_type, content, next_time, next_content, create_by, create_time, deleted_at, is_plan, finish_time, plan_status, source_plan_id)
SELECT
  fp.customer_id,
  fp.contact_id,
  fp.follow_type,
  fp.plan_content,
  fp.plan_time,
  NULL,
  fp.create_by,
  fp.create_time,
  fp.deleted_at,
  1 AS is_plan,
  CASE WHEN fp.status = 'completed' THEN fp.create_time ELSE NULL END AS finish_time,
  fp.status AS plan_status,
  fp.id AS source_plan_id
FROM crm_follow_plan fp
WHERE fp.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM crm_follow_up fu WHERE fu.source_plan_id = fp.id
  );

-- 2. 重新指向提醒记录的 follow_plan_id -> 新 follow_up.id
UPDATE crm_follow_up_reminder r
JOIN crm_follow_up fu ON fu.source_plan_id = r.follow_plan_id
SET r.follow_plan_id = fu.id
WHERE r.follow_plan_id IS NOT NULL AND r.follow_plan_id > 0;

SELECT 'crm_follow_plan 数据已迁移至 crm_follow_up' AS result;

-- ====== Migration 078: 078_supplier_rating_unique_index.sql ======
-- 078: 供应商评分唯一索引（Prompt 4-5-1）
-- 确保 crm_supplier_rating 表 (supplier_id, rating_period) 唯一，防止重复评分

-- 添加唯一索引（幂等）
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_supplier_rating'
    AND INDEX_NAME = 'uq_supplier_rating_period'
);
SET @sql = IF(@idx_exists = 0,
  'CREATE UNIQUE INDEX uq_supplier_rating_period ON crm_supplier_rating(supplier_id, rating_period)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ====== Migration 079: 079_contract_quote_id.sql ======
-- Prompt 4-3-1: 新增 crm_contract.quote_id 字段（幂等）
-- 合同关联合同来源报价单，形成 商机→报价→合同 完整链路

-- 1. 添加 quote_id 列（幂等）
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_contract'
    AND COLUMN_NAME = 'quote_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_contract ADD COLUMN quote_id INT DEFAULT NULL COMMENT ''关联合同来源报价单ID''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 添加索引 idx_contract_quote_id（幂等）
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_contract'
    AND INDEX_NAME = 'idx_contract_quote_id'
);
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_contract_quote_id ON crm_contract(quote_id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ====== Migration 080: 080_backfill_opportunity_links.sql ======
-- Prompt 4-3-8: 历史数据补齐
-- 为无商机关联的报价单/合同生成占位商机并回填 opportunity_id
-- 幂等：仅处理 opportunity_id IS NULL 的记录

-- 1. 为无商机关联的报价单生成占位商机
INSERT INTO crm_opportunity (customer_id, name, expected_amount, stage, win_rate, remark, owner_id, create_time)
SELECT
  q.customer_id,
  CONCAT('报价单 ', q.quote_no, ' 关联商机'),
  COALESCE(q.final_amount, q.amount, 0),
  3,  -- stage 3 = 方案报价
  50,
  '系统自动补齐（来自报价单）',
  q.create_by,
  q.create_time
FROM crm_quote q
WHERE q.opportunity_id IS NULL
  AND q.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM crm_opportunity o
    WHERE o.customer_id = q.customer_id
      AND o.name = CONCAT('报价单 ', q.quote_no, ' 关联商机')
  );

-- 2. 回填报价单的 opportunity_id
UPDATE crm_quote q
JOIN crm_opportunity o
  ON o.customer_id = q.customer_id
  AND o.name = CONCAT('报价单 ', q.quote_no, ' 关联商机')
SET q.opportunity_id = o.id
WHERE q.opportunity_id IS NULL
  AND q.deleted_at IS NULL;

-- 3. 为无商机关联的合同生成占位商机
INSERT INTO crm_opportunity (customer_id, name, expected_amount, stage, win_rate, remark, owner_id, create_time)
SELECT
  c.customer_id,
  CONCAT('合同 ', c.contract_no, ' 关联商机'),
  COALESCE(c.amount, 0),
  5,  -- stage 5 = 成交
  100,
  '系统自动补齐（来自合同）',
  c.create_by,
  c.create_time
FROM crm_contract c
WHERE c.opportunity_id IS NULL
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM crm_opportunity o
    WHERE o.customer_id = c.customer_id
      AND o.name = CONCAT('合同 ', c.contract_no, ' 关联商机')
  );

-- 4. 回填合同的 opportunity_id
UPDATE crm_contract c
JOIN crm_opportunity o
  ON o.customer_id = c.customer_id
  AND o.name = CONCAT('合同 ', c.contract_no, ' 关联商机')
SET c.opportunity_id = o.id
WHERE c.opportunity_id IS NULL
  AND c.deleted_at IS NULL;

-- 5. 回填合同的 quote_id（同客户同时间的报价单→合同关联）
UPDATE crm_contract c
JOIN crm_quote q
  ON q.customer_id = c.customer_id
  AND q.opportunity_id = c.opportunity_id
SET c.quote_id = q.id
WHERE c.quote_id IS NULL
  AND c.opportunity_id IS NOT NULL
  AND q.deleted_at IS NULL
  AND c.deleted_at IS NULL;

-- ====== Migration 081: 081_prompt3_followup_recycle_config.sql ======
-- 071_prompt3_followup_recycle_config.sql
-- Prompt 3: 跟进驱动客户状态与自动回收配置

-- 1. 新增系统配置项
INSERT IGNORE INTO sys_config (config_key, config_value, description) VALUES
('followup_reminder_enabled', '1', '是否启用跟进提醒生成（1启用/0关闭）'),
('near_recycle_days', '7', 'following 状态客户未跟进进入即将回收预警的天数阈值'),
('recycle_days', '15', 'following 状态客户未跟进自动释放到公海的天数阈值');

-- 2. 确保 last_follow_time 索引存在（幂等）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_customer_last_follow');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_customer_last_follow ON crm_customer(last_follow_time)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 扩展跟进提醒表 reminder_type 枚举支持（MySQL 8.0 以下建议直接修改 ENUM，这里用 ALTER 幂等）
SET @col_type = (SELECT DATA_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up_reminder' AND COLUMN_NAME = 'reminder_type');
SET @sql = IF(@col_type = 'enum',
  'ALTER TABLE crm_follow_up_reminder MODIFY COLUMN reminder_type ENUM(\'overdue\',\'today\',\'upcoming\',\'near_recycle\',\'pre_release\') DEFAULT \'overdue\' COMMENT \'提醒类型: overdue=逾期未跟进, today=今日待跟进, upcoming=明日待跟进, near_recycle=即将回收, pre_release=释放前通知\'',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ====== Migration 082: 082_cleanup_test_users.sql ======
-- 082: 清理测试账号 (验收测试 DB-003)
-- 删除测试用途的用户账号
-- [安全] 通过数据库名判断环境：仅在名称包含 _test 或 _dev 时执行删除
-- [幂等] 使用 PREPARE 动态 SQL + 条件检查

-- 根据数据库名判断是否为测试环境（含 _test 或 _dev 后缀即为测试库）
SET @is_test_env = IF(DATABASE() LIKE '%\_test' OR DATABASE() LIKE '%\_dev', 1, 0);

-- 仅在非生产环境执行删除（需手动设置 @@global.ENVIRONMENT='test' 才会删除）
-- 生产环境仅输出待清理的账号列表（SELECT），不执行 DELETE
SET @test_count = (SELECT COUNT(*) FROM sys_user WHERE username LIKE '%test%' OR username LIKE '%demo%');

-- 展示待清理数据
SELECT CONCAT('待清理测试账号数量: ', @test_count) AS info;

-- 安全删除：仅当数据库名含 _test/_dev 且存在匹配行时才执行
SET @sql = IF(@is_test_env = 1 AND @test_count > 0,
  'DELETE FROM sys_user WHERE username LIKE ''%test%'' OR username LIKE ''%demo%''',
  'SELECT ''跳过：非测试数据库或无匹配账号'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ====== Migration 083: 083_add_customer_list_permission.sql ======
-- 083: 创建 customer:list 权限并分配给 boss/manager/sales 角色
-- 修复销售角色无法访问客户列表的 Bug (RBAC-002)

-- 1. 创建 customer:list 权限（幂等）
INSERT IGNORE INTO sys_permission (code, name, type, parent_id, sort, is_visible, create_time, update_time)
VALUES ('customer:list', '客户列表查看', 'button', 0, 0, 1, NOW(), NOW());

-- 2. 将 customer:list 分配给 boss、manager、sales 角色（幂等）
SET @perm_id = (SELECT id FROM sys_permission WHERE code = 'customer:list');

INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, @perm_id FROM sys_role r
WHERE r.code IN ('boss', 'manager', 'sales');

-- ====== Migration 084: 084_seed_approval_workflows.sql ======
-- 084: 种子审批流程数据
-- 为 quote/purchase 业务类型创建默认审批流程

-- 创建报价审批流程（幂等）
INSERT IGNORE INTO crm_approval_workflow (id, name, type, description, status, create_by, create_time, update_time)
VALUES (1, '报价审批流程', 'quote', '报价单默认审批流程-部门经理审批', 1, 1, NOW(), NOW());

-- 创建采购审批流程
INSERT IGNORE INTO crm_approval_workflow (id, name, type, description, status, create_by, create_time, update_time)
VALUES (2, '采购审批流程', 'purchase', '采购单默认审批流程-部门经理审批', 1, 1, NOW(), NOW());

-- 创建报价审批步骤 (step 1: 部门经理审批)
INSERT IGNORE INTO crm_approval_step (id, workflow_id, step_order, step_name, approver_type, approver_id, is_required, create_time)
VALUES (1, 1, 1, '部门经理审批', 'manager', NULL, 1, NOW());

-- 创建采购审批步骤
INSERT IGNORE INTO crm_approval_step (id, workflow_id, step_order, step_name, approver_type, approver_id, is_required, create_time)
VALUES (2, 2, 1, '部门经理审批', 'manager', NULL, 1, NOW());

-- ====== Migration 085: 085_assign_purchaser_permissions.sql ======
-- 085: 为采购专员角色分配缺失的权限
-- 修复 purchaser 角色无任何权限导致无法操作采购/供应商/产品模块

-- 为 purchaser 角色分配供应商查看权限
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'purchaser' AND p.code = 'supplier';

-- 为 purchaser 角色分配产品查看权限
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'purchaser' AND p.code = 'product:view';

-- 分配采购相关权限（如果存在）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'purchaser' AND p.code = 'purchase:add';

INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'purchaser' AND p.code = 'purchase:view';

INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'purchaser' AND p.code = 'purchase:edit';

-- 分配客户查看权限（采购需查看客户基本信息）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'purchaser' AND p.code IN ('customer:view', 'customer:list');

-- ====== Migration 086: 086_fix_sales_permissions.sql ======
-- 086: 为所有非管理员角色补充缺失的权限
-- 问题: 销售/purchaser/hr/finance/engineer 角色登录后 Dashboard 大量 403
-- 根因:
--   1. customer:view 权限码在 sys_permission 中不存在（被多处路由引用但从未创建）
--   2. 除 boss(id=1) / manager(id=2) 外，其他角色几乎没有权限分配
--   3. layout/HeaderBar/AiChat 等公共组件调用的 reminder/ai/tag 权限未分配给非管理员
-- 修复日期: 2026-07-21
--
-- 生产环境角色数据（role code）:
--   boss(1), manager(2), sales(3), hr(4), purchaser(5), finance(6), engineer(11)

-- ============================================================
-- 第一步: 补充缺失的权限码
-- ============================================================

-- 1a. customer:view - 查看客户详情/逾期/临期回收
--     被 /customer/overdue, /customer/near-recycle, /customer/contact/list 等引用
--     从未在 sys_permission 中创建，导致非管理员永远无法通过权限检查
INSERT IGNORE INTO sys_permission (code, name, type, parent_id, path, sort, is_visible, create_time, update_time)
SELECT 'customer:view', '查看客户', 'button',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'customer') AS p), NULL, 7, 1, NOW(), NOW()
FROM dual
WHERE EXISTS (SELECT 1 FROM sys_permission WHERE code = 'customer');

-- 注意: purchase:view / product:view 也被 migration 085 引用但从未创建，
--       但这两个权限码没有任何路由使用，故不在此创建。migration 085 的
--       INSERT IGNORE 会静默跳过不存在的权限码。

-- 1b. competitor:view / competitor:add / competitor:edit / competitor:delete
--     被 competitor.js 7个路由引用，但从未在 sys_permission 中创建
INSERT IGNORE INTO sys_permission (code, name, type, parent_id, sort, is_visible, create_time, update_time)
SELECT code, name, 'button',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'competitor') AS c),
       sort, 1, NOW(), NOW()
FROM (
  SELECT 'competitor:view' AS code, '查看竞争对手' AS name, 1 AS sort
  UNION ALL SELECT 'competitor:add', '新增竞争对手', 2
  UNION ALL SELECT 'competitor:edit', '编辑竞争对手', 3
  UNION ALL SELECT 'competitor:delete', '删除竞争对手', 4
) t
WHERE EXISTS (SELECT 1 FROM sys_permission WHERE code = 'competitor');

-- 1c. user:create - 注册新用户（被 /auth/register 引用）
INSERT IGNORE INTO sys_permission (code, name, type, parent_id, sort, is_visible, create_time, update_time)
SELECT 'user:create', '创建用户', 'button',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'system:user') AS u),
       5, 1, NOW(), NOW()
FROM dual
WHERE EXISTS (SELECT 1 FROM sys_permission WHERE code = 'system:user');

-- ============================================================
-- 第二步: 公共权限 — 所有登录用户都需要（layout/HeaderBar/AiChat/NotificationBadge）
-- ============================================================

-- 目标角色: sales, hr, purchaser, finance, engineer（boss/manager 已有或绕过）
SET @common_roles = 'sales,hr,purchaser,finance,engineer';

-- 2a. dashboard — 首页
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE FIND_IN_SET(r.code, @common_roles) AND p.code = 'dashboard';

-- 2b. reminder — 提醒/通知中心（HeaderBar 通知角标）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE FIND_IN_SET(r.code, @common_roles) AND p.code = 'reminder';

-- 2c. ai — AI 助手（AiChat 浮动组件）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE FIND_IN_SET(r.code, @common_roles) AND p.code = 'ai';

-- 2d. tag — 客户标签（CustomerFilter 筛选条件）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE FIND_IN_SET(r.code, @common_roles) AND p.code = 'tag';

-- ============================================================
-- 第三步: sales 角色 — SalesDashboard + 客户/商机/合同等
-- ============================================================

-- 3a. 客户管理
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN (
  'customer', 'customer:list', 'customer:view', 'customer:add', 'customer:edit',
  'customer:pool', 'customer:import', 'customer:export'
);

-- 3b. 线索管理
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'leads';

-- 3c. 商机管理
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN (
  'opportunity', 'opportunity:add', 'opportunity:edit'
);

-- 3d. 报价管理
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN (
  'quotation', 'quotation:add', 'quotation:edit'
);

-- 3e. 合同管理
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN (
  'contract', 'contract:add', 'contract:edit'
);

-- 3f. 产品/供应商（查看）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('product', 'supplier');

-- 3g. 售后服务
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('service', 'service:add', 'service:edit');

-- 3h. 跟进日历
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'followup:calendar';

-- 3i. 数据报表
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'report';

-- 3j. 日程管理
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'calendar';

-- 3k. 知识库
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'knowledge';

-- 3l. 全局搜索
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'search';

-- 3m. 客户评分
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'scoring';

-- 3n. 销售目标
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'target';

-- 3o. 邮件
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('email', 'email:send');

-- 3p. 审批
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'approval';

-- 3q. 发票
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('invoice', 'invoice:add', 'invoice:edit');

-- 3r. 竞争对手（查看）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('competitor', 'competitor:view');

-- 3s. 模板（查看）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('followup_template', 'contract_template');

-- ============================================================
-- 第四步: purchaser/hr/finance/engineer — PurchaseDashboard 公共部分
-- ============================================================

SET @purchase_dashboard_roles = 'purchaser,hr,finance,engineer';

-- 4a. purchase — 采购列表（PurchaseDashboard 核心调用 POST /purchase/list）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE FIND_IN_SET(r.code, @purchase_dashboard_roles) AND p.code = 'purchase';

-- 4b. supplier — 供应商查看
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE FIND_IN_SET(r.code, @purchase_dashboard_roles) AND p.code = 'supplier';

-- 4c. product — 产品查看
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE FIND_IN_SET(r.code, @purchase_dashboard_roles) AND p.code = 'product';

-- 4d. service — 售后查看
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE FIND_IN_SET(r.code, @purchase_dashboard_roles) AND p.code = 'service';

-- 4e. report — 报表查看
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE FIND_IN_SET(r.code, @purchase_dashboard_roles) AND p.code = 'report';

-- ============================================================
-- 第五步: purchaser 角色专项权限
-- ============================================================

-- purchaser 已有 migration 085 分配的部分权限（supplier, purchase:add, customer:view, customer:list）
-- 这里补全采购编辑和供应商编辑
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'purchaser' AND p.code IN (
  'purchase:add', 'purchase:edit',
  'supplier:add', 'supplier:edit',
  'calendar'
);

-- ============================================================
-- 第六步: hr 角色专项权限
-- ============================================================

INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'hr' AND p.code IN ('hr', 'calendar');

-- ============================================================
-- 第七步: finance 角色专项权限
-- ============================================================

-- finance 已有 migration 029 分配的基础权限，这里补全
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'finance' AND p.code IN (
  'finance', 'invoice', 'invoice:add', 'invoice:edit', 'invoice:export',
  'calendar', 'report'
);

-- ============================================================
-- 第八步: engineer 角色专项权限
-- ============================================================

INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'engineer' AND p.code IN ('calendar', 'service:add', 'service:edit');

-- ============================================================
-- 第九步: 确保 manager 角色拥有新增的权限码
-- ============================================================

-- manager(id=2) 通过种子数据和 migration 062 已有大部分权限，
-- 但 migration 062 使用硬编码 role_id=2，这里用 role code 确保覆盖
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'manager' AND p.code IN (
  'customer:view', 'reminder', 'ai', 'tag', 'team', 'calendar', 'search', 'scoring'
);

-- ============================================================
-- 第十步: 验证结果
-- ============================================================

SELECT r.code AS '角色', COUNT(rp.permission_id) AS '权限数量'
FROM sys_role r
LEFT JOIN sys_role_permission rp ON r.id = rp.role_id
GROUP BY r.id, r.code
ORDER BY r.id;

SELECT r.code AS '角色', p.code AS '拥有的权限'
FROM sys_role_permission rp
JOIN sys_role r ON rp.role_id = r.id
JOIN sys_permission p ON rp.permission_id = p.id
ORDER BY r.code, p.code;

-- ====== Migration 087: 087_cleanup_test_customers_and_fix_encoding.sql ======
-- 087: 清理测试客户数据 + 修复 position 字段编码
-- 问题:
--   1. 删除测试用户后，测试客户因 FK ON DELETE SET NULL 导致 owner_id=NULL 但记录未删除
--   2. crm_employee_profile.position 可能因导入备份时编码问题导致乱码
-- 修复日期: 2026-07-21

-- ============================================================
-- 第一部分: 清理测试客户
-- ============================================================

-- 测试客户来源: database/seeds/test_data_modules.sql
-- 特征: 公司名包含 "王销售客户-" / "李销售客户-" / "赵销售客户-" / "陈销售客户-"
--       以及硬编码的 20 个测试公司名
-- 注意: 使用软删除 (deleted_at) 而非硬删除，以便需要时恢复。
-- status 字段已迁移为 VARCHAR(32) 字符串状态机，不再使用数值 0 表示删除。

-- 1a. 批量生成的测试客户（公司名含销售客户编号）
UPDATE crm_customer
SET deleted_at = NOW()
WHERE (company_name LIKE '王销售客户-%号公司'
   OR company_name LIKE '李销售客户-%号公司'
   OR company_name LIKE '赵销售客户-%号公司'
   OR company_name LIKE '陈销售客户-%号公司');

-- 1b. 硬编码的测试客户
UPDATE crm_customer
SET deleted_at = NOW()
WHERE company_name IN (
  '深圳华科科技有限公司',
  '广州明源电子有限公司',
  '珠海航宇通讯技术公司',
  '佛山顺德电器制造厂',
  '中山市灯饰有限公司',
  '东莞五金精密加工厂',
  '惠州TCL配套供应商',
  '汕头市澄海玩具厂',
  '肇庆市新材料科技公司',
  '江门市摩托车配件厂',
  '北京中关村软件科技公司',
  '上海浦东集成电路设计公司',
  '杭州西湖区互联网公司',
  '成都高新区游戏公司',
  '重庆市渝中区金融科技公司',
  '南京雨花台区大数据公司',
  '武汉光谷通信技术公司',
  '西安高新区半导体公司',
  '厦门市思明区软件外包公司',
  '福州市马尾区电子制造厂',
  '泉州市石狮服装制造厂'
);

-- 1c. 清理测试跟进记录（测试客户的跟进记录）
DELETE FROM crm_follow_up
WHERE customer_id IN (
  SELECT id FROM crm_customer WHERE deleted_at IS NOT NULL
);

-- 1d. 清理测试商机
DELETE FROM crm_opportunity
WHERE customer_id IN (
  SELECT id FROM crm_customer WHERE deleted_at IS NOT NULL
);

-- 1e. 清理测试分配日志
DELETE FROM crm_assign_log
WHERE customer_id IN (
  SELECT id FROM crm_customer WHERE deleted_at IS NOT NULL
);

-- 1f. 清理测试提醒
DELETE FROM crm_follow_up_reminder
WHERE customer_id IN (
  SELECT id FROM crm_customer WHERE deleted_at IS NOT NULL
);

-- ============================================================
-- 第二部分: 职位字段编码修复
-- ============================================================

-- 先执行诊断查询，查看当前 position 数据情况
-- (此行在 MySQL 中会输出诊断信息，但不影响后续 UPDATE)
SELECT '=== 诊断: 当前 position 字段数据 ===' AS step;
SELECT id, user_id, position, HEX(position) AS position_hex
FROM crm_employee_profile
WHERE position IS NOT NULL AND position != '';

-- 修复方法: 如果中文字段是通过 latin1 连接写入 utf8mb4 列的（双重编码），
-- 可用 CONVERT(BINARY CONVERT(col USING latin1) USING utf8mb4) 还原。
-- 此操作对已正确编码的数据会损坏，故先检查 position 的十六进制值。
--
-- 判断标准: 如果您在 position 中看到的乱码类似 "èæ¯" / "Ã©" / "ç" 等
-- 拉丁字符，说明字段确实是双重编码，请取消下面注释并执行修复:

-- UPDATE crm_employee_profile
-- SET position = CONVERT(BINARY CONVERT(position USING latin1) USING utf8mb4)
-- WHERE position IS NOT NULL AND position != '';

-- 如果 position 乱码是另一种形式（如全角问号、方框），可能是原始数据已损坏，
-- 需要从备份重新导入该字段。请联系管理员检查导入脚本的字符集设置。

-- ============================================================
-- 第三部分: 验证结果
-- ============================================================

SELECT '=== 清理结果 ===' AS step;

SELECT '剩余客户总数' AS metric, COUNT(*) AS value FROM crm_customer WHERE deleted_at IS NULL
UNION ALL
SELECT '已软删除客户', COUNT(*) FROM crm_customer WHERE deleted_at IS NOT NULL
UNION ALL
SELECT 'owner_id为NULL的客户', COUNT(*) FROM crm_customer WHERE owner_id IS NULL AND deleted_at IS NULL
UNION ALL
SELECT '剩余跟进记录', COUNT(*) FROM crm_follow_up
UNION ALL
SELECT '剩余商机', COUNT(*) FROM crm_opportunity
UNION ALL
SELECT '剩余提醒', COUNT(*) FROM crm_follow_up_reminder
UNION ALL
SELECT '剩余分配日志', COUNT(*) FROM crm_assign_log;

-- ====== Migration 088: 088_add_lead_pool.sql ======
-- 088: 新增线索池 (Lead Pool)
-- 将"线索"从公海中独立出来，两者职责不同：
--   lead (线索池): 新导入/录入、从未被人跟进过的潜在客户，所有人可见，认领无保护期
--   sea  (公海):   被放弃回收的客户，认领有 7 天保护期
-- 修复日期: 2026-07-21

-- 1. 在状态配置表中加入 lead
INSERT IGNORE INTO sys_customer_status (code, name, sort_order, is_default, is_end, color)
VALUES ('lead', '线索', 0, 0, 0, '#909399');

-- 2. 添加状态流转规则: lead → following (线索被认领)
INSERT IGNORE INTO sys_customer_status_transition (from_code, to_code, require_permission, require_reason)
VALUES ('lead', 'following', 0, 0);

-- 3. 添加流转规则: lead → sea (线索直接释放到公海，跳过跟进)
INSERT IGNORE INTO sys_customer_status_transition (from_code, to_code, require_permission, require_reason)
VALUES ('lead', 'sea', 0, 0);

-- 4. 现有未分配客户(sea + owner_id IS NULL) 归入线索池
--    保留真正在公海的客户（有保护期的、有释放记录的）
UPDATE crm_customer
SET status = 'lead',
    customer_type = 'prospect',
    lifecycle_status = 'new',
    pool_status = 0
WHERE status = 'sea'
  AND owner_id IS NULL
  AND protect_until IS NULL
  AND pool_status = 1;

-- 5. 验证
SELECT '=== 线索池迁移结果 ===' AS step;
SELECT status, COUNT(*) AS count FROM crm_customer GROUP BY status ORDER BY status;

-- ====== Migration 089: 089_add_must_change_password.sql ======
-- ============================================================
-- 添加用户首次登录强制改密标记
-- ============================================================

SET @db_name = DATABASE();

-- Step 1: 添加 must_change_password 字段
SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'must_change_password'
    ),
    'SELECT 1',
    'ALTER TABLE sys_user ADD COLUMN must_change_password TINYINT NOT NULL DEFAULT 0 COMMENT "首次登录/重置密码后必须改密(1是0否)"'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: 添加 password_changed_at 字段，记录最近一次改密时间
SET @sql2 = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'password_changed_at'
    ),
    'SELECT 1',
    'ALTER TABLE sys_user ADD COLUMN password_changed_at DATETIME DEFAULT NULL COMMENT "密码最后修改时间"'
  )
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- Step 3: 为已有账号设置 password_changed_at 为当前时间（避免历史账号被误判为首次登录）
UPDATE sys_user SET password_changed_at = NOW() WHERE password_changed_at IS NULL;

-- ====== Migration 090: 090_add_soft_delete_to_purchase_tables.sql ======
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

-- ====== Migration 091: 091_fix_hard_cascade_to_set_null.sql ======
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
  'ALTER TABLE crm_assign_log ADD CONSTRAINT fk_assign_log_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
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
  'ALTER TABLE crm_follow_up_reminder ADD CONSTRAINT fk_reminder_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @add_sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. crm_customer_tag: CASCADE → SET NULL (migration 035)
SET @constraint_exists3 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer_tag'
  AND CONSTRAINT_NAME LIKE '%customer_id%' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  AND DELETE_RULE = 'CASCADE');
SET @drop_sql3 = IF(@constraint_exists3 > 0,
  (SELECT CONCAT('ALTER TABLE crm_customer_tag DROP FOREIGN KEY ', CONSTRAINT_NAME)
   FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer_tag'
   AND DELETE_RULE = 'CASCADE' LIMIT 1),
  'SELECT 1');
PREPARE stmt FROM @drop_sql3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @add_sql3 = IF(@constraint_exists3 > 0,
  'ALTER TABLE crm_customer_tag ADD CONSTRAINT fk_customer_tag_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @add_sql3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. crm_customer_score_log: CASCADE → SET NULL (migration 042)
SET @constraint_exists4 = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer_score_log'
  AND CONSTRAINT_NAME LIKE '%customer_id%' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  AND DELETE_RULE = 'CASCADE');
SET @drop_sql4 = IF(@constraint_exists4 > 0,
  (SELECT CONCAT('ALTER TABLE crm_customer_score_log DROP FOREIGN KEY ', CONSTRAINT_NAME)
   FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer_score_log'
   AND DELETE_RULE = 'CASCADE' LIMIT 1),
  'SELECT 1');
PREPARE stmt FROM @drop_sql4; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @add_sql4 = IF(@constraint_exists4 > 0,
  'ALTER TABLE crm_customer_score_log ADD CONSTRAINT fk_score_log_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @add_sql4; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ====== Migration 092: 092_add_missing_composite_indexes.sql ======
-- ============================================
-- 迁移: 补充缺失的复合索引
-- 编号: 092
-- 说明: 为高频查询路径添加复合索引，减少回表
-- ============================================

SET @db = DATABASE();

-- 1. crm_customer: (owner_id, status, deleted_at) — 列表查询 + 数据权限 + 软删除
SET @idx1 = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_owner_status_deleted');
SET @sql1 = IF(@idx1 = 0,
  'CREATE INDEX idx_owner_status_deleted ON crm_customer(owner_id, status, deleted_at)',
  'SELECT ''idx_owner_status_deleted 已存在'' AS msg');
PREPARE stmt FROM @sql1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. crm_contract: (customer_id, status) — 合同列表 + 客户维度 + 状态筛选
SET @idx2 = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_contract' AND INDEX_NAME = 'idx_contract_cust_status');
SET @sql2 = IF(@idx2 = 0,
  'CREATE INDEX idx_contract_cust_status ON crm_contract(customer_id, status)',
  'SELECT ''idx_contract_cust_status 已存在'' AS msg');
PREPARE stmt FROM @sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. crm_follow_up: (customer_id, deleted_at) — 跟进列表常用
SET @idx3 = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_follow_up' AND INDEX_NAME = 'idx_follow_cust_deleted');
SET @sql3 = IF(@idx3 = 0,
  'CREATE INDEX idx_follow_cust_deleted ON crm_follow_up(customer_id, deleted_at)',
  'SELECT ''idx_follow_cust_deleted 已存在'' AS msg');
PREPARE stmt FROM @sql3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. crm_payment: (contract_id, deleted_at) — 回款查询常用
SET @idx4 = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_payment' AND INDEX_NAME = 'idx_payment_contract_deleted');
SET @sql4 = IF(@idx4 = 0,
  'CREATE INDEX idx_payment_contract_deleted ON crm_payment(contract_id, deleted_at)',
  'SELECT ''idx_payment_contract_deleted 已存在'' AS msg');
PREPARE stmt FROM @sql4; EXECUTE stmt; DEALLOCATE PREPARE stmt;


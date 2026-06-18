-- ============================================================
-- Migration 060: Support table foreign keys
-- Date: 2026-06-18
-- Strategy: ON DELETE SET NULL
-- Idempotent: safe to re-run
-- ============================================================

USE huakey_crm;
SET @db_name = 'huakey_crm';

-- ========== crm_opportunity_stage_log.opportunity_id → crm_opportunity.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_opportunity_stage_log'
  AND CONSTRAINT_NAME = 'fk_stagelog_opp' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_opportunity_stage_log ADD CONSTRAINT fk_stagelog_opp FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE SET NULL',
  'SELECT ''fk_stagelog_opp already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_pool_log.customer_id → crm_customer.id ==========
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
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_payment_reminder'
  AND CONSTRAINT_NAME = 'fk_payremind_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_payment_reminder ADD CONSTRAINT fk_payremind_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT ''fk_payremind_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_sales_target.user_id → sys_user.id ==========
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

-- ============================================================
-- Migration 059: Core business table foreign keys
-- Date: 2026-06-18
-- Strategy: ON DELETE SET NULL (preserve business data)
-- Idempotent: safe to re-run
-- ============================================================

USE huakey_crm;
SET @db_name = 'huakey_crm';

-- ========== crm_customer.owner_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer'
  AND CONSTRAINT_NAME = 'fk_customer_owner' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_customer ADD CONSTRAINT fk_customer_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_customer_owner already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_follow_up.customer_id → crm_customer.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_up'
  AND CONSTRAINT_NAME = 'fk_followup_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_follow_up ADD CONSTRAINT fk_followup_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT ''fk_followup_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_follow_up.create_by → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_up'
  AND CONSTRAINT_NAME = 'fk_followup_create_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_follow_up ADD CONSTRAINT fk_followup_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_followup_create_by already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_follow_plan.customer_id → crm_customer.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_plan'
  AND CONSTRAINT_NAME = 'fk_followplan_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_follow_plan ADD CONSTRAINT fk_followplan_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT ''fk_followplan_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_follow_plan.create_by → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_plan'
  AND CONSTRAINT_NAME = 'fk_followplan_create_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_follow_plan ADD CONSTRAINT fk_followplan_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_followplan_create_by already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_followup_template.create_by → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_followup_template'
  AND CONSTRAINT_NAME = 'fk_followup_tpl_create_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_followup_template ADD CONSTRAINT fk_followup_tpl_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_followup_tpl_create_by already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_opportunity.customer_id → crm_customer.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_opportunity'
  AND CONSTRAINT_NAME = 'fk_opp_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_opportunity ADD CONSTRAINT fk_opp_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT ''fk_opp_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_opportunity.owner_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_opportunity'
  AND CONSTRAINT_NAME = 'fk_opp_owner' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_opportunity ADD CONSTRAINT fk_opp_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_opp_owner already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_contract.customer_id → crm_customer.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_contract'
  AND CONSTRAINT_NAME = 'fk_contract_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_contract ADD CONSTRAINT fk_contract_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT ''fk_contract_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_contract.opportunity_id → crm_opportunity.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_contract'
  AND CONSTRAINT_NAME = 'fk_contract_opp' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_contract ADD CONSTRAINT fk_contract_opp FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE SET NULL',
  'SELECT ''fk_contract_opp already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_quote.customer_id → crm_customer.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_quote'
  AND CONSTRAINT_NAME = 'fk_quote_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_quote ADD CONSTRAINT fk_quote_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT ''fk_quote_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_invoice.customer_id → crm_customer.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_invoice'
  AND CONSTRAINT_NAME = 'fk_invoice_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_invoice ADD CONSTRAINT fk_invoice_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL',
  'SELECT ''fk_invoice_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_invoice.create_by → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_invoice'
  AND CONSTRAINT_NAME = 'fk_invoice_create_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_invoice ADD CONSTRAINT fk_invoice_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_invoice_create_by already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

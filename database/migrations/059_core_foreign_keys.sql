SET @db_name = 'huakey_crm_test';
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

-- ============================================================
-- 迁移 053: 性能优化索引
-- 日期: 2026-06-11
-- 说明: 为高频查询表添加缺失索引（幂等写法）
-- ============================================================

SET @db = 'huakey_crm';

-- crm_customer
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_customer_status_lifecycle');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_customer_status_lifecycle ON crm_customer(status, lifecycle_status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_customer_last_follow');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_customer_last_follow ON crm_customer(last_follow_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_customer_owner');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_customer_owner ON crm_customer(owner_id, deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_follow_up
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up' AND INDEX_NAME='idx_followup_customer_time');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_followup_customer_time ON crm_follow_up(customer_id, create_time DESC)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up' AND INDEX_NAME='idx_followup_next_time');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_followup_next_time ON crm_follow_up(next_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_contract
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND INDEX_NAME='idx_contract_customer');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_contract_customer ON crm_contract(customer_id, deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND INDEX_NAME='idx_contract_sign_date');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_contract_sign_date ON crm_contract(sign_date)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND INDEX_NAME='idx_contract_status');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_contract_status ON crm_contract(status, deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_payment
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment' AND INDEX_NAME='idx_payment_contract');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_payment_contract ON crm_payment(contract_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment' AND INDEX_NAME='idx_payment_date');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_payment_date ON crm_payment(pay_date)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_payment_plan
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment_plan' AND INDEX_NAME='idx_plan_contract');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_plan_contract ON crm_payment_plan(contract_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment_plan' AND INDEX_NAME='idx_plan_date');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_plan_date ON crm_payment_plan(plan_date)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_quote
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND INDEX_NAME='idx_quote_customer');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_quote_customer ON crm_quote(customer_id, deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_quote' AND INDEX_NAME='idx_quote_approval');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_quote_approval ON crm_quote(approval_status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_opportunity
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity' AND INDEX_NAME='idx_opp_customer');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_opp_customer ON crm_opportunity(customer_id, deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity' AND INDEX_NAME='idx_opp_stage');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_opp_stage ON crm_opportunity(stage, deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity' AND INDEX_NAME='idx_opp_owner');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_opp_owner ON crm_opportunity(owner_id, deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_service_order
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_service_order' AND INDEX_NAME='idx_service_customer');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_service_customer ON crm_service_order(customer_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_service_order' AND INDEX_NAME='idx_service_status');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_service_status ON crm_service_order(status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_approval_record
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_approval_record' AND INDEX_NAME='idx_approval_approver');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_approval_approver ON crm_approval_record(approver_id, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_approval_record' AND INDEX_NAME='idx_approval_business');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_approval_business ON crm_approval_record(business_type, business_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_stock_movement
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_stock_movement' AND INDEX_NAME='idx_stock_product');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_stock_product ON crm_stock_movement(product_id, create_time DESC)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_calendar_event
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_calendar_event' AND INDEX_NAME='idx_calendar_time');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_calendar_time ON crm_calendar_event(start_time, end_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_calendar_event' AND INDEX_NAME='idx_calendar_create_by');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_calendar_create_by ON crm_calendar_event(create_by, deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_social_contact
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_social_contact' AND INDEX_NAME='idx_social_customer');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_social_customer ON crm_social_contact(customer_id, message_time DESC)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_commission_record
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_commission_record' AND INDEX_NAME='idx_commission_user');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_commission_user ON crm_commission_record(user_id, period)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

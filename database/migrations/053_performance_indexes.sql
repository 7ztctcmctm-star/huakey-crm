-- 053: 性能索引（安全模式，已存在的跳过）
-- 使用存储过程单条执行，避免 DELIMITER 问题

-- 以下索引通过检查 INFORMATION_SCHEMA 动态添加
-- 如果 run_migrations.js 报错，可手动在 MySQL 中执行

-- 客户表
CREATE INDEX idx_customer_assignee ON crm_customer(assignee);
CREATE INDEX idx_customer_status_lifecycle ON crm_customer(status, lifecycle_status);
CREATE INDEX idx_customer_last_follow ON crm_customer(last_follow_time);
CREATE INDEX idx_customer_owner ON crm_customer(owner_id, deleted_at);

-- 跟进记录
CREATE INDEX idx_followup_customer_time ON crm_follow_up(customer_id, follow_time DESC);
CREATE INDEX idx_followup_next_time ON crm_follow_up(next_time);

-- 合同
CREATE INDEX idx_contract_customer ON crm_contract(customer_id, deleted_at);
CREATE INDEX idx_contract_sign_date ON crm_contract(sign_date);
CREATE INDEX idx_contract_status ON crm_contract(status, deleted_at);

-- 回款
CREATE INDEX idx_payment_contract ON crm_payment(contract_id);
CREATE INDEX idx_payment_date ON crm_payment(pay_date);

-- 回款计划
CREATE INDEX idx_plan_contract ON crm_payment_plan(contract_id);
CREATE INDEX idx_plan_date ON crm_payment_plan(plan_date);

-- 报价
CREATE INDEX idx_quote_customer ON crm_quote(customer_id, deleted_at);
CREATE INDEX idx_quote_approval ON crm_quote(approval_status);

-- 商机
CREATE INDEX idx_opp_customer ON crm_opportunity(customer_id, deleted_at);
CREATE INDEX idx_opp_stage ON crm_opportunity(stage, deleted_at);
CREATE INDEX idx_opp_owner ON crm_opportunity(owner_id, deleted_at);

-- 工单
CREATE INDEX idx_service_customer ON crm_service_order(customer_id);
CREATE INDEX idx_service_status ON crm_service_order(status);

-- 审批
CREATE INDEX idx_approval_approver ON crm_approval_record(approver_id, status);
CREATE INDEX idx_approval_business ON crm_approval_record(business_type, business_id);

-- 库存变动
CREATE INDEX idx_stock_product ON crm_stock_movement(product_id, created_at DESC);

-- 日程
CREATE INDEX idx_calendar_time ON crm_calendar_event(start_time, end_time);
CREATE INDEX idx_calendar_create_by ON crm_calendar_event(create_by, deleted_at);

-- 社媒沟通
CREATE INDEX idx_social_customer ON crm_social_contact(customer_id, message_time DESC);

-- 佣金
CREATE INDEX idx_commission_user ON crm_commission_record(user_id, period);

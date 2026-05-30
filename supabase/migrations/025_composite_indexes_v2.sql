-- ============================================================
-- 迁移: 复合索引优化 v2
-- 日期: 2026-05-26
-- 说明: 为高频查询场景补充复合索引，覆盖看板、漏斗、列表等核心查询
-- ============================================================

DO $$
BEGIN
    -- HIGH 优先级
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_customer' AND indexname = 'idx_cust_status_owner_follow') THEN
        CREATE INDEX idx_cust_status_owner_follow ON crm_customer(status, owner_id, last_follow_time);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_opportunity' AND indexname = 'idx_opp_del_stage_amount') THEN
        CREATE INDEX idx_opp_del_stage_amount ON crm_opportunity(deleted_at, stage, expected_amount);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_contract' AND indexname = 'idx_contract_del_status_ctime') THEN
        CREATE INDEX idx_contract_del_status_ctime ON crm_contract(deleted_at, status, create_time);
    END IF;

    -- MEDIUM 优先级
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_payment' AND indexname = 'idx_payment_contract_del') THEN
        CREATE INDEX idx_payment_contract_del ON crm_payment(contract_id, deleted_at);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_service_order' AND indexname = 'idx_service_assignee_status') THEN
        CREATE INDEX idx_service_assignee_status ON crm_service_order(assignee_id, status);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_follow_up' AND indexname = 'idx_follow_cust_del_time') THEN
        CREATE INDEX idx_follow_cust_del_time ON crm_follow_up(customer_id, deleted_at, create_time);
    END IF;
    -- idx_target_user_year_month 已移至 034_sales_target_table.sql（建表时一并创建）
END $$;

-- ============================================================
-- 迁移: 性能优化 — 补充 deleted_at 索引
-- 日期: 2026-05-25
-- 说明: 为缺失 deleted_at 索引的业务大表补充索引
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_contract' AND indexname = 'idx_contract_deleted_at') THEN
        CREATE INDEX idx_contract_deleted_at ON crm_contract(deleted_at);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_opportunity' AND indexname = 'idx_opp_deleted_at') THEN
        CREATE INDEX idx_opp_deleted_at ON crm_opportunity(deleted_at);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_quote' AND indexname = 'idx_quote_deleted_at') THEN
        CREATE INDEX idx_quote_deleted_at ON crm_quote(deleted_at);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_payment' AND indexname = 'idx_payment_deleted_at') THEN
        CREATE INDEX idx_payment_deleted_at ON crm_payment(deleted_at);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_service_order' AND indexname = 'idx_service_deleted_at') THEN
        CREATE INDEX idx_service_deleted_at ON crm_service_order(deleted_at);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_supplier' AND indexname = 'idx_supplier_deleted_at') THEN
        CREATE INDEX idx_supplier_deleted_at ON crm_supplier(deleted_at);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_contact' AND indexname = 'idx_contact_deleted_at') THEN
        CREATE INDEX idx_contact_deleted_at ON crm_contact(deleted_at);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_follow_up' AND indexname = 'idx_follow_deleted_at') THEN
        CREATE INDEX idx_follow_deleted_at ON crm_follow_up(deleted_at);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_pool_log' AND indexname = 'idx_pool_log_deleted_at') THEN
        CREATE INDEX idx_pool_log_deleted_at ON crm_pool_log(deleted_at);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_customer' AND indexname = 'idx_customer_deleted_at') THEN
        CREATE INDEX idx_customer_deleted_at ON crm_customer(deleted_at);
    END IF;
END $$;

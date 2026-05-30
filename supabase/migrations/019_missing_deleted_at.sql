-- ============================================================
-- 迁移: 补充缺失的 deleted_at 软删除字段
-- 日期: 2026-05-25
-- 说明: 为 12 张缺少 deleted_at 的 crm_ 表添加软删除支持
-- 注意: crm_sales_target 由 034 迁移创建，已含 deleted_at，不在此列
-- ============================================================

DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'crm_assign_log', 'crm_customer_supplier_relation', 'crm_follow_up_reminder',
        'crm_payment_plan', 'crm_purchase_item', 'crm_purchase_order',
        'crm_purchase_payment', 'crm_purchase_receipt', 'crm_quote_item',
        'crm_supplier_contact', 'crm_supplier_qualification',
        'crm_supplier_rating'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = tbl AND column_name = 'deleted_at') THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL', tbl);
            EXECUTE format('COMMENT ON COLUMN %I.deleted_at IS %L', tbl, '软删除时间');
        END IF;
    END LOOP;
END $$;

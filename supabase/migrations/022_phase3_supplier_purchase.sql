-- 022_phase3_supplier_purchase.sql
-- Phase 3: 供应商评分增强 + 采购审批字段

DO $$
BEGIN
    -- 添加 purchase_order_id 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_supplier_rating' AND column_name = 'purchase_order_id') THEN
        ALTER TABLE crm_supplier_rating ADD COLUMN purchase_order_id INT DEFAULT NULL;
        COMMENT ON COLUMN crm_supplier_rating.purchase_order_id IS '关联采购单';
    END IF;

    -- 添加 quality_rate 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_supplier_rating' AND column_name = 'quality_rate') THEN
        ALTER TABLE crm_supplier_rating ADD COLUMN quality_rate DECIMAL(5,2) DEFAULT 0.00;
        COMMENT ON COLUMN crm_supplier_rating.quality_rate IS '质量合格率';
    END IF;

    -- 添加 delivery_rate 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_supplier_rating' AND column_name = 'delivery_rate') THEN
        ALTER TABLE crm_supplier_rating ADD COLUMN delivery_rate DECIMAL(5,2) DEFAULT 0.00;
        COMMENT ON COLUMN crm_supplier_rating.delivery_rate IS '准时交付率';
    END IF;

    -- 采购单添加 approve_time
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_purchase_order' AND column_name = 'approve_time') THEN
        ALTER TABLE crm_purchase_order ADD COLUMN approve_time TIMESTAMP DEFAULT NULL;
        COMMENT ON COLUMN crm_purchase_order.approve_time IS '审批时间';
    END IF;

    -- 采购单添加 approveRemark
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_purchase_order' AND column_name = 'approveRemark') THEN
        ALTER TABLE crm_purchase_order ADD COLUMN approveRemark VARCHAR(500) DEFAULT NULL;
        COMMENT ON COLUMN crm_purchase_order.approveRemark IS '审批备注';
    END IF;
END $$;

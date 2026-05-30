-- ============================================================
-- 迁移: 线索管理字段
-- 为 crm_customer 增加 lead_level(意向等级) 和 follow_status(跟进状态)
-- 日期: 2026-05-19
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_customer' AND column_name = 'lead_level') THEN
        ALTER TABLE crm_customer ADD COLUMN lead_level VARCHAR(10) DEFAULT NULL;
        COMMENT ON COLUMN crm_customer.lead_level IS '意向等级：高/中/低';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_customer' AND column_name = 'follow_status') THEN
        ALTER TABLE crm_customer ADD COLUMN follow_status VARCHAR(20) DEFAULT NULL;
        COMMENT ON COLUMN crm_customer.follow_status IS '跟进状态：初次联系/需求确认/报价中/已流失';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_customer' AND column_name = 'converted_at') THEN
        ALTER TABLE crm_customer ADD COLUMN converted_at TIMESTAMP DEFAULT NULL;
        COMMENT ON COLUMN crm_customer.converted_at IS '转化为客户的时间';
    END IF;
END $$;

-- 为现有潜在客户(status=1)填充默认值
UPDATE crm_customer SET lead_level = '中', follow_status = '初次联系'
WHERE status = 1 AND lead_level IS NULL;

-- 为已成交客户(status=2)也设置默认值
UPDATE crm_customer SET lead_level = '高', follow_status = '需求确认'
WHERE status = 2 AND lead_level IS NULL;

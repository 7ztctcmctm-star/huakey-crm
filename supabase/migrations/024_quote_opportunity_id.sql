-- [业务修复] crm_quote 添加 opportunity_id 列，关联商机
-- 兼容旧数据：默认 NULL，不影响已有报价单

ALTER TABLE crm_quote
  ADD COLUMN IF NOT EXISTS opportunity_id INT DEFAULT NULL;

COMMENT ON COLUMN crm_quote.opportunity_id IS '关联商机ID';

-- 添加外键（PostgreSQL ON UPDATE CASCADE 为默认行为，省略 ON UPDATE 子句）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_quote_opportunity') THEN
        ALTER TABLE crm_quote ADD CONSTRAINT fk_quote_opportunity
            FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quote_opportunity ON crm_quote(opportunity_id);

-- [业务修复] crm_quote 添加 opportunity_id 列，关联商机
-- 兼容旧数据：默认 NULL，不影响已有报价单

ALTER TABLE crm_quote
  ADD COLUMN opportunity_id INT DEFAULT NULL COMMENT '关联商机ID' AFTER customer_id,
  ADD CONSTRAINT fk_quote_opportunity FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD INDEX idx_quote_opportunity (opportunity_id);

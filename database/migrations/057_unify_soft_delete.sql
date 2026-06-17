-- 057: 统一3表软删除模式为 deleted_at IS NULL
-- crm_product_price、crm_score_rule、crm_currency

-- 1. crm_product_price 添加 deleted_at
ALTER TABLE crm_product_price ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL AFTER status;
CREATE INDEX idx_product_price_deleted ON crm_product_price(deleted_at);

-- 2. crm_score_rule 添加 deleted_at
ALTER TABLE crm_score_rule ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL AFTER status;
CREATE INDEX idx_score_rule_deleted ON crm_score_rule(deleted_at);

-- 3. crm_currency 添加 deleted_at
ALTER TABLE crm_currency ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL AFTER status;
CREATE INDEX idx_currency_deleted ON crm_currency(deleted_at);

-- 将已禁用的货币标记为软删除
UPDATE crm_currency SET deleted_at = NOW() WHERE status = 0;

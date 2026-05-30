-- Migration 009: 为商机、报价、合同、回款、供应商表添加软删除支持
-- 解决 Bug #03（商机/报价/合同/回款硬删除）和 Bug #13（供应商硬删除）

ALTER TABLE crm_opportunity ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE crm_quote ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE crm_contract ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE crm_payment ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE crm_supplier ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

COMMENT ON COLUMN crm_opportunity.deleted_at IS '软删除时间';
COMMENT ON COLUMN crm_quote.deleted_at IS '软删除时间';
COMMENT ON COLUMN crm_contract.deleted_at IS '软删除时间';
COMMENT ON COLUMN crm_payment.deleted_at IS '软删除时间';
COMMENT ON COLUMN crm_supplier.deleted_at IS '软删除时间';

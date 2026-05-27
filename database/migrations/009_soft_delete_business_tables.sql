-- Migration 009: 为商机、报价、合同、回款、供应商表添加软删除支持
-- 解决 Bug #03（商机/报价/合同/回款硬删除）和 Bug #13（供应商硬删除）

ALTER TABLE crm_opportunity ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间';
ALTER TABLE crm_quote ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间';
ALTER TABLE crm_contract ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间';
ALTER TABLE crm_payment ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间';
ALTER TABLE crm_supplier ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间';

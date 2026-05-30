-- ============================================================
-- 迁移: 审批备注字段
-- 日期: 2026-05-26
-- 说明: 为报价单和合同的审批添加备注字段（用于拒绝时填写原因）
-- ============================================================

ALTER TABLE crm_quote ADD COLUMN IF NOT EXISTS approval_remark VARCHAR(500) DEFAULT NULL;
ALTER TABLE crm_contract ADD COLUMN IF NOT EXISTS approval_remark VARCHAR(500) DEFAULT NULL;

COMMENT ON COLUMN crm_quote.approval_remark IS '审批备注（拒绝原因）';
COMMENT ON COLUMN crm_contract.approval_remark IS '审批备注（拒绝原因）';

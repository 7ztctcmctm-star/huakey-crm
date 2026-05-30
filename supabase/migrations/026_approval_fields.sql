-- ============================================================
-- 迁移: 审批流（简易版）
-- 日期: 2026-05-26
-- 说明: 为报价单和合同添加审批状态字段
-- ============================================================

-- 报价单审批字段
ALTER TABLE crm_quote
  ADD COLUMN IF NOT EXISTS approval_status SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS approver_id INT DEFAULT NULL;

COMMENT ON COLUMN crm_quote.approval_status IS '审批状态: 1=待审批, 2=已通过, 3=已拒绝';
COMMENT ON COLUMN crm_quote.approver_id IS '审批人ID';

CREATE INDEX IF NOT EXISTS idx_quote_approval ON crm_quote(approval_status);

-- 合同审批字段
ALTER TABLE crm_contract
  ADD COLUMN IF NOT EXISTS approval_status SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS approver_id INT DEFAULT NULL;

COMMENT ON COLUMN crm_contract.approval_status IS '审批状态: 1=待审批, 2=已通过, 3=已拒绝';
COMMENT ON COLUMN crm_contract.approver_id IS '审批人ID';

CREATE INDEX IF NOT EXISTS idx_contract_approval ON crm_contract(approval_status);

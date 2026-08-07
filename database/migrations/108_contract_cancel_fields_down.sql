-- ============================================================
-- 108_down: 移除合同取消字段
-- ============================================================
ALTER TABLE crm_contract DROP COLUMN IF EXISTS cancel_action;
ALTER TABLE crm_contract DROP COLUMN IF EXISTS cancel_reason;

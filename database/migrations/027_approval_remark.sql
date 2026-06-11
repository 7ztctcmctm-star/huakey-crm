-- ============================================================
-- 迁移: 审批备注字段
-- 日期: 2026-05-26
-- 说明: 为报价单和合同的审批添加备注字段（用于拒绝时填写原因）
-- ============================================================

USE huakey_crm;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_quote' AND column_name='approval_remark');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_quote ADD COLUMN approval_remark VARCHAR(500) DEFAULT NULL COMMENT ''审批备注（拒绝原因）'' AFTER approver_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_contract' AND column_name='approval_remark');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_contract ADD COLUMN approval_remark VARCHAR(500) DEFAULT NULL COMMENT ''审批备注（拒绝原因）'' AFTER approver_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


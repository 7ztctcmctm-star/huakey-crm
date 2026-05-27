-- ============================================================
-- 迁移: 审批备注字段
-- 日期: 2026-05-26
-- 说明: 为报价单和合同的审批添加备注字段（用于拒绝时填写原因）
-- ============================================================

USE huakey_crm;

ALTER TABLE crm_quote ADD COLUMN approval_remark VARCHAR(500) DEFAULT NULL COMMENT '审批备注（拒绝原因）' AFTER approver_id;
ALTER TABLE crm_contract ADD COLUMN approval_remark VARCHAR(500) DEFAULT NULL COMMENT '审批备注（拒绝原因）' AFTER approver_id;

INSERT IGNORE INTO schema_migrations (version, name) VALUES ('027', '审批备注字段');

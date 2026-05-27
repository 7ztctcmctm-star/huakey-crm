-- ============================================================
-- 迁移: 审批流（简易版）
-- 日期: 2026-05-26
-- 说明: 为报价单和合同添加审批状态字段
-- 影响: 新增2个字段，旧数据默认为"已通过"，不影响现有业务
-- ============================================================

USE huakey_crm;

-- 报价单审批字段
ALTER TABLE crm_quote
  ADD COLUMN approval_status TINYINT NOT NULL DEFAULT 2 COMMENT '审批状态: 1=待审批, 2=已通过, 3=已拒绝' AFTER status,
  ADD COLUMN approver_id INT DEFAULT NULL COMMENT '审批人ID' AFTER approval_status,
  ADD INDEX idx_quote_approval (approval_status);

-- 合同审批字段
ALTER TABLE crm_contract
  ADD COLUMN approval_status TINYINT NOT NULL DEFAULT 2 COMMENT '审批状态: 1=待审批, 2=已通过, 3=已拒绝' AFTER status,
  ADD COLUMN approver_id INT DEFAULT NULL COMMENT '审批人ID' AFTER approval_status,
  ADD INDEX idx_contract_approval (approval_status);

-- 记录迁移版本
INSERT IGNORE INTO schema_migrations (version, name) VALUES ('026', '审批流字段');

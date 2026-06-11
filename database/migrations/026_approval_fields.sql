-- ============================================================
-- 迁移: 审批流（简易版）
-- 日期: 2026-05-26
-- 说明: 为报价单和合同添加审批状态字段
-- 影响: 新增2个字段，旧数据默认为"已通过"，不影响现有业务
-- ============================================================

USE huakey_crm;

-- 报价单审批字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_quote' AND column_name='approval_status');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_quote ADD COLUMN approval_status TINYINT NOT NULL DEFAULT 2 COMMENT ''审批状态: 1=待审批, 2=已通过, 3=已拒绝'' AFTER status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_quote' AND column_name='approver_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_quote ADD COLUMN approver_id INT DEFAULT NULL COMMENT ''审批人ID'' AFTER approval_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_quote' AND INDEX_NAME='idx_quote_approval');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_quote ADD INDEX idx_quote_approval (approval_status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 合同审批字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_contract' AND column_name='approval_status');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_contract ADD COLUMN approval_status TINYINT NOT NULL DEFAULT 2 COMMENT ''审批状态: 1=待审批, 2=已通过, 3=已拒绝'' AFTER status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_contract' AND column_name='approver_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_contract ADD COLUMN approver_id INT DEFAULT NULL COMMENT ''审批人ID'' AFTER approval_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_contract' AND INDEX_NAME='idx_contract_approval');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_contract ADD INDEX idx_contract_approval (approval_status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


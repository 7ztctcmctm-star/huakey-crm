-- ============================================================
-- 096: 给 crm_purchase_order 添加 approval_status 字段
-- 修复：approvalService.getMySubmitted 查 crm_purchase_order.approval_status 时
--       报 1054 Unknown column 'q.approval_status'
-- 原因：crm_quote / crm_contract 均有 approval_status 字段，但 crm_purchase_order 缺失
-- 对齐：approval_status TINYINT NOT NULL DEFAULT 2 + 索引，与 quote/contract 一致
-- ============================================================

-- 1. 添加 approval_status 字段（幂等：检查是否已存在）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_order' AND COLUMN_NAME = 'approval_status');

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_purchase_order ADD COLUMN approval_status TINYINT NOT NULL DEFAULT 2',
  'SELECT 1 AS already_exists');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 添加索引（幂等：检查是否已存在）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_order' AND INDEX_NAME = 'idx_purchase_order_approval_status');

SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_purchase_order_approval_status ON crm_purchase_order(approval_status)',
  'SELECT 1 AS already_exists');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

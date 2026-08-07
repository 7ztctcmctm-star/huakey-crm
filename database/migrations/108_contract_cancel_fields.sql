-- ============================================================
-- 108: crm_contract 增加取消原因字段
-- ============================================================
-- Phase 5.4 合同取消工作流
-- cancel_reason: 取消原因(用户输入)
-- cancel_action: customer_cancelled/reopen_negotiation/keep_won
-- 幂等: 基于 information_schema 检查, 已存在则跳过
-- ============================================================

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contract' AND COLUMN_NAME = 'cancel_reason'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE crm_contract ADD COLUMN cancel_reason VARCHAR(500) NULL COMMENT ''取消原因'' AFTER approval_remark',
  'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists2 := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contract' AND COLUMN_NAME = 'cancel_action'
);

SET @sql2 := IF(@col_exists2 = 0,
  'ALTER TABLE crm_contract ADD COLUMN cancel_action VARCHAR(50) NULL COMMENT ''取消动作'' AFTER cancel_reason',
  'SELECT 1');

PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

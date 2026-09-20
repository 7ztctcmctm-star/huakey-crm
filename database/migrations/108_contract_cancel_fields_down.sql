-- ============================================================
-- 108_down: 移除合同取消字段
-- 注意: MySQL 8.0 不支持 ALTER TABLE ... DROP COLUMN IF EXISTS（MariaDB 语法）
--       ⇒ 使用 information_schema + PREPARE/EXECUTE 条件化 DDL
--         （项目惯例模式，同 090_down；对应的 108 up 脚本亦用同一模式）
-- ============================================================

-- 1. 移除 cancel_action（先建后删 ⇒ 回滚按逆序删）
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contract' AND COLUMN_NAME = 'cancel_action'
);

SET @sql := IF(@col_exists > 0,
  'ALTER TABLE crm_contract DROP COLUMN cancel_action',
  'SELECT 1 AS cancel_action_not_exists');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 移除 cancel_reason
SET @col_exists2 := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contract' AND COLUMN_NAME = 'cancel_reason'
);

SET @sql2 := IF(@col_exists2 > 0,
  'ALTER TABLE crm_contract DROP COLUMN cancel_reason',
  'SELECT 1 AS cancel_reason_not_exists');

PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

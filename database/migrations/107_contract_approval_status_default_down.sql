-- ============================================================
-- 107_down: 回滚 crm_contract.approval_status 默认值
-- ============================================================
-- 回滚目标：恢复至 Migration 026 的原始定义
--   DEFAULT 2（已通过）
--   COMMENT '审批状态: 1=待审批, 2=已通过, 3=已拒绝'
--
-- 注意：
--   - 回滚只恢复 DEFAULT 与 COMMENT，不改变已有行数据；
--   - 回滚后新建合同将再次默认"已通过"（仅用于紧急回退场景）；
--   - 列类型 TINYINT / NOT NULL / 索引 idx_contract_approval 均保留。
--
-- 跨库兼容：不使用 USE 语句，依赖 DATABASE() 适配 huakey_crm / huakey_crm_test。
-- ============================================================

-- 1. 幂等检查：仅当列存在且默认值不是 '2' 时才执行 MODIFY
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'crm_contract'
    AND COLUMN_NAME = 'approval_status'
);

SET @current_default := (
  SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'crm_contract'
    AND COLUMN_NAME = 'approval_status'
);

SELECT IF(@col_exists = 0,
  'ERROR: crm_contract.approval_status does not exist! Nothing to rollback.',
  'OK: crm_contract.approval_status exists.'
) AS migration_107_down_precheck;

-- 默认值已是 '2' → 跳过；否则恢复 DEFAULT 2（恢复 migration 026 原始注释）
SET @sql := IF(@col_exists > 0 AND @current_default IS NOT NULL AND @current_default = '2',
  'SELECT ''approval_status default already 2, skip MODIFY'' AS msg',
  'ALTER TABLE crm_contract MODIFY COLUMN approval_status TINYINT NOT NULL DEFAULT 2 COMMENT ''审批状态: 1=待审批, 2=已通过, 3=已拒绝'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 验证：默认值已恢复为 2
SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  COLUMN_DEFAULT,
  IS_NULLABLE,
  COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'crm_contract'
  AND COLUMN_NAME = 'approval_status';

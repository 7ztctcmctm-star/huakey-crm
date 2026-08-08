-- ============================================================
-- 107: crm_contract.approval_status 默认值修复
-- ============================================================
-- 背景：
--   Migration 026 创建 crm_contract.approval_status 时 DEFAULT 2（已通过）。
--   业务期望（docs/contract-status-definition.md §6）：
--     0=未提交, 1=待审批, 2=已通过, 3=已拒绝
--   新建合同应默认进入 0（未提交），由用户主动"提交审批"后转 1（待审批）。
--   当前 DEFAULT 2 导致新建合同默认"已通过"，前端 list.vue 中
--   `v-if="row.approval_status === 0"` 的"提交审批"按钮不可达。
--   详见 docs/contract-status-definition.md §7.2（已知问题）。
--
-- 变更：
--   ALTER TABLE crm_contract
--     MODIFY COLUMN approval_status TINYINT NOT NULL DEFAULT 0
--     COMMENT '审批状态: 0=未提交, 1=待审批, 2=已通过, 3=已拒绝'
--
-- 仅修改 DEFAULT 与 COMMENT；不改变列类型 / NOT NULL / 列位置 / 索引。
--
-- 影响评估：
--   🟢 低风险。
--   - MODIFY COLUMN 只改变后续 INSERT 的隐式默认值；
--   - 已有行保持原值不变（不会被回填为 0）；
--   - 既有索引 idx_contract_approval 保留；
--   - 列位置保留（MODIFY 不指定 AFTER 时保持原位）。
--
-- 跨库兼容：
--   不使用 USE 语句，依赖 migrate.js 连接的默认数据库（DATABASE()），
--   使迁移在 huakey_crm / huakey_crm_test 等任意目标库均能正确应用。
--
-- 验证：
--   迁移后执行文末 SELECT 确认 COLUMN_DEFAULT = '0'；
--   并执行 `SELECT approval_status, COUNT(*) FROM crm_contract GROUP BY approval_status;`
--   确认历史数据分布未变。
-- ============================================================

-- 1. 幂等检查：仅当列存在且默认值不是 '0' 时才执行 MODIFY
--    information_schema.COLUMNS.COLUMN_DEFAULT 返回字符串（'0' / '2' / NULL）
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

-- 列缺失 → 报错中止（说明 migration 026 未执行，不能跳过）
SELECT IF(@col_exists = 0,
  'ERROR: crm_contract.approval_status does not exist! Migration 026 may not have run. Aborting.',
  'OK: crm_contract.approval_status exists.'
) AS migration_107_precheck;

-- 默认值已是 '0' → 跳过；否则执行 MODIFY
SET @sql := IF(@col_exists > 0 AND @current_default IS NOT NULL AND @current_default = '0',
  'SELECT ''approval_status default already 0, skip MODIFY'' AS msg',
  'ALTER TABLE crm_contract MODIFY COLUMN approval_status TINYINT NOT NULL DEFAULT 0 COMMENT ''审批状态: 0=未提交, 1=待审批, 2=已通过, 3=已拒绝'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 验证：默认值已是 0，列类型/可空性/注释正确
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

-- 3. 数据安全性验证：历史数据分布（应在迁移前后保持一致，MODIFY 不回填数据）
SELECT
  approval_status,
  COUNT(*) AS cnt
FROM crm_contract
WHERE deleted_at IS NULL
GROUP BY approval_status
ORDER BY approval_status;

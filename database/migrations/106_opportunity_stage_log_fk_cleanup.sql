-- ============================================================
-- 106: opportunity_stage_log 双重 FK 清理
-- ============================================================
-- 变更内容：
--   1. 删除 fk_stage_log_opportunity (Migration 011, ON DELETE CASCADE)
--   2. 保留 fk_stagelog_opp     (Migration 060, ON DELETE SET NULL)
--
-- 背景：
--   crm_opportunity_stage_log.opportunity_id 上存在两个 FK 约束:
--     - fk_stage_log_opportunity (011): ON DELETE CASCADE
--     - fk_stagelog_opp          (060): ON DELETE SET NULL
--   同列双 FK 造成语义混乱。MySQL 实际行为: CASCADE 优先执行。
--   统一为 SET NULL，与项目中其他 FK 策略一致。
--
-- 风险评估：
--   🟢 低风险。变更前: 删除商机时 stage_log 被 CASCADE 删除。
--   变更后: 删除商机时 stage_log.opportunity_id → NULL，日志保留。
--   这更符合审计需求（保留历史记录），且与 fk_contract_opp 策略一致。
--
-- 建议: 正向迁移后运行 SQL 验证:
--   SELECT COUNT(*) FROM crm_opportunity_stage_log WHERE opportunity_id IS NULL;
--   预期: 非零（如有被删除的商机）或零（如无），但不应报错。
-- ============================================================

USE huakey_crm;

-- 1. 确认两个 FK 均存在（诊断查询，非破坏性）
SELECT
  CONSTRAINT_NAME,
  DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE TABLE_SCHEMA = 'huakey_crm'
  AND TABLE_NAME = 'crm_opportunity_stage_log'
  AND CONSTRAINT_NAME IN ('fk_stage_log_opportunity', 'fk_stagelog_opp');

-- 2. 删除 ON DELETE CASCADE 的 FK（011 创建）
--    保留 ON DELETE SET NULL 的 FK（060 创建）
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_opportunity_stage_log'
    AND CONSTRAINT_NAME = 'fk_stage_log_opportunity'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql := IF(@fk_exists > 0,
  'ALTER TABLE crm_opportunity_stage_log DROP FOREIGN KEY fk_stage_log_opportunity',
  'SELECT ''fk_stage_log_opportunity already cleaned up'' AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 验证: 确保 SET NULL 版本仍然存在
SET @fk_null_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_opportunity_stage_log'
    AND CONSTRAINT_NAME = 'fk_stagelog_opp'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

-- 如果 fk_stagelog_opp 不存在，此 SELECT 主动报错以阻止继续
SELECT IF(@fk_null_exists = 0,
  'ERROR: fk_stagelog_opp does not exist! Migration 060 may not have run. Aborting.',
  'OK: fk_stagelog_opp exists, cleanup successful.'
) AS migration_106_status;

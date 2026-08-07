-- ============================================================
-- 106_down: 回滚 opportunity_stage_log FK 清理
-- 恢复 fk_stage_log_opportunity (ON DELETE CASCADE)
-- ============================================================

-- 不使用 USE 语句：依赖 migrate.js 连接的默认数据库（DATABASE()）

-- 重新创建 fk_stage_log_opportunity (ON DELETE CASCADE) — 幂等
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'crm_opportunity_stage_log'
    AND CONSTRAINT_NAME = 'fk_stage_log_opportunity'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE crm_opportunity_stage_log
   ADD CONSTRAINT fk_stage_log_opportunity
   FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id)
   ON DELETE CASCADE',
  'SELECT ''fk_stage_log_opportunity already exists'' AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

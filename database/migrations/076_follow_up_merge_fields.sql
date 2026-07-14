-- ============================================================
-- 迁移 076: 跟进记录与跟进计划合并 - crm_follow_up 新增合并字段
-- 日期: 2026-07-14
-- 说明: Prompt 4-2 将 crm_follow_plan 合并进 crm_follow_up（通过 is_plan 区分）。
--       本迁移为 crm_follow_up 增加：is_plan（是否计划）、finish_time（完成时间）、
--       plan_status（计划状态）、source_plan_id（溯源：原 follow_plan.id）。
--       所有字段新增均幂等（information_schema 判定）。
-- ============================================================

USE huakey_crm;

-- 1. is_plan: 0=实际跟进, 1=跟进计划
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'is_plan');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_follow_up ADD COLUMN is_plan TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否跟进计划: 0=实际跟进, 1=跟进计划'",
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. finish_time: 计划完成时间
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'finish_time');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_follow_up ADD COLUMN finish_time DATETIME DEFAULT NULL COMMENT \'计划完成时间（completePlan 时填充）\'',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. plan_status: 计划状态（pending/completed/overdue/cancelled）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'plan_status');
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE crm_follow_up ADD COLUMN plan_status VARCHAR(20) DEFAULT NULL COMMENT '计划状态: pending/completed/overdue/cancelled'",
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. source_plan_id: 溯源（原 crm_follow_plan.id）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'source_plan_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_follow_up ADD COLUMN source_plan_id INT DEFAULT NULL COMMENT \'溯源: 原 crm_follow_plan.id\'',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. 索引（幂等）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND INDEX_NAME = 'idx_follow_is_plan');
SET @sql2 = IF(@idx_exists = 0, 'CREATE INDEX idx_follow_is_plan ON crm_follow_up(is_plan)', 'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND INDEX_NAME = 'idx_follow_next_time');
SET @sql2 = IF(@idx_exists = 0, 'CREATE INDEX idx_follow_next_time ON crm_follow_up(next_time)', 'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_follow_up' AND INDEX_NAME = 'idx_follow_source_plan');
SET @sql2 = IF(@idx_exists = 0, 'CREATE INDEX idx_follow_source_plan ON crm_follow_up(source_plan_id)', 'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SELECT 'crm_follow_up 合并字段已就绪' AS result;

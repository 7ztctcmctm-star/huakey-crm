-- ============================================================
-- 迁移 124 回滚: 移除 crm_customer_score_log 软删列与复合索引
-- 日期: 2026-10-22
--
-- ⚠ 数据影响（回滚前必读）：
--   回滚只删「结构」，不删数据。此前被软删（deleted_at 非空）的旧评分日志行
--   在列被 DROP 后重新变得「可见」（读路径的过滤条件也随本提交的代码回滚一并移除），
--   历史曲线恢复为「重算前全量可见」状态 —— 这正是迁移前的语义，无数据损失。
--
-- 幂等：DROP COLUMN/INDEX 前均查 information_schema（MySQL 8.0 不支持 IF EXISTS）。
-- ============================================================

USE huakey_crm;

SET @db_name = DATABASE();

-- ========== 1. 复合索引 ==========

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer_score_log' AND INDEX_NAME = 'idx_csl_customer_deleted') > 0,
  'ALTER TABLE crm_customer_score_log DROP INDEX idx_csl_customer_deleted',
  'DO 0'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== 2. deleted_at 列 ==========

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer_score_log' AND COLUMN_NAME = 'deleted_at') > 0,
  'ALTER TABLE crm_customer_score_log DROP COLUMN deleted_at',
  'DO 0'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

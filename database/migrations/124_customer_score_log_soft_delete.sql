-- ============================================================
-- 迁移 124: crm_customer_score_log 软删列（C3 删除逻辑治理）
-- 日期: 2026-10-22
-- 风险等级: P2（纯加列 + 加索引，对存量数据只读、不改；读路径同步加过滤）
--
-- 背景（C3 审计实测）
--   scoringRouteService.saveScoreResult 原先「先 DELETE 后 INSERT」：
--   每次重算客户评分，先把该客户全部评分日志物理删除，再写入本次命中行。
--   ⇒ 历史曲线一次抹平，「这个客户为什么是 80 分」只能看到最后一次重算结果，
--     评分规则调优/客户异议复盘时无据可查。
--
-- 方案：软删而非物理删（与 crm_score_rule.deleted_at 等 62 张表既有约定一致）。
--   · 写：UPDATE ... SET deleted_at = NOW() WHERE customer_id = ? AND deleted_at IS NULL
--     （重算 = 封版上一版，行不丢）
--   · 读：两处读取点（scoringRouteService.getCustomerScore、
--     customerDetailService 客户详情评分记录）统一 AND deleted_at IS NULL
--   · 索引：复合索引 (customer_id, deleted_at) 服务上述读模式；
--     既有单列 idx_csl_customer 保留（不删——历史索引删除需另行评估）。
--
-- 配套（同一提交）：
--   · deploy/init-complete.sql 同步加列 + 加索引（CI 建库事实源，
--     不同步则 CI 库缺列，软删查询报 ERROR 1054 —— B4 幻影列教训）
--   · deploy/ci-missing-tables-verify.sql 追加 @c124 / @i124 两条不变量（92→94）
--
-- 幂等：加列/加索引前均查 information_schema，已存在则跳过。
-- ============================================================

USE huakey_crm;

SET @db_name = DATABASE();

-- ========== 1. deleted_at 列 ==========

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer_score_log' AND COLUMN_NAME = 'deleted_at') = 0,
  'ALTER TABLE crm_customer_score_log ADD COLUMN deleted_at datetime DEFAULT NULL COMMENT ''软删时间（评分重算时封版旧行）''',
  'DO 0'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== 2. 复合索引 (customer_id, deleted_at) ==========

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer_score_log' AND INDEX_NAME = 'idx_csl_customer_deleted') = 0,
  'ALTER TABLE crm_customer_score_log ADD INDEX idx_csl_customer_deleted (customer_id, deleted_at)',
  'DO 0'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 迁移: 复合索引优化 v2
-- 日期: 2026-05-26
-- 说明: 为高频查询场景补充复合索引，覆盖看板、漏斗、列表等核心查询
-- 影响: 纯索引变更，不改数据，不锁表(MySQL 8.0 Online DDL)
-- ============================================================

USE huakey_crm;

-- 辅助过程：仅在索引不存在时添加
DELIMITER //
CREATE PROCEDURE add_idx_if_not_exists(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(255))
BEGIN
  SELECT COUNT(*) INTO @cnt
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = tbl AND INDEX_NAME = idx;
  IF @cnt = 0 THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', idx, '` (', cols, ')');
    PREPARE stmt FROM @s;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

-- ========== HIGH 优先级 ==========

-- crm_customer: 看板逾期客户查询 (status NOT IN + owner_id + last_follow_time)
CALL add_idx_if_not_exists('crm_customer', 'idx_cust_status_owner_follow', 'status, owner_id, last_follow_time');

-- crm_opportunity: 销售漏斗聚合 (deleted_at + stage GROUP BY + expected_amount 覆盖)
CALL add_idx_if_not_exists('crm_opportunity', 'idx_opp_del_stage_amount', 'deleted_at, stage, expected_amount');

-- crm_contract: 合同列表 (deleted_at + status + create_time 排序)
CALL add_idx_if_not_exists('crm_contract', 'idx_contract_del_status_ctime', 'deleted_at, status, create_time');

-- ========== MEDIUM 优先级 ==========

-- crm_payment: 合同列表中的回款子查询 (contract_id + deleted_at 精确匹配)
CALL add_idx_if_not_exists('crm_payment', 'idx_payment_contract_del', 'contract_id, deleted_at');

-- crm_service_order: 看板待办统计 (assignee_id IN + status IN)
CALL add_idx_if_not_exists('crm_service_order', 'idx_service_assignee_status', 'assignee_id, status');

-- crm_follow_up: 客户详情跟进列表 (customer_id + deleted_at + create_time 排序)
CALL add_idx_if_not_exists('crm_follow_up', 'idx_follow_cust_del_time', 'customer_id, deleted_at, create_time');

-- crm_sales_target: 看板目标达成率 (user_id + year + month 精确匹配)
CALL add_idx_if_not_exists('crm_sales_target', 'idx_target_user_year_month', 'user_id, year, month');

-- 清理辅助过程
DROP PROCEDURE IF EXISTS add_idx_if_not_exists;

-- 记录迁移版本
INSERT IGNORE INTO schema_migrations (version, name) VALUES ('025', '复合索引优化v2');

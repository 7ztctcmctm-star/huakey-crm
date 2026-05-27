-- ============================================================
-- 迁移: 性能优化 — 补充 deleted_at 索引
-- 日期: 2026-05-25
-- 说明: 为缺失 deleted_at 索引的业务大表补充索引
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

CALL add_idx_if_not_exists('crm_contract',      'idx_contract_deleted_at',    'deleted_at');
CALL add_idx_if_not_exists('crm_opportunity',    'idx_opp_deleted_at',         'deleted_at');
CALL add_idx_if_not_exists('crm_quote',          'idx_quote_deleted_at',       'deleted_at');
CALL add_idx_if_not_exists('crm_payment',        'idx_payment_deleted_at',     'deleted_at');
CALL add_idx_if_not_exists('crm_service_order',  'idx_service_deleted_at',     'deleted_at');
CALL add_idx_if_not_exists('crm_supplier',       'idx_supplier_deleted_at',    'deleted_at');
CALL add_idx_if_not_exists('crm_contact',        'idx_contact_deleted_at',     'deleted_at');
CALL add_idx_if_not_exists('crm_follow_up',      'idx_follow_deleted_at',      'deleted_at');
CALL add_idx_if_not_exists('crm_pool_log',       'idx_pool_log_deleted_at',    'deleted_at');
CALL add_idx_if_not_exists('crm_customer',       'idx_customer_deleted_at',    'deleted_at');

-- 清理辅助过程
DROP PROCEDURE IF EXISTS add_idx_if_not_exists;

-- 记录迁移版本
INSERT IGNORE INTO schema_migrations (version, name) VALUES ('017', '性能优化索引');

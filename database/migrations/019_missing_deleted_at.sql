-- ============================================================
-- 迁移: 补充缺失的 deleted_at 软删除字段
-- 日期: 2026-05-25
-- 说明: 为 13 张缺少 deleted_at 的 crm_ 表添加软删除支持
-- ============================================================

USE huakey_crm;

-- 辅助过程：为指定表添加 deleted_at 列（如不存在）
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS add_deleted_at(IN tbl VARCHAR(64))
BEGIN
  DECLARE col_exists INT DEFAULT 0;
  SELECT COUNT(*) INTO col_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = tbl
    AND COLUMN_NAME = 'deleted_at';
  IF col_exists = 0 THEN
    SET @sql = CONCAT('ALTER TABLE ', tbl, ' ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL add_deleted_at('crm_assign_log');
CALL add_deleted_at('crm_customer_supplier_relation');
CALL add_deleted_at('crm_follow_up_reminder');
CALL add_deleted_at('crm_payment_plan');
CALL add_deleted_at('crm_purchase_item');
CALL add_deleted_at('crm_purchase_order');
CALL add_deleted_at('crm_purchase_payment');
CALL add_deleted_at('crm_purchase_receipt');
CALL add_deleted_at('crm_quote_item');
CALL add_deleted_at('crm_sales_target');
CALL add_deleted_at('crm_supplier_contact');
CALL add_deleted_at('crm_supplier_qualification');
CALL add_deleted_at('crm_supplier_rating');

-- 清理辅助过程
DROP PROCEDURE IF EXISTS add_deleted_at;

-- 记录迁移版本
INSERT IGNORE INTO schema_migrations (version, name) VALUES ('019', '补充缺失的deleted_at软删除字段');

-- ============================================================
-- 迁移: 通知表增加跳转链接字段
-- 日期: 2026-06-30
-- ============================================================

USE huakey_crm;

SET @add_link_url = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'crm_notification'
     AND column_name = 'link_url') = 0,
  'ALTER TABLE crm_notification ADD COLUMN link_url VARCHAR(500) DEFAULT NULL COMMENT \'跳转链接\' AFTER content',
  'SELECT 1'
);

PREPARE stmt FROM @add_link_url;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

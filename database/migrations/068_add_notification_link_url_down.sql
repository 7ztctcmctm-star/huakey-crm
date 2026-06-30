-- ============================================================
-- 迁移回滚: 删除通知表跳转链接字段
-- ============================================================

USE huakey_crm;

SET @drop_link_url = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'crm_notification'
     AND column_name = 'link_url') > 0,
  'ALTER TABLE crm_notification DROP COLUMN link_url',
  'SELECT 1'
);

PREPARE stmt FROM @drop_link_url;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 081 回滚：删除跟进提醒相关配置项和索引（Prompt 3）

USE huakey_crm;

-- 1. 恢复 reminder_type 枚举为原始值
ALTER TABLE crm_follow_up_reminder MODIFY COLUMN reminder_type ENUM('overdue','today','upcoming') DEFAULT 'overdue' COMMENT '提醒类型';

-- 2. 删除索引 idx_customer_last_follow（兼容不支持 IF EXISTS 的 MySQL 版本）
SET @idx081_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_customer_last_follow');
SET @sql081 = IF(@idx081_exists > 0, 'DROP INDEX idx_customer_last_follow ON crm_customer', 'SELECT 1');
PREPARE stmt081 FROM @sql081; EXECUTE stmt081; DEALLOCATE PREPARE stmt081;

-- 3. 删除系统配置项
DELETE FROM sys_config WHERE config_key IN ('followup_reminder_enabled', 'near_recycle_days', 'recycle_days');

-- 081 回滚：删除跟进提醒相关配置项和索引（Prompt 3）

USE huakey_crm;

-- 1. 恢复 reminder_type 枚举为原始值
ALTER TABLE crm_follow_up_reminder MODIFY COLUMN reminder_type ENUM('overdue','today','upcoming') DEFAULT 'overdue' COMMENT '提醒类型';

-- 2. 删除索引 idx_customer_last_follow
DROP INDEX IF EXISTS idx_customer_last_follow ON crm_customer;

-- 3. 删除系统配置项
DELETE FROM sys_config WHERE config_key IN ('followup_reminder_enabled', 'near_recycle_days', 'recycle_days');

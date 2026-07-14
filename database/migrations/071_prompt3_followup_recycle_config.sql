-- 071_prompt3_followup_recycle_config.sql
-- Prompt 3: 跟进驱动客户状态与自动回收配置

-- 1. 新增系统配置项
INSERT IGNORE INTO sys_config (config_key, config_value, description) VALUES
('followup_reminder_enabled', '1', '是否启用跟进提醒生成（1启用/0关闭）'),
('near_recycle_days', '7', 'following 状态客户未跟进进入即将回收预警的天数阈值'),
('recycle_days', '15', 'following 状态客户未跟进自动释放到公海的天数阈值');

-- 2. 确保 last_follow_time 索引存在（幂等）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_customer_last_follow');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_customer_last_follow ON crm_customer(last_follow_time)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 扩展跟进提醒表 reminder_type 枚举支持（MySQL 8.0 以下建议直接修改 ENUM，这里用 ALTER 幂等）
SET @col_type = (SELECT DATA_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up_reminder' AND COLUMN_NAME = 'reminder_type');
SET @sql = IF(@col_type = 'enum',
  'ALTER TABLE crm_follow_up_reminder MODIFY COLUMN reminder_type ENUM(\'overdue\',\'today\',\'upcoming\',\'near_recycle\',\'pre_release\') DEFAULT \'overdue\' COMMENT \'提醒类型: overdue=逾期未跟进, today=今日待跟进, upcoming=明日待跟进, near_recycle=即将回收, pre_release=释放前通知\'',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 回滚 128: 恢复 uk_customer_date (customer_id, reminder_date)
--
-- ⚠️ 恢复旧键前必须确认「同一客户同一天只有一条提醒」。
--    若 128 上线后已产生多类型同日提醒，旧唯一键会拒绝这些行，ALTER 直接失败
--    （失败是安全的：不会删除任何数据）。先按下面 SQL 检查并人工处理：
--
--    SELECT customer_id, reminder_date, GROUP_CONCAT(reminder_type) types, COUNT(*) n
--      FROM crm_follow_up_reminder
--     GROUP BY customer_id, reminder_date HAVING COUNT(*) > 1;
--
--    处理方式（按业务选择，任选其一，均需备份）：
--      a) 保留业务上最重要的一条（today > overdue > upcoming > pre_release），
--         DELETE 其余行；
--      b) 将这些行的 reminder_date 错开（会改变提醒归属日期，不推荐）；
--      c) 不执行本回滚，保留 128 的新键（推荐：旧键本身即缺陷）。
-- ============================================================

USE huakey_crm;

SET @db_name = DATABASE();

-- 顺序：先建旧键，再删新键（旧键同样以 customer_id 为首列，保证外键始终有支撑索引）。
-- 若存在同客户同日多类型行，新增旧键会失败 —— 这是有意为之的安全保护。
SET @old_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @db_name
     AND TABLE_NAME = 'crm_follow_up_reminder'
     AND INDEX_NAME = 'uk_customer_date'
);
SET @sql = IF(@old_exists = 0,
  'ALTER TABLE crm_follow_up_reminder ADD UNIQUE KEY uk_customer_date (customer_id, reminder_date)',
  'SELECT ''uk_customer_date already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @new_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @db_name
     AND TABLE_NAME = 'crm_follow_up_reminder'
     AND INDEX_NAME = 'uk_customer_type_date'
);
SET @sql = IF(@new_exists > 0,
  'ALTER TABLE crm_follow_up_reminder DROP INDEX uk_customer_type_date',
  'SELECT ''uk_customer_type_date already absent'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

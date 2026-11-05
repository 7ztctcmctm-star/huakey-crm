-- ============================================================
-- 迁移 128: 跟进提醒唯一键按 reminder_type 区分（P2-02）
-- 日期: 2026-10-26
-- 风险等级: P2（仅 DDL，不改数据；新键比旧键更宽，不会拒绝存量行）
--
-- 背景（docs/audit-report-2026-10-23.md P2-02）：
--   修复前唯一键为 uk_customer_date (customer_id, reminder_date)，
--   同一客户同一天只能存在一条提醒，与 reminder_type 的多类型语义冲突：
--     · 逾期提醒（overdue）先插入后，今日待跟进（today）插入撞唯一键；
--     · 昨日生成的「明日待跟进」（upcoming, reminder_date=今日）同样挤占今日提醒；
--     · cronService 的释放前提醒（pre_release）也会被 overdue 挤掉。
--   `scripts/generate_reminders.js` 在插入成功之后才发送企业微信/SSE，
--   重复异常被 catch 吞掉 → 通知静默跳过，且提醒中心分类缺项。
--
-- 修复：唯一键改为 (customer_id, reminder_type, reminder_date)
--   · 去重粒度与通知类型一致：同类型同日仍幂等（脚本重跑不重复通知）；
--   · 不同类型可共存，今日/逾期/释放前提醒不再互相挤占；
--   · 新键包含旧键全部列，旧键下不可能存在新键冲突。
--
-- 执行前只读核对（可选）：
--   SELECT customer_id, reminder_date, COUNT(*) FROM crm_follow_up_reminder
--    GROUP BY customer_id, reminder_date HAVING COUNT(*) > 1;   -- 预期 0 行
-- ============================================================

USE huakey_crm;

SET @db_name = DATABASE();

-- 1. 先新增按类型区分的唯一键（已存在则跳过）
-- ⚠️ 顺序不可颠倒：旧键 `uk_customer_date(customer_id, reminder_date)` 同时承担
--   外键 fk_reminder_customer(customer_id) 的支撑索引。若先 DROP 旧键，MySQL 8
--   报 ER_DROP_INDEX_FK（Cannot drop index ... needed in a foreign key constraint）。
--   新键以 customer_id 为首列，先建新键后，旧键即可安全删除。
SET @new_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @db_name
     AND TABLE_NAME = 'crm_follow_up_reminder'
     AND INDEX_NAME = 'uk_customer_type_date'
);
SET @sql = IF(@new_exists = 0,
  'ALTER TABLE crm_follow_up_reminder ADD UNIQUE KEY uk_customer_type_date (customer_id, reminder_type, reminder_date)',
  'SELECT ''uk_customer_type_date already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 删除旧唯一键（不存在则跳过）
SET @old_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = @db_name
     AND TABLE_NAME = 'crm_follow_up_reminder'
     AND INDEX_NAME = 'uk_customer_date'
);
SET @sql = IF(@old_exists > 0,
  'ALTER TABLE crm_follow_up_reminder DROP INDEX uk_customer_date',
  'SELECT ''uk_customer_date already absent'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

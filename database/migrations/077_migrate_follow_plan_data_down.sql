-- ============================================================
-- 回滚 077: 撤销跟进计划数据迁移
--   1) 将 reminder.follow_plan_id 还原为原始 follow_plan.id
--   2) 删除迁移产生的 is_plan=1 记录
-- ============================================================

USE huakey_crm;

-- 1. 还原 reminder.follow_plan_id
UPDATE crm_follow_up_reminder r
JOIN crm_follow_up fu ON fu.id = r.follow_plan_id AND fu.source_plan_id IS NOT NULL
SET r.follow_plan_id = fu.source_plan_id
WHERE r.follow_plan_id IS NOT NULL;

-- 2. 删除迁移产生的跟进计划记录
DELETE FROM crm_follow_up WHERE source_plan_id IS NOT NULL;

SELECT 'crm_follow_plan 迁移已回滚' AS result;

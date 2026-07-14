-- ============================================================
-- 迁移 077: 跟进计划数据迁移至跟进记录表
-- 日期: 2026-07-14
-- 说明: Prompt 4-2 将 crm_follow_plan 合并进 crm_follow_up（is_plan=1）。
--   字段映射: plan_time->next_time, plan_content->content, follow_type->follow_type,
--             status->plan_status, create_by/create_time 原样保留。
--   幂等: 仅迁移尚未迁移的计划（按 source_plan_id 去重）。
--   迁移后把 crm_follow_up_reminder.follow_plan_id 重新指向新的 follow_up 记录。
-- ============================================================

USE huakey_crm;

-- 1. 迁移数据（is_plan=1）
INSERT INTO crm_follow_up
  (customer_id, contact_id, follow_type, content, next_time, next_content, create_by, create_time, deleted_at, is_plan, finish_time, plan_status, source_plan_id)
SELECT
  fp.customer_id,
  fp.contact_id,
  fp.follow_type,
  fp.plan_content,
  fp.plan_time,
  NULL,
  fp.create_by,
  fp.create_time,
  fp.deleted_at,
  1 AS is_plan,
  CASE WHEN fp.status = 'completed' THEN fp.create_time ELSE NULL END AS finish_time,
  fp.status AS plan_status,
  fp.id AS source_plan_id
FROM crm_follow_plan fp
WHERE fp.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM crm_follow_up fu WHERE fu.source_plan_id = fp.id
  );

-- 2. 重新指向提醒记录的 follow_plan_id -> 新 follow_up.id
UPDATE crm_follow_up_reminder r
JOIN crm_follow_up fu ON fu.source_plan_id = r.follow_plan_id
SET r.follow_plan_id = fu.id
WHERE r.follow_plan_id IS NOT NULL AND r.follow_plan_id > 0;

SELECT 'crm_follow_plan 数据已迁移至 crm_follow_up' AS result;

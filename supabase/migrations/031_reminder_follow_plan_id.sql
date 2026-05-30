-- 031_reminder_follow_plan_id.sql
-- 给 crm_follow_up_reminder 表添加 follow_plan_id 字段，关联跟进计划

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_follow_up_reminder' AND column_name = 'follow_plan_id') THEN
        ALTER TABLE crm_follow_up_reminder ADD COLUMN follow_plan_id INT DEFAULT NULL;
        COMMENT ON COLUMN crm_follow_up_reminder.follow_plan_id IS '关联跟进计划ID';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reminder_follow_plan ON crm_follow_up_reminder(follow_plan_id);

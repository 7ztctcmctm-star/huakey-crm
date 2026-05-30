-- ============================================================
-- 迁移: 操作日志字段级变更记录
-- 日期: 2026-05-28
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sys_log' AND column_name = 'changed_fields') THEN
        ALTER TABLE sys_log ADD COLUMN changed_fields TEXT DEFAULT NULL;
        COMMENT ON COLUMN sys_log.changed_fields IS '变更字段列表(JSON)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sys_log' AND column_name = 'old_value') THEN
        ALTER TABLE sys_log ADD COLUMN old_value TEXT DEFAULT NULL;
        COMMENT ON COLUMN sys_log.old_value IS '变更前数据(JSON)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sys_log' AND column_name = 'new_value') THEN
        ALTER TABLE sys_log ADD COLUMN new_value TEXT DEFAULT NULL;
        COMMENT ON COLUMN sys_log.new_value IS '变更后数据(JSON)';
    END IF;
END $$;

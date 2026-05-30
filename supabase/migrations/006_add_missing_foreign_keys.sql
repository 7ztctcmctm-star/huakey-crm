-- ============================================================
-- 迁移: 添加缺失的外键约束
-- 日期: 2026-05-22
-- 策略: ON DELETE SET NULL（用户删除时置空，不级联删除业务数据）
-- ============================================================

DO $$
BEGIN
    -- sys_user.manager_id → sys_user.id
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_user_manager' AND table_name = 'sys_user') THEN
        ALTER TABLE sys_user ADD CONSTRAINT fk_user_manager FOREIGN KEY (manager_id) REFERENCES sys_user(id) ON DELETE SET NULL;
    END IF;

    -- crm_pool_log.from_user_id → sys_user.id
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_pool_log_from_user' AND table_name = 'crm_pool_log') THEN
        ALTER TABLE crm_pool_log ADD CONSTRAINT fk_pool_log_from_user FOREIGN KEY (from_user_id) REFERENCES sys_user(id) ON DELETE SET NULL;
    END IF;

    -- crm_pool_log.to_user_id → sys_user.id
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_pool_log_to_user' AND table_name = 'crm_pool_log') THEN
        ALTER TABLE crm_pool_log ADD CONSTRAINT fk_pool_log_to_user FOREIGN KEY (to_user_id) REFERENCES sys_user(id) ON DELETE SET NULL;
    END IF;

    -- crm_assign_log.customer_id → crm_customer.id
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_assign_log_customer' AND table_name = 'crm_assign_log') THEN
        ALTER TABLE crm_assign_log ADD CONSTRAINT fk_assign_log_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE;
    END IF;

    -- crm_assign_log.from_user_id → sys_user.id
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_assign_log_from_user' AND table_name = 'crm_assign_log') THEN
        ALTER TABLE crm_assign_log ADD CONSTRAINT fk_assign_log_from_user FOREIGN KEY (from_user_id) REFERENCES sys_user(id) ON DELETE SET NULL;
    END IF;

    -- crm_assign_log.to_user_id → sys_user.id
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_assign_log_to_user' AND table_name = 'crm_assign_log') THEN
        ALTER TABLE crm_assign_log ADD CONSTRAINT fk_assign_log_to_user FOREIGN KEY (to_user_id) REFERENCES sys_user(id) ON DELETE SET NULL;
    END IF;

    -- crm_assign_log.operator_id → sys_user.id
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_assign_log_operator' AND table_name = 'crm_assign_log') THEN
        ALTER TABLE crm_assign_log ADD CONSTRAINT fk_assign_log_operator FOREIGN KEY (operator_id) REFERENCES sys_user(id) ON DELETE SET NULL;
    END IF;

    -- crm_follow_up_reminder.customer_id → crm_customer.id
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_reminder_customer' AND table_name = 'crm_follow_up_reminder') THEN
        ALTER TABLE crm_follow_up_reminder ADD CONSTRAINT fk_reminder_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE;
    END IF;

    -- crm_follow_up_reminder.owner_id → sys_user.id
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_reminder_owner' AND table_name = 'crm_follow_up_reminder') THEN
        ALTER TABLE crm_follow_up_reminder ADD CONSTRAINT fk_reminder_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL;
    END IF;

    -- crm_follow_up_reminder.manager_id → sys_user.id
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_reminder_manager' AND table_name = 'crm_follow_up_reminder') THEN
        ALTER TABLE crm_follow_up_reminder ADD CONSTRAINT fk_reminder_manager FOREIGN KEY (manager_id) REFERENCES sys_user(id) ON DELETE SET NULL;
    END IF;

    -- sys_log.user_id → sys_user.id
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_log_user' AND table_name = 'sys_log') THEN
        ALTER TABLE sys_log ADD CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE SET NULL;
    END IF;
END $$;

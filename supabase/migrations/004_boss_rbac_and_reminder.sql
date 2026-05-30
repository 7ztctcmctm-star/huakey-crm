-- ============================================================
-- 迁移: 老板权限 + 客户分配日志 + 跟进提醒
-- 日期: 2026-05-18
-- ============================================================

-- Step 1: sys_role 增加权限标识字段
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sys_role' AND column_name = 'view_all') THEN
        ALTER TABLE sys_role ADD COLUMN view_all BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN sys_role.view_all IS '查看全部数据权限';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sys_role' AND column_name = 'manage_all') THEN
        ALTER TABLE sys_role ADD COLUMN manage_all BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN sys_role.manage_all IS '管理全部数据权限';
    END IF;
END $$;

-- 超级管理员拥有全部权限
UPDATE sys_role SET view_all = TRUE, manage_all = TRUE WHERE code = 'super_admin';

-- 管理员也拥有全部权限
UPDATE sys_role SET view_all = TRUE, manage_all = TRUE WHERE code = 'admin';

-- 新增老板角色
INSERT INTO sys_role (name, code, description, status, view_all, manage_all)
SELECT '老板', 'boss', '公司老板，查看全公司数据，分配客户', 1, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE code = 'boss');

-- Step 2: sys_user 增加上级ID字段
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sys_user' AND column_name = 'manager_id') THEN
        ALTER TABLE sys_user ADD COLUMN manager_id INT DEFAULT NULL;
        COMMENT ON COLUMN sys_user.manager_id IS '直属上级ID';
    END IF;
END $$;

-- Step 3: 创建客户分配日志表
CREATE TABLE IF NOT EXISTS crm_assign_log (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL,
    from_user_id INT DEFAULT NULL,
    to_user_id INT NOT NULL,
    operator_id INT NOT NULL,
    remark VARCHAR(500) DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE crm_assign_log IS '客户分配日志表';
COMMENT ON COLUMN crm_assign_log.id IS '主键ID';
COMMENT ON COLUMN crm_assign_log.customer_id IS '客户ID';
COMMENT ON COLUMN crm_assign_log.from_user_id IS '原负责人ID';
COMMENT ON COLUMN crm_assign_log.to_user_id IS '新负责人ID';
COMMENT ON COLUMN crm_assign_log.operator_id IS '操作人ID';
COMMENT ON COLUMN crm_assign_log.remark IS '备注';
COMMENT ON COLUMN crm_assign_log.create_time IS '分配时间';

CREATE INDEX IF NOT EXISTS idx_assign_customer ON crm_assign_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_assign_operator ON crm_assign_log(operator_id);
CREATE INDEX IF NOT EXISTS idx_assign_to_user ON crm_assign_log(to_user_id);
CREATE INDEX IF NOT EXISTS idx_assign_create_time ON crm_assign_log(create_time);

-- Step 4: 创建跟进提醒表
CREATE TABLE IF NOT EXISTS crm_follow_up_reminder (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL,
    owner_id INT DEFAULT NULL,
    manager_id INT DEFAULT NULL,
    reminder_type VARCHAR(20) DEFAULT 'overdue',
    reminder_date DATE NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    create_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uk_customer_date UNIQUE (customer_id, reminder_date)
);

COMMENT ON TABLE crm_follow_up_reminder IS '跟进提醒表';
COMMENT ON COLUMN crm_follow_up_reminder.id IS '主键ID';
COMMENT ON COLUMN crm_follow_up_reminder.customer_id IS '客户ID';
COMMENT ON COLUMN crm_follow_up_reminder.owner_id IS '客户负责人ID';
COMMENT ON COLUMN crm_follow_up_reminder.manager_id IS '负责人上级ID';
COMMENT ON COLUMN crm_follow_up_reminder.reminder_type IS '提醒类型: overdue=逾期未跟进';
COMMENT ON COLUMN crm_follow_up_reminder.reminder_date IS '提醒日期';
COMMENT ON COLUMN crm_follow_up_reminder.is_read IS '是否已读';
COMMENT ON COLUMN crm_follow_up_reminder.is_dismissed IS '是否已处理';
COMMENT ON COLUMN crm_follow_up_reminder.create_time IS '创建时间';

CREATE INDEX IF NOT EXISTS idx_reminder_owner ON crm_follow_up_reminder(owner_id);
CREATE INDEX IF NOT EXISTS idx_reminder_is_read ON crm_follow_up_reminder(is_read);
CREATE INDEX IF NOT EXISTS idx_reminder_create_time ON crm_follow_up_reminder(create_time);

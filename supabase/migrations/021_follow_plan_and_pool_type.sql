-- 021_follow_plan_and_pool_type.sql
-- 创建跟进计划表 + 给客户表添加池类型字段

-- 1. 创建跟进计划表
CREATE TABLE IF NOT EXISTS crm_follow_plan (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL,
    contact_id INT DEFAULT NULL,
    plan_time TIMESTAMP NOT NULL,
    plan_content VARCHAR(500) NOT NULL,
    follow_type VARCHAR(20) DEFAULT '电话',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'overdue')),
    create_by INT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP DEFAULT NULL
);

COMMENT ON TABLE crm_follow_plan IS '跟进计划表';
COMMENT ON COLUMN crm_follow_plan.id IS '主键ID';
COMMENT ON COLUMN crm_follow_plan.customer_id IS '客户ID';
COMMENT ON COLUMN crm_follow_plan.contact_id IS '联系人ID';
COMMENT ON COLUMN crm_follow_plan.plan_time IS '计划跟进时间';
COMMENT ON COLUMN crm_follow_plan.plan_content IS '计划内容';
COMMENT ON COLUMN crm_follow_plan.follow_type IS '跟进方式';
COMMENT ON COLUMN crm_follow_plan.status IS '状态';
COMMENT ON COLUMN crm_follow_plan.create_by IS '创建人ID';
COMMENT ON COLUMN crm_follow_plan.create_time IS '创建时间';
COMMENT ON COLUMN crm_follow_plan.deleted_at IS '软删除时间';

CREATE INDEX IF NOT EXISTS idx_fp_customer ON crm_follow_plan(customer_id);
CREATE INDEX IF NOT EXISTS idx_fp_plan_time ON crm_follow_plan(plan_time);
CREATE INDEX IF NOT EXISTS idx_fp_status ON crm_follow_plan(status);
CREATE INDEX IF NOT EXISTS idx_fp_create_by ON crm_follow_plan(create_by);

-- 2. 给 crm_customer 添加 pool_type 字段
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_customer' AND column_name = 'pool_type') THEN
        ALTER TABLE crm_customer ADD COLUMN pool_type VARCHAR(20) DEFAULT 'public' CHECK (pool_type IN ('public', 'private'));
        COMMENT ON COLUMN crm_customer.pool_type IS '池类型';
    END IF;
END $$;

-- 3. 添加 pool_type 索引
CREATE INDEX IF NOT EXISTS idx_customer_pool_type ON crm_customer(pool_type);

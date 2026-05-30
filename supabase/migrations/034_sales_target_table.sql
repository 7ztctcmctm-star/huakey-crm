-- crm_sales_target 建表（target.js 引用但无建表语句）
-- 日期: 2026-05-28

CREATE TABLE IF NOT EXISTS crm_sales_target (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    target_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    create_by INT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP DEFAULT NULL,
    CONSTRAINT uk_user_period UNIQUE (user_id, year, month)
);

COMMENT ON TABLE crm_sales_target IS '销售目标表';
COMMENT ON COLUMN crm_sales_target.id IS '主键ID';
COMMENT ON COLUMN crm_sales_target.user_id IS '销售用户ID';
COMMENT ON COLUMN crm_sales_target.year IS '目标年份';
COMMENT ON COLUMN crm_sales_target.month IS '目标月份';
COMMENT ON COLUMN crm_sales_target.target_amount IS '目标金额';
COMMENT ON COLUMN crm_sales_target.create_by IS '创建人ID';
COMMENT ON COLUMN crm_sales_target.create_time IS '创建时间';
COMMENT ON COLUMN crm_sales_target.update_time IS '更新时间';
COMMENT ON COLUMN crm_sales_target.deleted_at IS '软删除时间';

CREATE INDEX IF NOT EXISTS idx_target_user ON crm_sales_target(user_id);
CREATE INDEX IF NOT EXISTS idx_target_period ON crm_sales_target(year, month);
CREATE INDEX IF NOT EXISTS idx_target_user_year_month ON crm_sales_target(user_id, year, month);

CREATE TRIGGER trg_crm_sales_target_update_time
    BEFORE UPDATE ON crm_sales_target
    FOR EACH ROW EXECUTE FUNCTION update_update_time();

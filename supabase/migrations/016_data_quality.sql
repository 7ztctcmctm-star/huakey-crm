-- ============================================================
-- 迁移: 基础数据质量保障
-- 日期: 2026-05-25
-- 说明: 创建验证规则表、质量报告表、为客户表添加唯一索引和 deleted_at
-- ============================================================

-- 1. 为 crm_customer 添加 deleted_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_customer' AND column_name = 'deleted_at') THEN
        ALTER TABLE crm_customer ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;
        COMMENT ON COLUMN crm_customer.deleted_at IS '软删除时间';
    END IF;
END $$;

-- 2. 为 crm_customer 添加唯一索引（PostgreSQL 中 NULL 值不会冲突）
CREATE UNIQUE INDEX IF NOT EXISTS uk_company_phone ON crm_customer(company_name, phone);

-- 3. 为 crm_supplier 添加唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_supplier_name ON crm_supplier(name);

-- 4. 数据验证规则表
CREATE TABLE IF NOT EXISTS sys_validation_rule (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    column_name VARCHAR(50) NOT NULL,
    rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('required', 'unique', 'format', 'range', 'custom')),
    rule_config JSONB,
    error_message VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    create_time TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE sys_validation_rule IS '数据验证规则表';
COMMENT ON COLUMN sys_validation_rule.id IS '规则ID';
COMMENT ON COLUMN sys_validation_rule.table_name IS '表名';
COMMENT ON COLUMN sys_validation_rule.column_name IS '列名';
COMMENT ON COLUMN sys_validation_rule.rule_type IS '规则类型';
COMMENT ON COLUMN sys_validation_rule.rule_config IS '规则配置';
COMMENT ON COLUMN sys_validation_rule.error_message IS '错误提示';
COMMENT ON COLUMN sys_validation_rule.is_active IS '是否启用';
COMMENT ON COLUMN sys_validation_rule.create_time IS '创建时间';

CREATE INDEX IF NOT EXISTS idx_table_column ON sys_validation_rule(table_name, column_name);

-- 5. 数据质量报告表
CREATE TABLE IF NOT EXISTS sys_data_quality_report (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    total_count INT DEFAULT 0,
    duplicate_count INT DEFAULT 0,
    invalid_count INT DEFAULT 0,
    missing_count INT DEFAULT 0,
    quality_score DECIMAL(5,2) DEFAULT 0.00,
    check_time TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE sys_data_quality_report IS '数据质量报告表';
COMMENT ON COLUMN sys_data_quality_report.id IS '报告ID';
COMMENT ON COLUMN sys_data_quality_report.table_name IS '表名';
COMMENT ON COLUMN sys_data_quality_report.total_count IS '总记录数';
COMMENT ON COLUMN sys_data_quality_report.duplicate_count IS '重复记录数';
COMMENT ON COLUMN sys_data_quality_report.invalid_count IS '无效记录数';
COMMENT ON COLUMN sys_data_quality_report.missing_count IS '缺失记录数';
COMMENT ON COLUMN sys_data_quality_report.quality_score IS '质量评分';
COMMENT ON COLUMN sys_data_quality_report.check_time IS '检查时间';

CREATE INDEX IF NOT EXISTS idx_dq_table_name ON sys_data_quality_report(table_name);
CREATE INDEX IF NOT EXISTS idx_dq_check_time ON sys_data_quality_report(check_time);

-- 6. 插入默认验证规则（PG 用 ON CONFLICT DO NOTHING 替代 INSERT IGNORE）
INSERT INTO sys_validation_rule (table_name, column_name, rule_type, rule_config, error_message) VALUES
('crm_customer', 'company_name', 'required', NULL, '公司名称不能为空'),
('crm_customer', 'phone', 'format', '{"pattern": "^$|^\\\\+?\\\\d{7,20}$"}', '电话格式不正确（7-20位数字）'),
('crm_customer', 'email', 'format', '{"pattern": "^$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\.[a-zA-Z]{2,}$"}', '邮箱格式不正确'),
('crm_customer', 'level', 'range', '{"values": ["A","B","C","D"]}', '客户等级必须为 A/B/C/D'),
('crm_supplier', 'name', 'required', NULL, '供应商名称不能为空')
ON CONFLICT DO NOTHING;

-- 7. 新增权限点
INSERT INTO sys_permission (name, code, type, parent_id, sort)
SELECT '数据质量检查', 'data_quality:check', 'button', 2, 10
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'data_quality:check');

INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 1, id FROM sys_permission WHERE code = 'data_quality:check'
ON CONFLICT DO NOTHING;

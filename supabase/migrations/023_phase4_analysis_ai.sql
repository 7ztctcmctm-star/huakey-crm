-- Phase 4: 数据分析 + AI + 邮件集成

-- 1. 数据分析配置表
CREATE TABLE IF NOT EXISTS sys_analysis_config (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('prediction', 'anomaly', 'alert')),
    config JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    create_time TIMESTAMP DEFAULT NOW()
);

-- 2. 第三方集成表
CREATE TABLE IF NOT EXISTS sys_integration (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('email', 'sms', 'erp', 'finance')),
    config JSONB,
    status VARCHAR(20) DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
    last_sync_time TIMESTAMP,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);

CREATE TRIGGER trg_sys_integration_update_time
    BEFORE UPDATE ON sys_integration
    FOR EACH ROW EXECUTE FUNCTION update_update_time();

-- 3. AI建议记录表
CREATE TABLE IF NOT EXISTS crm_ai_suggestion (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL CHECK (type IN ('customer', 'opportunity', 'pricing', 'follow_up')),
    ref_id INT NOT NULL,
    suggestion TEXT,
    confidence DECIMAL(5,2),
    is_accepted BOOLEAN DEFAULT FALSE,
    feedback VARCHAR(500),
    create_by INT,
    create_time TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_type_ref ON crm_ai_suggestion(type, ref_id);

-- 4. 邮件日志表
CREATE TABLE IF NOT EXISTS sys_email_log (
    id BIGSERIAL PRIMARY KEY,
    to_email VARCHAR(200) NOT NULL,
    subject VARCHAR(500),
    body TEXT,
    type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
    error_msg VARCHAR(500),
    ref_type VARCHAR(50),
    ref_id INT,
    send_by INT,
    create_time TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_create_time ON sys_email_log(create_time);
CREATE INDEX IF NOT EXISTS idx_email_ref ON sys_email_log(ref_type, ref_id);

-- 5. 初始化分析配置
INSERT INTO sys_analysis_config (name, code, type, config) VALUES
('销售预测', 'sales_prediction', 'prediction', '{"months": 3, "method": "moving_average"}'),
('客户流失预警', 'churn_alert', 'alert', '{"overdue_days": 30}'),
('异常检测', 'anomaly_detection', 'anomaly', '{"threshold_sigma": 2}')
ON CONFLICT DO NOTHING;

-- 6. 初始化邮件集成配置
INSERT INTO sys_integration (name, type, config, status) VALUES
('系统邮件', 'email', '{"host":"","port":465,"secure":true,"user":"","pass":"","from":""}', 'inactive')
ON CONFLICT DO NOTHING;

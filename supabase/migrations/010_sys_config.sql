-- 系统配置表
CREATE TABLE IF NOT EXISTS sys_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value VARCHAR(500) NOT NULL,
    description VARCHAR(200) DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE sys_config IS '系统配置';
COMMENT ON COLUMN sys_config.id IS '主键ID';
COMMENT ON COLUMN sys_config.config_key IS '配置键';
COMMENT ON COLUMN sys_config.config_value IS '配置值';
COMMENT ON COLUMN sys_config.description IS '配置说明';
COMMENT ON COLUMN sys_config.update_time IS '更新时间';

-- update_time 自动更新触发器
CREATE OR REPLACE FUNCTION update_update_time()
RETURNS TRIGGER AS $$
BEGIN
    NEW.update_time = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sys_config_update_time
    BEFORE UPDATE ON sys_config
    FOR EACH ROW EXECUTE FUNCTION update_update_time();

-- 初始配置：逾期天数
INSERT INTO sys_config (config_key, config_value, description) VALUES
('overdue_days', '15', '客户逾期跟进天数阈值');

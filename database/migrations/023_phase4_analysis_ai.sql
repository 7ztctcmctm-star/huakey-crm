-- Phase 4: 数据分析 + AI + 邮件集成

-- 1. 数据分析配置表
CREATE TABLE IF NOT EXISTS sys_analysis_config (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    type ENUM('prediction', 'anomaly', 'alert') NOT NULL,
    config JSON,
    is_active TINYINT DEFAULT 1,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 第三方集成表
CREATE TABLE IF NOT EXISTS sys_integration (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    type ENUM('email', 'sms', 'erp', 'finance') NOT NULL,
    config JSON,
    status ENUM('active', 'inactive', 'error') DEFAULT 'inactive',
    last_sync_time DATETIME,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. AI建议记录表
CREATE TABLE IF NOT EXISTS crm_ai_suggestion (
    id INT PRIMARY KEY AUTO_INCREMENT,
    type ENUM('customer', 'opportunity', 'pricing', 'follow_up') NOT NULL,
    ref_id INT NOT NULL,
    suggestion TEXT,
    confidence DECIMAL(5,2),
    is_accepted TINYINT DEFAULT 0,
    feedback VARCHAR(500),
    create_by INT,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type_ref (type, ref_id)
);

-- 4. 邮件日志表
CREATE TABLE IF NOT EXISTS sys_email_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    to_email VARCHAR(200) NOT NULL,
    subject VARCHAR(500),
    body TEXT,
    type VARCHAR(50),
    status ENUM('sent', 'failed') DEFAULT 'sent',
    error_msg VARCHAR(500),
    ref_type VARCHAR(50),
    ref_id INT,
    send_by INT,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_create_time (create_time),
    INDEX idx_ref (ref_type, ref_id)
);

-- 5. 初始化分析配置
INSERT IGNORE INTO sys_analysis_config (name, code, type, config) VALUES
('销售预测', 'sales_prediction', 'prediction', '{"months": 3, "method": "moving_average"}'),
('客户流失预警', 'churn_alert', 'alert', '{"overdue_days": 30}'),
('异常检测', 'anomaly_detection', 'anomaly', '{"threshold_sigma": 2}');

-- 6. 初始化邮件集成配置
INSERT IGNORE INTO sys_integration (name, type, config, status) VALUES
('系统邮件', 'email', '{"host":"","port":465,"secure":true,"user":"","pass":"","from":""}', 'inactive');

-- 051_integrations.sql
-- 集成：日程会议 + 社媒沟通 + API开放平台

-- 日程/会议表
CREATE TABLE IF NOT EXISTS crm_calendar_event (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL COMMENT '标题',
  event_type VARCHAR(20) NOT NULL COMMENT '类型：meeting/followup/task/reminder',
  description TEXT COMMENT '描述',
  start_time DATETIME NOT NULL COMMENT '开始时间',
  end_time DATETIME DEFAULT NULL COMMENT '结束时间',
  all_day TINYINT(1) DEFAULT 0 COMMENT '全天事件',
  location VARCHAR(200) DEFAULT NULL COMMENT '地点',
  customer_id INT DEFAULT NULL COMMENT '关联客户',
  contact_id INT DEFAULT NULL COMMENT '关联联系人',
  related_type VARCHAR(20) DEFAULT NULL COMMENT '关联类型',
  related_id INT DEFAULT NULL COMMENT '关联ID',
  attendees TEXT COMMENT '参与人ID列表JSON',
  reminder_minutes INT DEFAULT 15 COMMENT '提前提醒分钟',
  status VARCHAR(20) DEFAULT 'confirmed' COMMENT '状态',
  color VARCHAR(20) DEFAULT '#2563EB' COMMENT '显示颜色',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_ce_time (start_time, end_time),
  KEY idx_ce_customer (customer_id),
  KEY idx_ce_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='日程会议';

-- 社交通讯记录表
CREATE TABLE IF NOT EXISTS crm_social_contact (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT DEFAULT NULL COMMENT '关联客户',
  contact_id INT DEFAULT NULL COMMENT '关联联系人',
  platform VARCHAR(20) NOT NULL COMMENT '平台',
  direction VARCHAR(10) NOT NULL COMMENT '方向：in/out',
  content TEXT COMMENT '沟通内容摘要',
  attachment_url VARCHAR(500) DEFAULT NULL COMMENT '附件路径',
  message_time DATETIME DEFAULT NULL COMMENT '消息时间',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sc_customer (customer_id),
  KEY idx_sc_platform (platform),
  KEY idx_sc_time (message_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社交通讯记录';

-- API密钥表
CREATE TABLE IF NOT EXISTS crm_api_key (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '密钥名称',
  api_key VARCHAR(64) NOT NULL UNIQUE COMMENT 'API Key',
  api_secret VARCHAR(64) DEFAULT NULL COMMENT 'API Secret',
  permissions TEXT COMMENT '权限列表JSON',
  rate_limit INT DEFAULT 100 COMMENT '每小时请求限制',
  status TINYINT(1) DEFAULT 1 COMMENT '状态',
  last_used_at DATETIME DEFAULT NULL COMMENT '最后使用时间',
  expires_at DATETIME DEFAULT NULL COMMENT '过期时间',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_ak_key (api_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='API密钥';

-- Webhook订阅表
CREATE TABLE IF NOT EXISTS crm_webhook (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT 'Webhook名称',
  url VARCHAR(500) NOT NULL COMMENT '回调URL',
  events TEXT NOT NULL COMMENT '订阅事件JSON',
  secret VARCHAR(64) DEFAULT NULL COMMENT '签名密钥',
  status TINYINT(1) DEFAULT 1 COMMENT '状态',
  last_triggered_at DATETIME DEFAULT NULL COMMENT '最后触发时间',
  fail_count INT DEFAULT 0 COMMENT '连续失败次数',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Webhook订阅';

-- Webhook发送日志表
CREATE TABLE IF NOT EXISTS crm_webhook_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  webhook_id INT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload TEXT COMMENT '发送的JSON数据',
  response_status INT DEFAULT NULL COMMENT 'HTTP响应状态码',
  response_body TEXT DEFAULT NULL COMMENT '响应内容',
  status VARCHAR(20) DEFAULT NULL COMMENT 'success/failed/timeout',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wl_webhook (webhook_id),
  KEY idx_wl_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Webhook发送日志';

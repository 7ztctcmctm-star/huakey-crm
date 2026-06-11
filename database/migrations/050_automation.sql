-- 050_automation.sql
-- 自动化：工作流引擎 + 自动分配 + 智能提醒

-- 工作流规则表
CREATE TABLE IF NOT EXISTS crm_workflow_rule (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '规则名称',
  description VARCHAR(200) DEFAULT NULL,
  trigger_event VARCHAR(50) NOT NULL COMMENT '触发事件',
  conditions TEXT COMMENT '触发条件JSON',
  actions TEXT NOT NULL COMMENT '执行动作JSON',
  status TINYINT(1) DEFAULT 1 COMMENT '状态',
  last_run_at DATETIME DEFAULT NULL,
  run_count INT DEFAULT 0,
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_wr_event (trigger_event),
  KEY idx_wr_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流规则';

-- 工作流执行日志表
CREATE TABLE IF NOT EXISTS crm_workflow_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  rule_id INT NOT NULL,
  trigger_event VARCHAR(50) NOT NULL,
  target_type VARCHAR(30) DEFAULT NULL,
  target_id INT DEFAULT NULL,
  action_type VARCHAR(30) DEFAULT NULL,
  action_result VARCHAR(20) DEFAULT NULL,
  action_detail TEXT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wl_rule (rule_id),
  KEY idx_wl_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流执行日志';

-- 智能提醒规则表
CREATE TABLE IF NOT EXISTS crm_smart_reminder (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '规则名称',
  reminder_type VARCHAR(30) NOT NULL COMMENT '提醒类型',
  config TEXT NOT NULL COMMENT '配置JSON',
  notify_to VARCHAR(20) DEFAULT 'owner' COMMENT '通知对象',
  notify_method VARCHAR(20) DEFAULT 'system' COMMENT '通知方式',
  status TINYINT(1) DEFAULT 1 COMMENT '状态',
  last_run_at DATETIME DEFAULT NULL,
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_sr_type (reminder_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能提醒规则';

-- 智能提醒记录表
CREATE TABLE IF NOT EXISTS crm_smart_reminder_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  rule_id INT NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id INT NOT NULL,
  remind_date DATE NOT NULL,
  user_id INT NOT NULL COMMENT '通知目标用户',
  status VARCHAR(20) DEFAULT 'pending',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_reminder_once (rule_id, target_type, target_id, remind_date),
  KEY idx_srl_user (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能提醒记录';

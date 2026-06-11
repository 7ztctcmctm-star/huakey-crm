-- 046_satisfaction_survey.sql
-- 客户满意度调查模块

-- 调查模板表
CREATE TABLE IF NOT EXISTS crm_survey_template (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '模板名称',
  description VARCHAR(200) DEFAULT NULL COMMENT '模板说明',
  survey_type VARCHAR(20) NOT NULL DEFAULT 'csat' COMMENT '调查类型：nps/csat/custom',
  questions TEXT NOT NULL COMMENT '问题配置JSON',
  is_system TINYINT(1) DEFAULT 0 COMMENT '是否系统预设',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_st_type (survey_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='调查模板';

-- 调查活动表
CREATE TABLE IF NOT EXISTS crm_survey_campaign (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '调查名称',
  template_id INT NOT NULL COMMENT '使用的模板',
  status VARCHAR(20) DEFAULT 'draft' COMMENT '状态：draft/active/closed',
  target_type VARCHAR(20) DEFAULT 'all' COMMENT '目标：all/specific',
  target_ids TEXT COMMENT '指定客户ID列表JSON',
  send_method VARCHAR(20) DEFAULT 'link' COMMENT '发送方式',
  total_sent INT DEFAULT 0 COMMENT '已发送数',
  total_responded INT DEFAULT 0 COMMENT '已回复数',
  start_date DATE DEFAULT NULL COMMENT '开始日期',
  end_date DATE DEFAULT NULL COMMENT '结束日期',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_sc_status (status),
  KEY idx_sc_template (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='调查活动';

-- 调查回复表
CREATE TABLE IF NOT EXISTS crm_survey_response (
  id INT PRIMARY KEY AUTO_INCREMENT,
  campaign_id INT NOT NULL COMMENT '活动ID',
  customer_id INT DEFAULT NULL COMMENT '关联客户',
  answers TEXT NOT NULL COMMENT '回答JSON',
  nps_score INT DEFAULT NULL COMMENT 'NPS分数(0-10)',
  csat_score DECIMAL(3,1) DEFAULT NULL COMMENT 'CSAT平均分',
  respondent_name VARCHAR(50) DEFAULT NULL COMMENT '回复人',
  respondent_contact VARCHAR(100) DEFAULT NULL COMMENT '联系方式',
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sr_campaign (campaign_id),
  KEY idx_sr_customer (customer_id),
  CONSTRAINT fk_sr_campaign FOREIGN KEY (campaign_id) REFERENCES crm_survey_campaign(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='调查回复';

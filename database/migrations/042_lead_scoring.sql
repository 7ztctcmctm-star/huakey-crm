-- 042_lead_scoring.sql
-- 线索评分功能

-- 评分规则表
CREATE TABLE IF NOT EXISTS crm_score_rule (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL COMMENT '规则名称',
  condition_type VARCHAR(20) NOT NULL COMMENT '条件类型：source来源/action行为/interaction互动',
  condition_field VARCHAR(50) DEFAULT NULL COMMENT '条件字段',
  condition_operator VARCHAR(10) DEFAULT NULL COMMENT '条件运算符：eq/gt/lt/contains',
  condition_value VARCHAR(100) DEFAULT NULL COMMENT '条件值',
  score INT NOT NULL DEFAULT 0 COMMENT '分数',
  status TINYINT(1) DEFAULT 1 COMMENT '状态：1启用 0禁用',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sr_type (condition_type),
  KEY idx_sr_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='评分规则';

-- 客户评分记录表
CREATE TABLE IF NOT EXISTS crm_customer_score_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  rule_id INT DEFAULT NULL COMMENT '触发规则',
  score INT NOT NULL COMMENT '分数变化',
  total_score INT NOT NULL COMMENT '总分',
  remark VARCHAR(200) DEFAULT NULL COMMENT '备注',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_csl_customer (customer_id),
  KEY idx_csl_rule (rule_id),
  CONSTRAINT fk_csl_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE,
  CONSTRAINT fk_csl_rule FOREIGN KEY (rule_id) REFERENCES crm_score_rule(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户评分记录';

-- 客户表添加评分字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'score');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN score INT DEFAULT 0 COMMENT ''客户评分'' AFTER lifecycle_status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 预置评分规则
INSERT IGNORE INTO crm_score_rule (name, condition_type, condition_field, condition_operator, condition_value, score) VALUES
('高价值客户', 'source', 'source', 'eq', '展会', 20),
('主动咨询', 'source', 'source', 'eq', '官网', 15),
('多次跟进', 'action', 'followup_count', 'gt', '5', 25),
('近期活跃', 'interaction', 'last_followup_days', 'lt', '7', 15),
('报价客户', 'action', 'quote_count', 'gt', '0', 20),
('成交客户', 'action', 'contract_count', 'gt', '0', 30);

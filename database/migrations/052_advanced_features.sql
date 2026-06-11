-- 052_advanced_features.sql
-- 高级功能：竞品分析 + 增强预测 + 智能建议

-- 竞争对手表
CREATE TABLE IF NOT EXISTS crm_competitor (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '竞争对手名称',
  website VARCHAR(200) DEFAULT NULL COMMENT '官网',
  industry VARCHAR(50) DEFAULT NULL COMMENT '行业',
  scale VARCHAR(20) DEFAULT NULL COMMENT '规模：large/medium/small/micro',
  headquarters VARCHAR(100) DEFAULT NULL COMMENT '总部所在地',
  strengths TEXT COMMENT '优势JSON数组',
  weaknesses TEXT COMMENT '劣势JSON数组',
  products TEXT COMMENT '主要产品/服务',
  price_range VARCHAR(100) DEFAULT NULL COMMENT '价格区间',
  market_share DECIMAL(5,2) DEFAULT NULL COMMENT '市场份额(%)',
  description TEXT COMMENT '公司简介',
  status TINYINT(1) DEFAULT 1 COMMENT '状态：1活跃 0不再竞争',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_comp_industry (industry),
  KEY idx_comp_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞争对手';

-- 竞品交锋记录表
CREATE TABLE IF NOT EXISTS crm_competitor_encounter (
  id INT PRIMARY KEY AUTO_INCREMENT,
  competitor_id INT NOT NULL COMMENT '竞争对手ID',
  customer_id INT DEFAULT NULL COMMENT '关联客户',
  opportunity_id INT DEFAULT NULL COMMENT '关联商机',
  encounter_type VARCHAR(30) NOT NULL COMMENT '交锋类型：lost/won/competing/encountered',
  our_price DECIMAL(12,2) DEFAULT NULL COMMENT '我方报价',
  their_price DECIMAL(12,2) DEFAULT NULL COMMENT '对方报价',
  win_reason VARCHAR(200) DEFAULT NULL COMMENT '赢单/丢单原因',
  our_advantage TEXT COMMENT '我方优势体现',
  their_advantage TEXT COMMENT '对方优势体现',
  lesson_learned TEXT COMMENT '经验教训',
  encounter_date DATE DEFAULT NULL COMMENT '交锋日期',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ce_competitor (competitor_id),
  KEY idx_ce_customer (customer_id),
  KEY idx_ce_type (encounter_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞品交锋记录';

-- 竞品情报表
CREATE TABLE IF NOT EXISTS crm_competitor_intel (
  id INT PRIMARY KEY AUTO_INCREMENT,
  competitor_id INT NOT NULL COMMENT '竞争对手ID',
  intel_type VARCHAR(20) NOT NULL COMMENT '情报类型：product/pricing/strategy/partnership/market',
  title VARCHAR(200) NOT NULL COMMENT '情报标题',
  content TEXT NOT NULL COMMENT '情报内容',
  source VARCHAR(100) DEFAULT NULL COMMENT '信息来源',
  importance VARCHAR(10) DEFAULT 'medium' COMMENT '重要程度：high/medium/low',
  verified TINYINT(1) DEFAULT 0 COMMENT '是否已验证',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ci_competitor (competitor_id),
  KEY idx_ci_type (intel_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞品情报';

-- 预测模型配置表
CREATE TABLE IF NOT EXISTS crm_prediction_config (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '模型名称',
  model_type VARCHAR(30) NOT NULL COMMENT '模型类型：moving_avg/linear_reg/seasonal',
  config TEXT COMMENT '模型参数JSON',
  accuracy DECIMAL(5,2) DEFAULT NULL COMMENT '准确率',
  last_run_at DATETIME DEFAULT NULL,
  status TINYINT(1) DEFAULT 1,
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预测模型配置';

-- 072_prompt3_scoring_rule.sql
-- Prompt 3: 修复供应商评分任务因 crm_scoring_rule 表缺失报错的问题

CREATE TABLE IF NOT EXISTS crm_scoring_rule (
  id INT PRIMARY KEY AUTO_INCREMENT,
  category VARCHAR(20) NOT NULL COMMENT '评分维度：quality质量/delivery交期/service服务/price价格',
  rule_name VARCHAR(100) NOT NULL COMMENT '规则名称',
  min_score DECIMAL(3,1) NOT NULL DEFAULT 1.0 COMMENT '最低分',
  max_score DECIMAL(3,1) NOT NULL DEFAULT 5.0 COMMENT '最高分',
  weight DECIMAL(4,2) NOT NULL DEFAULT 1.00 COMMENT '权重',
  is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
  sort_order INT DEFAULT 0 COMMENT '排序',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_scoring_category (category),
  KEY idx_scoring_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商评分规则表';

-- 预置默认规则，避免空表导致评分无结果
INSERT IGNORE INTO crm_scoring_rule (category, rule_name, min_score, max_score, weight, sort_order) VALUES
('quality', '合格率 ≥ 98%', 4.5, 5.0, 0.30, 1),
('quality', '合格率 90%-98%', 3.5, 4.5, 0.30, 2),
('quality', '合格率 < 90%', 1.0, 3.0, 0.30, 3),
('delivery', '准时率 ≥ 95%', 4.5, 5.0, 0.25, 4),
('delivery', '准时率 80%-95%', 3.0, 4.5, 0.25, 5),
('delivery', '准时率 < 80%', 1.0, 3.0, 0.25, 6),
('service', '服务评分', 3.0, 5.0, 0.25, 7),
('price', '价格竞争力', 2.0, 5.0, 0.20, 8);

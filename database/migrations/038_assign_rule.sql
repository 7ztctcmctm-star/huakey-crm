-- ============================================================
-- 迁移 038: 客户自动分配规则表
-- 日期: 2026-06-04
-- 数据库: MySQL 8.0
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_assign_rule (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_name VARCHAR(100) NOT NULL COMMENT '规则名称',
  assign_type ENUM('round_robin', 'by_source', 'by_region') NOT NULL COMMENT '分配方式: round_robin=轮询, by_source=按来源, by_region=按区域',
  source_value VARCHAR(100) DEFAULT NULL COMMENT '来源值（by_source时使用）',
  region_value VARCHAR(100) DEFAULT NULL COMMENT '区域值（by_region时使用）',
  user_ids JSON NOT NULL COMMENT '可分配的用户ID列表',
  last_assigned_index INT DEFAULT 0 COMMENT '上次分配的索引（轮询用）',
  priority INT DEFAULT 0 COMMENT '优先级（越大越优先）',
  is_active TINYINT DEFAULT 1 COMMENT '是否启用: 1=启用, 0=禁用',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户自动分配规则';

-- 索引
CREATE INDEX idx_assign_rule_active ON crm_assign_rule(is_active, priority DESC);

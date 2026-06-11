-- 045_report_enhancements.sql
-- 报表分析增强：自定义报表配置表

CREATE TABLE IF NOT EXISTS crm_report_config (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '报表名称',
  description VARCHAR(200) DEFAULT NULL COMMENT '报表说明',
  report_type VARCHAR(30) NOT NULL COMMENT '报表类型：table/bar/line/pie',
  data_source VARCHAR(50) NOT NULL COMMENT '数据来源：customer/contract/payment/purchase/opportunity',
  columns_config TEXT COMMENT '列配置JSON',
  filter_config TEXT COMMENT '筛选条件JSON',
  chart_config TEXT COMMENT '图表配置JSON',
  is_public TINYINT(1) DEFAULT 0 COMMENT '是否公开',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_rc_type (report_type),
  KEY idx_rc_source (data_source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='自定义报表配置';

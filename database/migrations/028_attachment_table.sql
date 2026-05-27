-- 通用附件表（支持工单、跟进记录等）
CREATE TABLE IF NOT EXISTS crm_attachment (
  id INT AUTO_INCREMENT PRIMARY KEY,
  business_type VARCHAR(50) NOT NULL COMMENT '关联业务类型: service_order, follow_up',
  business_id INT NOT NULL COMMENT '关联业务ID',
  file_name VARCHAR(255) NOT NULL COMMENT '原始文件名',
  file_path VARCHAR(500) NOT NULL COMMENT '存储路径',
  file_size INT DEFAULT 0 COMMENT '文件大小(字节)',
  file_type VARCHAR(50) DEFAULT NULL COMMENT '文件MIME类型',
  create_by INT DEFAULT NULL COMMENT '上传人',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_business (business_type, business_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通用附件表';

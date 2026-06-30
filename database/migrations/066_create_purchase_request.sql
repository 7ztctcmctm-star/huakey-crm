-- 采购申请表
CREATE TABLE IF NOT EXISTS crm_purchase_request (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL COMMENT '申请标题',
  request_no VARCHAR(50) UNIQUE COMMENT '申请编号',
  dept_id INT DEFAULT NULL COMMENT '申请部门ID',
  applicant_id INT NOT NULL COMMENT '申请人ID',
  expected_amount DECIMAL(12,2) DEFAULT NULL COMMENT '预计金额',
  reason TEXT COMMENT '申请理由',
  status ENUM('draft','pending','approved','rejected','ordered','cancelled') DEFAULT 'draft' COMMENT '状态',
  approved_by INT DEFAULT NULL COMMENT '审批人ID',
  approved_at DATETIME DEFAULT NULL COMMENT '审批时间',
  reject_reason TEXT COMMENT '驳回/撤销原因',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_applicant (applicant_id),
  INDEX idx_status (status),
  INDEX idx_request_no (request_no),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购申请表';

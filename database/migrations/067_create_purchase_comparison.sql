-- 采购比价主表
CREATE TABLE IF NOT EXISTS crm_purchase_comparison (
  id INT AUTO_INCREMENT PRIMARY KEY,
  comparison_no VARCHAR(50) UNIQUE COMMENT '比价单号',
  request_id INT DEFAULT NULL COMMENT '关联采购申请ID',
  title VARCHAR(200) NOT NULL COMMENT '比价标题',
  product_name VARCHAR(200) DEFAULT NULL COMMENT '产品名称',
  quantity DECIMAL(10,2) DEFAULT NULL COMMENT '数量',
  unit VARCHAR(20) DEFAULT NULL COMMENT '单位',
  status ENUM('draft','completed','cancelled') DEFAULT 'draft' COMMENT '状态',
  selected_supplier_id INT DEFAULT NULL COMMENT '选中供应商ID',
  created_by INT NOT NULL COMMENT '创建人ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_request (request_id),
  INDEX idx_status (status),
  INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购比价单';

-- 采购比价供应商报价明细
CREATE TABLE IF NOT EXISTS crm_purchase_comparison_item (
  id INT AUTO_INCREMENT PRIMARY KEY,
  comparison_id INT NOT NULL COMMENT '比价单ID',
  supplier_id INT NOT NULL COMMENT '供应商ID',
  unit_price DECIMAL(12,2) DEFAULT NULL COMMENT '单价',
  total_price DECIMAL(12,2) DEFAULT NULL COMMENT '总价',
  delivery_days INT DEFAULT NULL COMMENT '交货天数',
  payment_terms VARCHAR(200) DEFAULT NULL COMMENT '付款条件',
  remark TEXT COMMENT '备注',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (comparison_id) REFERENCES crm_purchase_comparison(id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE RESTRICT,
  INDEX idx_comparison (comparison_id),
  INDEX idx_supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购比价供应商报价明细';

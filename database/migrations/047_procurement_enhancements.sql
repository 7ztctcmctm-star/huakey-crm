-- 047_procurement_enhancements.sql
-- 采购增强：库存管理 + 采购计划

-- 库存变动记录表
CREATE TABLE IF NOT EXISTS crm_stock_movement (
  id INT PRIMARY KEY AUTO_INCREMENT,
  product_id INT NOT NULL COMMENT '产品ID',
  movement_type VARCHAR(20) NOT NULL COMMENT '变动类型：in/out/adjust/return',
  quantity INT NOT NULL COMMENT '变动数量',
  before_qty INT NOT NULL COMMENT '变动前库存',
  after_qty INT NOT NULL COMMENT '变动后库存',
  related_type VARCHAR(20) DEFAULT NULL COMMENT '关联类型',
  related_id INT DEFAULT NULL COMMENT '关联单据ID',
  remark VARCHAR(200) DEFAULT NULL,
  operator_id INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sm_product (product_id),
  KEY idx_sm_type (movement_type),
  KEY idx_sm_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存变动记录';

-- 库存预警配置表
CREATE TABLE IF NOT EXISTS crm_stock_alert (
  id INT PRIMARY KEY AUTO_INCREMENT,
  product_id INT NOT NULL UNIQUE COMMENT '产品ID',
  min_qty INT DEFAULT 0 COMMENT '最低库存',
  max_qty INT DEFAULT 9999 COMMENT '最高库存',
  alert_enabled TINYINT(1) DEFAULT 1 COMMENT '启用预警',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sa_product FOREIGN KEY (product_id) REFERENCES crm_product(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存预警配置';

-- 采购计划表
CREATE TABLE IF NOT EXISTS crm_purchase_plan (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plan_no VARCHAR(50) NOT NULL COMMENT '计划编号',
  name VARCHAR(100) NOT NULL COMMENT '计划名称',
  status VARCHAR(20) DEFAULT 'draft' COMMENT '状态',
  total_amount DECIMAL(12,2) DEFAULT 0 COMMENT '计划总金额',
  remark VARCHAR(200) DEFAULT NULL,
  create_by INT DEFAULT NULL,
  approved_by INT DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_pp_status (status),
  KEY idx_pp_no (plan_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购计划';

-- 采购计划明细表
CREATE TABLE IF NOT EXISTS crm_purchase_plan_item (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plan_id INT NOT NULL COMMENT '计划ID',
  product_id INT NOT NULL COMMENT '产品ID',
  supplier_id INT DEFAULT NULL COMMENT '建议供应商',
  quantity INT NOT NULL COMMENT '计划数量',
  unit_price DECIMAL(12,2) DEFAULT NULL COMMENT '预估单价',
  amount DECIMAL(12,2) DEFAULT NULL COMMENT '预估金额',
  reason VARCHAR(200) DEFAULT NULL COMMENT '采购原因',
  status VARCHAR(20) DEFAULT 'pending' COMMENT '状态',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ppi_plan (plan_id),
  CONSTRAINT fk_ppi_plan FOREIGN KEY (plan_id) REFERENCES crm_purchase_plan(id) ON DELETE CASCADE,
  CONSTRAINT fk_ppi_product FOREIGN KEY (product_id) REFERENCES crm_product(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购计划明细';

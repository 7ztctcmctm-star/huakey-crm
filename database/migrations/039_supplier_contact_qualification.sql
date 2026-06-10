-- 039_supplier_contact_qualification.sql
-- 供应商联系人表 & 供应商资质表
-- 列名对齐 backend/routes/supplier.js 的实际引用

-- 供应商联系人表
CREATE TABLE IF NOT EXISTS crm_supplier_contact (
  id INT PRIMARY KEY AUTO_INCREMENT,
  supplier_id INT NOT NULL,
  name VARCHAR(100) NOT NULL COMMENT '联系人姓名',
  position VARCHAR(100) DEFAULT NULL COMMENT '职位',
  department VARCHAR(100) DEFAULT NULL COMMENT '部门',
  phone VARCHAR(20) DEFAULT NULL COMMENT '电话',
  mobile VARCHAR(20) DEFAULT NULL COMMENT '手机',
  email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
  wechat VARCHAR(50) DEFAULT NULL COMMENT '微信',
  role VARCHAR(100) DEFAULT NULL COMMENT '角色/职责',
  is_primary TINYINT(1) DEFAULT 0 COMMENT '是否主要联系人',
  remark TEXT COMMENT '备注',
  create_by INT DEFAULT NULL COMMENT '创建人',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
  KEY idx_sc_supplier (supplier_id),
  CONSTRAINT fk_sc_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商联系人';

-- 供应商资质表
CREATE TABLE IF NOT EXISTS crm_supplier_qualification (
  id INT PRIMARY KEY AUTO_INCREMENT,
  supplier_id INT NOT NULL,
  cert_type VARCHAR(50) DEFAULT NULL COMMENT '资质类型',
  cert_name VARCHAR(200) NOT NULL COMMENT '资质名称',
  cert_no VARCHAR(100) DEFAULT NULL COMMENT '证书编号',
  issue_date DATE DEFAULT NULL COMMENT '发证日期',
  expire_date DATE DEFAULT NULL COMMENT '到期日期',
  issuing_authority VARCHAR(200) DEFAULT NULL COMMENT '发证机关',
  file_path VARCHAR(500) DEFAULT NULL COMMENT '附件路径',
  status TINYINT(1) DEFAULT 1 COMMENT '状态：1有效 0过期',
  remark TEXT COMMENT '备注',
  create_by INT DEFAULT NULL COMMENT '创建人',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
  KEY idx_sq_supplier (supplier_id),
  CONSTRAINT fk_sq_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商资质';

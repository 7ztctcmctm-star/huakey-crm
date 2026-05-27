-- ============================================================
-- 供应商管理模块数据库表
-- ============================================================

USE huakey_crm;

-- 1. 供应商主表
CREATE TABLE IF NOT EXISTS crm_supplier (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    supplier_no VARCHAR(50) NOT NULL COMMENT '供应商编号',
    name VARCHAR(200) NOT NULL COMMENT '供应商名称',
    short_name VARCHAR(100) DEFAULT NULL COMMENT '简称',
    type ENUM('生产', '贸易', '服务') DEFAULT '贸易' COMMENT '类型',
    industry VARCHAR(100) DEFAULT NULL COMMENT '所属行业',
    level ENUM('核心', '重点', '普通', '备用') DEFAULT '普通' COMMENT '等级',
    status TINYINT DEFAULT 1 COMMENT '状态：1=合作中 2=暂停 3=终止',
    rating DECIMAL(2,1) DEFAULT 0.0 COMMENT '综合评分（0-5）',
    contact_person VARCHAR(100) DEFAULT NULL COMMENT '主要联系人',
    contact_phone VARCHAR(20) DEFAULT NULL COMMENT '联系电话',
    contact_email VARCHAR(100) DEFAULT NULL COMMENT '联系邮箱',
    address VARCHAR(500) DEFAULT NULL COMMENT '地址',
    payment_terms VARCHAR(200) DEFAULT NULL COMMENT '结算方式',
    delivery_days INT DEFAULT NULL COMMENT '交货周期（天）',
    remark TEXT COMMENT '备注',
    owner_id INT DEFAULT NULL COMMENT '负责人ID',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',

    CONSTRAINT fk_supplier_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_supplier_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_supplier_no (supplier_no),
    INDEX idx_supplier_name (name),
    INDEX idx_supplier_type (type),
    INDEX idx_supplier_level (level),
    INDEX idx_supplier_status (status),
    INDEX idx_supplier_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商表';

-- 2. 供应商联系人员表
CREATE TABLE IF NOT EXISTS crm_supplier_contact (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    supplier_id INT NOT NULL COMMENT '供应商ID',
    name VARCHAR(100) NOT NULL COMMENT '姓名',
    position VARCHAR(100) DEFAULT NULL COMMENT '职位',
    department VARCHAR(100) DEFAULT NULL COMMENT '部门',
    phone VARCHAR(20) DEFAULT NULL COMMENT '电话',
    mobile VARCHAR(20) DEFAULT NULL COMMENT '手机',
    email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
    wechat VARCHAR(50) DEFAULT NULL COMMENT '微信',
    role ENUM('决策人', '对接人', '财务', '技术', '其他') DEFAULT '对接人' COMMENT '角色',
    is_primary TINYINT DEFAULT 0 COMMENT '是否主要联系人：0=否 1=是',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    CONSTRAINT fk_contact_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_contact_supplier (supplier_id),
    INDEX idx_contact_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商联系人表';

-- 3. 供应商资质证照表
CREATE TABLE IF NOT EXISTS crm_supplier_qualification (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    supplier_id INT NOT NULL COMMENT '供应商ID',
    cert_type VARCHAR(100) NOT NULL COMMENT '证照类型（营业执照/许可证/认证等）',
    cert_no VARCHAR(100) DEFAULT NULL COMMENT '证照编号',
    cert_name VARCHAR(200) DEFAULT NULL COMMENT '证照名称',
    issue_date DATE DEFAULT NULL COMMENT '发证日期',
    expire_date DATE DEFAULT NULL COMMENT '有效期至',
    issuing_authority VARCHAR(200) DEFAULT NULL COMMENT '发证机构',
    file_path VARCHAR(500) DEFAULT NULL COMMENT '扫描件路径',
    status TINYINT DEFAULT 1 COMMENT '状态：1=有效 2=即将到期 3=已过期',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    CONSTRAINT fk_qual_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_qual_supplier (supplier_id),
    INDEX idx_qual_type (cert_type),
    INDEX idx_qual_expire (expire_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商资质证照表';

-- 4. 供应商评分记录表
CREATE TABLE IF NOT EXISTS crm_supplier_rating (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    supplier_id INT NOT NULL COMMENT '供应商ID',
    quality_score DECIMAL(2,1) DEFAULT 0.0 COMMENT '质量评分（0-5）',
    delivery_score DECIMAL(2,1) DEFAULT 0.0 COMMENT '交期评分（0-5）',
    service_score DECIMAL(2,1) DEFAULT 0.0 COMMENT '服务评分（0-5）',
    price_score DECIMAL(2,1) DEFAULT 0.0 COMMENT '价格评分（0-5）',
    total_score DECIMAL(2,1) DEFAULT 0.0 COMMENT '总分（0-5）',
    rating_period VARCHAR(20) NOT NULL COMMENT '评分周期（如2024-Q1）',
    evaluator_id INT DEFAULT NULL COMMENT '评估人ID',
    remark TEXT COMMENT '评估说明',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    CONSTRAINT fk_rating_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_rating_evaluator FOREIGN KEY (evaluator_id) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_rating_supplier (supplier_id),
    INDEX idx_rating_period (rating_period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商评分记录表';

-- 5. 客户-供应商关联表
CREATE TABLE IF NOT EXISTS crm_customer_supplier_relation (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    supplier_id INT NOT NULL COMMENT '供应商ID',
    relationship_type ENUM('主要', '次要', '禁用') DEFAULT '主要' COMMENT '关联类型',
    effective_date DATE DEFAULT NULL COMMENT '生效日期',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    CONSTRAINT fk_csr_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_csr_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE CASCADE ON UPDATE CASCADE,

    UNIQUE KEY uk_customer_supplier (customer_id, supplier_id),
    INDEX idx_csr_customer (customer_id),
    INDEX idx_csr_supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户供应商关联表';

-- 初始化数据：插入示例供应商
INSERT INTO crm_supplier (supplier_no, name, short_name, type, industry, level, status, rating, contact_person, contact_phone, owner_id, create_by) VALUES
('SUP-20240101-001', '深圳市华强电子有限公司', '华强电子', '生产', '电子元器件', '核心', 1, 4.5, '张经理', '13800138001', 1, 1),
('SUP-20240102-002', '广州通达物流有限公司', '通达物流', '服务', '物流运输', '重点', 1, 4.0, '李主管', '13900139002', 1, 1);

-- ============================================================
-- 采购管理模块建表
-- 日期: 2026-05-21
-- ============================================================

USE huakey_crm;

-- 1. 采购订单主表
CREATE TABLE IF NOT EXISTS crm_purchase_order (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_no VARCHAR(50) NOT NULL COMMENT '采购单号 PO-YYMMDD-XXX',
    supplier_id INT NOT NULL COMMENT '供应商ID',
    title VARCHAR(200) NOT NULL COMMENT '采购标题',
    type VARCHAR(20) DEFAULT '常规' COMMENT '类型：常规/紧急/样品/返修',
    expected_date DATE DEFAULT NULL COMMENT '预计到货日期',
    payment_terms VARCHAR(100) DEFAULT NULL COMMENT '付款条款',
    delivery_address VARCHAR(500) DEFAULT NULL COMMENT '交货地址',
    remark VARCHAR(2000) DEFAULT NULL COMMENT '备注',
    total_amount DECIMAL(15, 2) DEFAULT 0.00 COMMENT '商品总金额(不含税)',
    tax_rate DECIMAL(5, 2) DEFAULT 13.00 COMMENT '税率%',
    tax_amount DECIMAL(15, 2) DEFAULT 0.00 COMMENT '税额',
    total_with_tax DECIMAL(15, 2) DEFAULT 0.00 COMMENT '含税总金额',
    actual_date DATE DEFAULT NULL COMMENT '实际到货日期',
    owner_id INT DEFAULT NULL COMMENT '采购负责人ID',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    status VARCHAR(20) DEFAULT '草稿' COMMENT '状态：草稿/待审核/已确认/部分收货/已完成/已取消',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE RESTRICT,
    CONSTRAINT fk_po_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL,
    CONSTRAINT fk_po_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL,

    UNIQUE INDEX idx_po_no (order_no),
    INDEX idx_po_supplier (supplier_id),
    INDEX idx_po_status (status),
    INDEX idx_po_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购订单表';

-- 2. 采购订单明细表
CREATE TABLE IF NOT EXISTS crm_purchase_item (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL COMMENT '采购单ID',
    product_name VARCHAR(200) NOT NULL COMMENT '产品名称',
    product_spec VARCHAR(200) DEFAULT NULL COMMENT '规格型号',
    unit VARCHAR(20) DEFAULT '个' COMMENT '单位',
    quantity DECIMAL(12, 3) NOT NULL COMMENT '采购数量',
    unit_price DECIMAL(12, 4) NOT NULL COMMENT '单价',
    discount_rate DECIMAL(5, 2) DEFAULT 0.00 COMMENT '折扣率%',
    discount_amount DECIMAL(15, 2) DEFAULT 0.00 COMMENT '折扣金额',
    amount DECIMAL(15, 2) NOT NULL COMMENT '小计金额',
    received_qty DECIMAL(12, 3) DEFAULT 0.000 COMMENT '已收货数量',
    quality_status VARCHAR(20) DEFAULT '待检' COMMENT '质检状态：待检/合格/不合格',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',

    CONSTRAINT fk_poi_order FOREIGN KEY (order_id) REFERENCES crm_purchase_order(id) ON DELETE CASCADE,

    INDEX idx_poi_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购订单明细表';

-- 3. 采购收货记录表
CREATE TABLE IF NOT EXISTS crm_purchase_receipt (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL COMMENT '采购单ID',
    item_id INT NOT NULL COMMENT '明细项ID',
    receipt_no VARCHAR(50) NOT NULL COMMENT '收货单号 RCV-YYMMDD-XXX',
    quantity DECIMAL(12, 3) NOT NULL COMMENT '本次收货数量',
    quality_check TINYINT DEFAULT 1 COMMENT '是否质检：0=免检 1=质检',
    quality_result VARCHAR(20) DEFAULT '待检' COMMENT '质检结果：合格/不合格/待检',
    defect_desc VARCHAR(500) DEFAULT NULL COMMENT '不良描述',
    warehouse VARCHAR(100) DEFAULT NULL COMMENT '入库仓库',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    operator_id INT DEFAULT NULL COMMENT '操作人ID',
    receive_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '收货时间',

    CONSTRAINT fk_pr_order FOREIGN KEY (order_id) REFERENCES crm_purchase_order(id) ON DELETE CASCADE,
    CONSTRAINT fk_pr_item FOREIGN KEY (item_id) REFERENCES crm_purchase_item(id) ON DELETE CASCADE,
    CONSTRAINT fk_pr_operator FOREIGN KEY (operator_id) REFERENCES sys_user(id) ON DELETE SET NULL,

    UNIQUE INDEX idx_pr_no (receipt_no),
    INDEX idx_pr_order (order_id),
    INDEX idx_pr_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购收货记录表';

-- 4. 采购付款记录表
CREATE TABLE IF NOT EXISTS crm_purchase_payment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL COMMENT '采购单ID',
    amount DECIMAL(15, 2) NOT NULL COMMENT '付款金额',
    pay_method VARCHAR(50) DEFAULT NULL COMMENT '付款方式',
    pay_date DATE DEFAULT NULL COMMENT '付款日期',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    payer_id INT DEFAULT NULL COMMENT '付款人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pp_order FOREIGN KEY (order_id) REFERENCES crm_purchase_order(id) ON DELETE CASCADE,
    CONSTRAINT fk_pp_payer FOREIGN KEY (payer_id) REFERENCES sys_user(id) ON DELETE SET NULL,

    INDEX idx_pp_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购付款记录表';

-- 5. 供应商绩效评分规则配置表
CREATE TABLE IF NOT EXISTS crm_scoring_rule (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    category ENUM('quality', 'delivery', 'service', 'price') NOT NULL COMMENT '评分维度',
    rule_name VARCHAR(100) NOT NULL COMMENT '规则名称',
    min_score DECIMAL(2,1) DEFAULT 1.0 COMMENT '最低分',
    max_score DECIMAL(2,1) DEFAULT 5.0 COMMENT '最高分',
    weight DECIMAL(3,2) DEFAULT 0.25 COMMENT '权重(占比)',
    description VARCHAR(500) DEFAULT NULL COMMENT '说明',
    is_active TINYINT DEFAULT 1 COMMENT '是否启用：0=禁用 1=启用',
    sort_order INT DEFAULT 0 COMMENT '排序',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    UNIQUE KEY uk_category_name (category, rule_name),
    INDEX idx_category (category),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商评分规则表';

-- 插入默认评分规则
INSERT IGNORE INTO crm_scoring_rule (category, rule_name, min_score, max_score, weight, description, sort_order) VALUES
('quality', '质量合格率≥98%', 4.5, 5.0, 0.30, '产品合格率达到98%以上', 1),
('quality', '质量合格率95-97%', 3.5, 4.4, 0.30, '产品合格率在95%-97%之间', 2),
('quality', '质量合格率90-94%', 2.5, 3.4, 0.30, '产品合格率在90%-94%之间', 3),
('quality', '质量合格率<90%', 1.0, 2.4, 0.30, '产品合格率低于90%', 4),

('delivery', '准时交付率≥98%', 4.5, 5.0, 0.25, '准时交付率达到98%以上', 1),
('delivery', '准时交付率95-97%', 3.5, 4.4, 0.25, '准时交付率在95%-97%之间', 2),
('delivery', '准时交付率90-94%', 2.5, 3.4, 0.25, '准时交付率在90%-94%之间', 3),
('delivery', '准时交付率<90%', 1.0, 2.4, 0.25, '准时交付率低于90%', 4),

('price', '价格低于市场价5%+', 4.5, 5.0, 0.20, '价格比市场均价低5%以上', 1),
('price', '价格与市场价持平±5%', 3.5, 4.4, 0.20, '价格与市场均价持平或略低', 2),
('price', '价格高于市场价5-15%', 2.5, 3.4, 0.20, '价格高于市场均价5%-15%', 3),
('price', '价格高于市场价15%+', 1.0, 2.4, 0.20, '价格远高于市场均价', 4),

('service', '响应及时、配合度高', 4.5, 5.0, 0.15, '响应迅速，积极配合', 1),
('service', '响应正常', 3.5, 4.4, 0.15, '响应正常，配合度一般', 2),
('service', '响应较慢', 2.5, 3.4, 0.15, '响应较慢，需要催促', 3),
('service', '响应慢、配合度差', 1.0, 2.4, 0.15, '响应很慢，配合度差', 4);

-- 6. 资质到期提醒记录表
CREATE TABLE IF NOT EXISTS crm_qualification_reminder (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    qualification_id INT NOT NULL COMMENT '资质证照ID',
    supplier_id INT NOT NULL COMMENT '供应商ID',
    cert_name VARCHAR(200) NOT NULL COMMENT '证照名称',
    expire_date DATE NOT NULL COMMENT '到期日期',
    days_before INT NOT NULL COMMENT '提前天数提醒',
    reminder_type ENUM('即将到期', '已过期') DEFAULT '即将到期' COMMENT '提醒类型',
    is_notified TINYINT DEFAULT 0 COMMENT '是否已通知：0=未通知 1=已通知',
    notified_at DATETIME DEFAULT NULL COMMENT '通知时间',
    notify_to_user_ids VARCHAR(500) DEFAULT NULL COMMENT '通知的用户ID列表',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    CONSTRAINT fk_reminder_qual FOREIGN KEY (qualification_id) REFERENCES crm_supplier_qualification(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_reminder_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON UPDATE CASCADE,

    INDEX idx_reminder_expire (expire_date),
    INDEX idx_reminder_notified (is_notified),
    INDEX idx_reminder_type (reminder_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='资质到期提醒记录表';

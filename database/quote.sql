USE huakey_crm;

-- 1. 产品表 (如果不存在)
CREATE TABLE IF NOT EXISTS crm_product (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    name VARCHAR(200) NOT NULL COMMENT '产品名称',
    code VARCHAR(50) UNIQUE COMMENT '产品编码',
    category VARCHAR(100) DEFAULT NULL COMMENT '产品分类',
    unit VARCHAR(20) DEFAULT '件' COMMENT '单位',
    price DECIMAL(15,2) DEFAULT 0.00 COMMENT '参考价格',
    cost_price DECIMAL(15,2) DEFAULT 0.00 COMMENT '成本价',
    stock INT DEFAULT 0 COMMENT '库存数量',
    description TEXT COMMENT '产品描述',
    status TINYINT DEFAULT 1 COMMENT '状态(1启用0禁用)',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    INDEX idx_product_code (code),
    INDEX idx_product_category (category),
    INDEX idx_product_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品表';

-- 2. 报价单表
CREATE TABLE IF NOT EXISTS crm_quote (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    quote_no VARCHAR(50) NOT NULL UNIQUE COMMENT '报价单号',
    customer_id INT NOT NULL COMMENT '客户ID',
    amount DECIMAL(15,2) DEFAULT 0.00 COMMENT '总金额',
    discount DECIMAL(5,2) DEFAULT 0.00 COMMENT '折扣(如0.9表示9折)',
    final_amount DECIMAL(15,2) DEFAULT 0.00 COMMENT '折后金额',
    valid_days INT DEFAULT 30 COMMENT '有效期(天)',
    remark TEXT COMMENT '备注',
    status TINYINT DEFAULT 1 COMMENT '状态(1草稿/2已发送/3已确认/4已失效)',
    create_by INT DEFAULT NULL COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',

    CONSTRAINT fk_quote_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_quote_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_quote_discount CHECK (discount >= 0 AND discount <= 1),
    CONSTRAINT chk_quote_status CHECK (status BETWEEN 1 AND 4),
    
    INDEX idx_quote_no (quote_no),
    INDEX idx_quote_customer (customer_id),
    INDEX idx_quote_status (status),
    INDEX idx_quote_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报价单表';

-- 3. 报价单项表
CREATE TABLE IF NOT EXISTS crm_quote_item (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    quote_id INT NOT NULL COMMENT '报价单ID',
    product_id INT NOT NULL COMMENT '产品ID',
    product_name VARCHAR(200) NOT NULL COMMENT '产品名称(快照)',
    product_code VARCHAR(50) DEFAULT NULL COMMENT '产品编码(快照)',
    quantity INT DEFAULT 1 COMMENT '数量',
    unit_price DECIMAL(15,2) DEFAULT 0.00 COMMENT '单价',
    total_price DECIMAL(15,2) DEFAULT 0.00 COMMENT '小计',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    
    CONSTRAINT fk_quote_item_quote FOREIGN KEY (quote_id) REFERENCES crm_quote(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_quote_item_product FOREIGN KEY (product_id) REFERENCES crm_product(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    
    INDEX idx_quote_item_quote (quote_id),
    INDEX idx_quote_item_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报价单项表';

-- 插入产品示例数据
INSERT IGNORE INTO crm_product (name, code, category, unit, price, cost_price, stock, description) VALUES
('UPS不间断电源-10KVA', 'UPS-10KVA', '电源设备', '台', 28000.00, 22000.00, 50, '在线式UPS，输出功率10KVA，支持双市电输入'),
('UPS不间断电源-20KVA', 'UPS-20KVA', '电源设备', '台', 45000.00, 36000.00, 30, '在线式UPS，输出功率20KVA，模块化设计'),
('UPS不间断电源-30KVA', 'UPS-30KVA', '电源设备', '台', 68000.00, 54000.00, 20, '在线式UPS，输出功率30KVA，冗余设计'),
('精密配电柜-PDU-24位', 'PDU-24', '配电设备', '台', 8500.00, 6800.00, 100, '24位PDU，智能监控，远程管理'),
('精密配电柜-PDU-48位', 'PDU-48', '配电设备', '台', 15000.00, 12000.00, 60, '48位PDU，智能监控，远程管理'),
('蓄电池组-12V100AH', 'BAT-12V100', '蓄电池', '组', 1200.00, 950.00, 200, '阀控式铅酸蓄电池，12V100AH'),
('蓄电池组-12V200AH', 'BAT-12V200', '蓄电池', '组', 2200.00, 1750.00, 150, '阀控式铅酸蓄电池，12V200AH'),
('监控模块-SMART', 'MON-SMART', '监控设备', '套', 3500.00, 2800.00, 80, '智能监控模块，支持远程监控告警'),
('防雷器-SPD-40KA', 'SPD-40KA', '防雷设备', '个', 800.00, 640.00, 300, '40KA防雷器，三级保护'),
('电缆线-YJV-3*16', 'CABLE-YJV16', '线缆', '米', 58.00, 46.00, 5000, 'YJV电缆，3芯16平方，铜芯');

-- 插入报价单示例数据
INSERT IGNORE INTO crm_quote (quote_no, customer_id, amount, discount, final_amount, valid_days, remark, status, create_by) VALUES
('QUO-20260515-001', 1, 500000.00, 0.95, 475000.00, 30, '华为5G基站项目报价', 2, 1),
('QUO-20260515-002', 3, 280000.00, 0.92, 257600.00, 15, '比亚迪充电桩项目', 1, 1),
('QUO-20260514-001', 5, 650000.00, 0.88, 572000.00, 45, '阿里云机房配电项目', 3, 1),
('QUO-20260513-001', 2, 180000.00, 0.90, 162000.00, 30, '腾讯总部电源升级', 4, 1);

-- 插入报价单项示例数据
INSERT IGNORE INTO crm_quote_item (quote_id, product_id, product_name, product_code, quantity, unit_price, total_price, remark) VALUES
(1, 1, 'UPS不间断电源-10KVA', 'UPS-10KVA', 10, 26600.00, 266000.00, '含安装调试'),
(1, 6, '蓄电池组-12V100AH', 'BAT-12V100', 40, 1140.00, 45600.00, '配套蓄电池'),
(1, 8, '监控模块-SMART', 'MON-SMART', 10, 3325.00, 33250.00, '智能监控'),
(1, 9, '防雷器-SPD-40KA', 'SPD-40KA', 20, 760.00, 15200.00, '三级防雷'),
(1, 10, '电缆线-YJV-3*16', 'CABLE-YJV16', 1000, 55.10, 55100.00, '项目用线缆'),
(2, 2, 'UPS不间断电源-20KVA', 'UPS-20KVA', 5, 41400.00, 207000.00, '充电桩专用'),
(2, 7, '蓄电池组-12V200AH', 'BAT-12V200', 20, 2024.00, 40480.00, '储能蓄电池'),
(2, 9, '防雷器-SPD-40KA', 'SPD-40KA', 10, 760.00, 7600.00, '防雷保护'),
(3, 3, 'UPS不间断电源-30KVA', 'UPS-30KVA', 15, 59840.00, 897600.00, '数据中心专用'),
(3, 5, '精密配电柜-PDU-48位', 'PDU-48', 20, 13200.00, 264000.00, '智能配电'),
(4, 1, 'UPS不间断电源-10KVA', 'UPS-10KVA', 5, 25200.00, 126000.00, '旧设备升级'),
(4, 4, '精密配电柜-PDU-24位', 'PDU-24', 10, 7650.00, 76500.00, '配电改造');

-- 修正报价单金额（因为是示例数据，需要重新计算）
UPDATE crm_quote q 
SET amount = (SELECT COALESCE(SUM(total_price), 0) FROM crm_quote_item i WHERE i.quote_id = q.id),
    final_amount = (SELECT COALESCE(SUM(total_price), 0) FROM crm_quote_item i WHERE i.quote_id = q.id) * (1 - q.discount);

SELECT '报价单相关表创建完成' AS result;
SELECT COUNT(*) AS product_count FROM crm_product;
SELECT COUNT(*) AS quote_count FROM crm_quote;
SELECT COUNT(*) AS quote_item_count FROM crm_quote_item;

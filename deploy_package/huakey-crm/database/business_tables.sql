-- ============================================================
-- 业务表补充 — 合同、回款、服务工单、公海日志
-- 这些表在 route 中被引用但缺少独立建表脚本
-- ============================================================

USE huakey_crm;

-- 1. 合同表
CREATE TABLE IF NOT EXISTS crm_contract (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    contract_no VARCHAR(50) NOT NULL COMMENT '合同编号',
    customer_id INT NOT NULL COMMENT '客户ID',
    opportunity_id INT DEFAULT NULL COMMENT '关联商机ID',
    amount DECIMAL(15, 2) DEFAULT 0.00 COMMENT '合同金额',
    sign_date DATE DEFAULT NULL COMMENT '签订日期',
    delivery_date DATE DEFAULT NULL COMMENT '交付日期',
    payment_terms VARCHAR(500) DEFAULT NULL COMMENT '付款条款',
    status TINYINT DEFAULT 1 COMMENT '状态：1=执行中 2=已完成 3=已终止',
    remark TEXT COMMENT '备注',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    CONSTRAINT fk_contract_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_contract_opportunity FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_contract_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_contract_no (contract_no),
    INDEX idx_contract_customer (customer_id),
    INDEX idx_contract_status (status),
    INDEX idx_contract_sign_date (sign_date),
    INDEX idx_contract_create_by (create_by),
    INDEX idx_contract_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='合同表';

-- 2. 回款计划表
CREATE TABLE IF NOT EXISTS crm_payment_plan (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    contract_id INT NOT NULL COMMENT '合同ID',
    plan_date DATE NOT NULL COMMENT '计划回款日期',
    plan_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 COMMENT '计划回款金额',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',

    CONSTRAINT fk_plan_contract FOREIGN KEY (contract_id) REFERENCES crm_contract(id) ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_plan_contract (contract_id),
    INDEX idx_plan_date (plan_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='回款计划表';

-- 3. 实际回款表
CREATE TABLE IF NOT EXISTS crm_payment (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    contract_id INT NOT NULL COMMENT '合同ID',
    plan_id INT DEFAULT NULL COMMENT '关联计划ID',
    pay_date DATE NOT NULL COMMENT '回款日期',
    pay_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 COMMENT '回款金额',
    pay_method VARCHAR(50) DEFAULT NULL COMMENT '回款方式',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    CONSTRAINT fk_payment_contract FOREIGN KEY (contract_id) REFERENCES crm_contract(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_payment_plan FOREIGN KEY (plan_id) REFERENCES crm_payment_plan(id) ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_payment_contract (contract_id),
    INDEX idx_payment_plan (plan_id),
    INDEX idx_payment_date (pay_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实际回款表';

-- 4. 服务工单表
CREATE TABLE IF NOT EXISTS crm_service_order (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    order_no VARCHAR(50) NOT NULL COMMENT '工单编号',
    customer_id INT NOT NULL COMMENT '客户ID',
    contract_id INT DEFAULT NULL COMMENT '关联合同ID',
    type VARCHAR(50) DEFAULT NULL COMMENT '工单类型：安装/维修/咨询/投诉/其他',
    title VARCHAR(200) NOT NULL COMMENT '工单标题',
    description TEXT COMMENT '问题描述',
    priority TINYINT DEFAULT 3 COMMENT '优先级：1=紧急 2=高 3=中 4=低',
    status TINYINT DEFAULT 1 COMMENT '状态：1=待处理 2=处理中 3=已完成 4=已关闭 5=已评价',
    assignee_id INT DEFAULT NULL COMMENT '处理人ID',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    finish_desc TEXT COMMENT '处理结果描述',
    finish_time DATETIME DEFAULT NULL COMMENT '完成时间',
    satisfaction TINYINT DEFAULT NULL COMMENT '满意度评分：1-5',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    CONSTRAINT fk_service_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_service_contract FOREIGN KEY (contract_id) REFERENCES crm_contract(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_service_assignee FOREIGN KEY (assignee_id) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_service_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_service_order_no (order_no),
    INDEX idx_service_customer (customer_id),
    INDEX idx_service_contract (contract_id),
    INDEX idx_service_type (type),
    INDEX idx_service_status (status),
    INDEX idx_service_priority (priority),
    INDEX idx_service_assignee (assignee_id),
    INDEX idx_service_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='服务工单表';

-- 5. 公海操作日志表
CREATE TABLE IF NOT EXISTS crm_pool_log (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    action VARCHAR(20) NOT NULL COMMENT '操作：claim=认领 release=释放',
    from_user_id INT DEFAULT NULL COMMENT '原负责人ID',
    to_user_id INT DEFAULT NULL COMMENT '新负责人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',

    CONSTRAINT fk_pool_log_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_pool_log_customer (customer_id),
    INDEX idx_pool_log_action (action),
    INDEX idx_pool_log_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公海操作日志表';

-- ============================================================
-- 铧旗CRM系统 — 完整数据库初始化脚本（群晖NAS专用）
-- 按依赖顺序排列，解决原 initdb 文件字母排序导致的外键冲突问题
-- ============================================================

-- ============================================================
-- 第1部分：基础表（无依赖）
-- 来源: init.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS huakey_crm
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE huakey_crm;

-- 创建用户并授权（Docker 环境下 MYSQL_USER 已自动创建，这里做兼容处理）
CREATE USER IF NOT EXISTS 'crm_user'@'localhost' IDENTIFIED BY 'Huakey@2024';
CREATE USER IF NOT EXISTS 'crm_user'@'%' IDENTIFIED BY 'Huakey@2024';
GRANT ALL PRIVILEGES ON huakey_crm.* TO 'crm_user'@'localhost';
GRANT ALL PRIVILEGES ON huakey_crm.* TO 'crm_user'@'%';
FLUSH PRIVILEGES;

-- 部门表
CREATE TABLE IF NOT EXISTS sys_dept (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '部门ID',
    name VARCHAR(50) NOT NULL COMMENT '部门名称',
    parent_id INT DEFAULT 0 COMMENT '上级部门ID',
    sort INT DEFAULT 0 COMMENT '排序',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_parent_id (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='部门表';

-- 角色表
CREATE TABLE IF NOT EXISTS sys_role (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '角色ID',
    name VARCHAR(50) NOT NULL COMMENT '角色名称',
    code VARCHAR(50) NOT NULL COMMENT '角色编码',
    description VARCHAR(255) DEFAULT NULL COMMENT '描述',
    status TINYINT DEFAULT 1 COMMENT '状态(1正常0禁用)',
    view_all TINYINT DEFAULT 0 COMMENT '查看全部数据(1是0否)',
    manage_all TINYINT DEFAULT 0 COMMENT '管理全部数据(1是0否)',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色表';

-- 用户表
CREATE TABLE IF NOT EXISTS sys_user (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '用户ID',
    username VARCHAR(50) NOT NULL COMMENT '用户名',
    password VARCHAR(255) NOT NULL COMMENT '密码',
    real_name VARCHAR(50) DEFAULT NULL COMMENT '真实姓名',
    phone VARCHAR(20) DEFAULT NULL COMMENT '电话',
    email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
    dept_id INT DEFAULT NULL COMMENT '部门ID',
    role_id INT DEFAULT NULL COMMENT '角色ID',
    status TINYINT DEFAULT 1 COMMENT '状态(1正常0禁用)',
    last_login_time DATETIME DEFAULT NULL COMMENT '最后登录时间',
    last_login_ip VARCHAR(50) DEFAULT NULL COMMENT '最后登录IP',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_username (username),
    KEY idx_dept_id (dept_id),
    KEY idx_role_id (role_id),
    CONSTRAINT fk_user_dept FOREIGN KEY (dept_id) REFERENCES sys_dept(id) ON DELETE SET NULL,
    CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES sys_role(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 初始数据：部门
INSERT INTO sys_dept (name, parent_id, sort) VALUES
('总公司', 0, 1),
('销售部', 1, 1),
('技术部', 1, 2),
('客服部', 1, 3),
('市场部', 1, 4);

-- 初始数据：角色
INSERT INTO sys_role (name, code, description, status, view_all, manage_all) VALUES
('超级管理员', 'super_admin', '系统超级管理员，拥有所有权限', 1, 1, 1),
('管理员', 'admin', '系统管理员', 1, 1, 1),
('销售经理', 'sales_manager', '销售部门经理', 1, 0, 0),
('销售人员', 'sales', '普通销售人员', 1, 0, 0),
('技术人员', 'tech', '技术人员', 1, 0, 0),
('财务人员', 'finance', '财务人员', 1, 0, 0);

-- 初始数据：管理员账号（密码: admin123）
INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status) VALUES
('admin', '$2b$10$eY0sRG.fsdRu5RO/HHMDrOVBEuFwE.BbPfe66qnMi3DqP0BIbofry', '系统管理员', '13800138000', 'admin@huakey.com', 1, 1, 1);

-- ============================================================
-- 第2部分：客户管理表（依赖: sys_user）
-- 来源: customer.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_customer (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    company_name VARCHAR(200) NOT NULL COMMENT '公司名称',
    contact_name VARCHAR(50) DEFAULT NULL COMMENT '联系人姓名',
    phone VARCHAR(20) DEFAULT NULL COMMENT '电话',
    email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
    address VARCHAR(500) DEFAULT NULL COMMENT '地址',
    industry VARCHAR(50) DEFAULT NULL COMMENT '所属行业',
    source VARCHAR(50) DEFAULT NULL COMMENT '客户来源',
    level VARCHAR(20) DEFAULT 'C' COMMENT '客户等级（A/B/C/D）',
    owner_id INT DEFAULT NULL COMMENT '负责销售ID',
    status TINYINT DEFAULT 1 COMMENT '状态（1潜在客户/2成交客户/3流失客户）',
    pool_status TINYINT DEFAULT 0 COMMENT '公海状态：0=归属销售 1=在公海',
    protect_until DATETIME DEFAULT NULL COMMENT '认领保护截止时间',
    last_follow_time DATETIME DEFAULT NULL COMMENT '最近跟进时间',
    remark TEXT COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
    CONSTRAINT fk_customer_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户表';

CREATE TABLE IF NOT EXISTS crm_contact (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    name VARCHAR(50) NOT NULL COMMENT '姓名',
    position VARCHAR(50) DEFAULT NULL COMMENT '职位',
    phone VARCHAR(20) DEFAULT NULL COMMENT '电话',
    email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
    wechat VARCHAR(50) DEFAULT NULL COMMENT '微信',
    is_decision TINYINT DEFAULT 0 COMMENT '是否决策人（1是0否）',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
    CONSTRAINT fk_contact_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='联系人表';

CREATE INDEX idx_customer_company_name ON crm_customer(company_name);
CREATE INDEX idx_customer_phone ON crm_customer(phone);
CREATE INDEX idx_customer_industry ON crm_customer(industry);
CREATE INDEX idx_customer_source ON crm_customer(source);
CREATE INDEX idx_customer_level ON crm_customer(level);
CREATE INDEX idx_customer_owner_id ON crm_customer(owner_id);
CREATE INDEX idx_customer_status ON crm_customer(status);
CREATE INDEX idx_customer_create_time ON crm_customer(create_time);
CREATE INDEX idx_customer_pool_status ON crm_customer(pool_status);
CREATE INDEX idx_customer_last_follow ON crm_customer(last_follow_time);
CREATE INDEX idx_cust_owner_status_ctime ON crm_customer(owner_id, status, create_time);
CREATE INDEX idx_contact_customer_id ON crm_contact(customer_id);
CREATE INDEX idx_contact_name ON crm_contact(name);
CREATE INDEX idx_contact_phone ON crm_contact(phone);

-- ============================================================
-- 第3部分：商机表（依赖: crm_customer, sys_user）
-- 来源: opportunity.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_opportunity (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    name VARCHAR(200) NOT NULL COMMENT '商机名称',
    expected_amount DECIMAL(15,2) DEFAULT 0.00 COMMENT '预计金额',
    expected_date DATE DEFAULT NULL COMMENT '预计成交日期',
    stage TINYINT DEFAULT 1 COMMENT '阶段：1询盘 2需求确认 3方案报价 4谈判 5成交 6失败',
    win_rate TINYINT DEFAULT 10 COMMENT '赢单率',
    remark TEXT COMMENT '备注',
    owner_id INT DEFAULT NULL COMMENT '负责人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
    CONSTRAINT fk_opp_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_opp_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商机表';

CREATE INDEX idx_opp_customer ON crm_opportunity(customer_id);
CREATE INDEX idx_opp_owner ON crm_opportunity(owner_id);
CREATE INDEX idx_opp_stage ON crm_opportunity(stage);
CREATE INDEX idx_opp_expected_date ON crm_opportunity(expected_date);
CREATE INDEX idx_opp_owner_stage_ctime ON crm_opportunity(owner_id, stage, create_time);

-- ============================================================
-- 第4部分：跟进记录表（依赖: crm_customer, crm_contact, sys_user）
-- 来源: follow_up.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_follow_up (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    contact_id INT DEFAULT NULL COMMENT '联系人ID',
    follow_type VARCHAR(20) DEFAULT '电话' COMMENT '跟进方式（电话/拜访/微信/邮件/其他）',
    content TEXT COMMENT '跟进内容',
    next_time DATETIME DEFAULT NULL COMMENT '下次提醒时间',
    next_content VARCHAR(500) DEFAULT NULL COMMENT '下次计划',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    CONSTRAINT fk_follow_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_follow_contact FOREIGN KEY (contact_id) REFERENCES crm_contact(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_follow_user FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='跟进记录表';

CREATE INDEX idx_follow_customer ON crm_follow_up(customer_id);
CREATE INDEX idx_follow_create_by ON crm_follow_up(create_by);
CREATE INDEX idx_follow_next_time ON crm_follow_up(next_time);
CREATE INDEX idx_follow_create_time ON crm_follow_up(create_time);

-- ============================================================
-- 第5部分：产品和报价表（依赖: crm_customer, sys_user）
-- 来源: quote.sql
-- ============================================================

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

CREATE TABLE IF NOT EXISTS crm_quote (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    quote_no VARCHAR(50) NOT NULL UNIQUE COMMENT '报价单号',
    customer_id INT NOT NULL COMMENT '客户ID',
    opportunity_id INT DEFAULT NULL COMMENT '关联商机ID',
    amount DECIMAL(15,2) DEFAULT 0.00 COMMENT '总金额',
    discount DECIMAL(5,2) DEFAULT 0.00 COMMENT '折扣',
    final_amount DECIMAL(15,2) DEFAULT 0.00 COMMENT '折后金额',
    valid_days INT DEFAULT 30 COMMENT '有效期(天)',
    remark TEXT COMMENT '备注',
    status TINYINT DEFAULT 1 COMMENT '状态(1草稿/2已发送/3已确认/4已失效)',
    create_by INT DEFAULT NULL COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
    CONSTRAINT fk_quote_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_quote_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报价单表';

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

CREATE INDEX idx_quote_no ON crm_quote(quote_no);
CREATE INDEX idx_quote_customer ON crm_quote(customer_id);
CREATE INDEX idx_quote_status ON crm_quote(status);
CREATE INDEX idx_quote_create_time ON crm_quote(create_time);

-- ============================================================
-- 第6部分：合同和回款表（依赖: crm_customer, crm_opportunity, sys_user）
-- 来源: business_tables.sql
-- ============================================================

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
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
    CONSTRAINT fk_contract_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_contract_opportunity FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_contract_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_contract_no (contract_no),
    INDEX idx_contract_customer (customer_id),
    INDEX idx_contract_status (status),
    INDEX idx_contract_sign_date (sign_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='合同表';

CREATE TABLE IF NOT EXISTS crm_payment (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    contract_id INT NOT NULL COMMENT '合同ID',
    amount DECIMAL(15,2) NOT NULL COMMENT '回款金额',
    payment_date DATE NOT NULL COMMENT '回款日期',
    payment_method VARCHAR(50) DEFAULT '银行转账' COMMENT '回款方式',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    CONSTRAINT fk_payment_contract FOREIGN KEY (contract_id) REFERENCES crm_contract(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_payment_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_payment_contract (contract_id),
    INDEX idx_payment_date (payment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='回款记录表';

CREATE TABLE IF NOT EXISTS crm_service_order (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    contract_id INT DEFAULT NULL COMMENT '关联合同ID',
    title VARCHAR(200) NOT NULL COMMENT '工单标题',
    description TEXT COMMENT '问题描述',
    priority TINYINT DEFAULT 2 COMMENT '优先级：1=紧急 2=普通 3=低',
    status TINYINT DEFAULT 1 COMMENT '状态：1=待处理 2=处理中 3=已完成 4=已关闭',
    handler_id INT DEFAULT NULL COMMENT '处理人ID',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
    CONSTRAINT fk_service_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_service_contract FOREIGN KEY (contract_id) REFERENCES crm_contract(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_service_handler FOREIGN KEY (handler_id) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_service_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_service_customer (customer_id),
    INDEX idx_service_status (status),
    INDEX idx_service_handler (handler_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='售后服务工单表';

CREATE TABLE IF NOT EXISTS crm_pool_log (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    action VARCHAR(20) NOT NULL COMMENT '操作：claim/release/assign',
    from_user_id INT DEFAULT NULL COMMENT '原负责人',
    to_user_id INT DEFAULT NULL COMMENT '新负责人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    CONSTRAINT fk_poollog_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_poollog_customer (customer_id),
    INDEX idx_poollog_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公海操作日志';

-- ============================================================
-- 第7部分：采购管理表（依赖: crm_product, sys_user）
-- 来源: purchase_tables.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_supplier (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    supplier_no VARCHAR(50) NOT NULL COMMENT '供应商编号',
    name VARCHAR(200) NOT NULL COMMENT '供应商名称',
    contact_name VARCHAR(50) DEFAULT NULL COMMENT '联系人',
    phone VARCHAR(20) DEFAULT NULL COMMENT '电话',
    email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
    address VARCHAR(500) DEFAULT NULL COMMENT '地址',
    category VARCHAR(100) DEFAULT NULL COMMENT '供应类别',
    rating TINYINT DEFAULT 3 COMMENT '评级(1-5)',
    status TINYINT DEFAULT 1 COMMENT '状态(1正常0禁用)',
    remark TEXT COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
    UNIQUE KEY uk_supplier_no (supplier_no),
    INDEX idx_supplier_name (name),
    INDEX idx_supplier_category (category),
    INDEX idx_supplier_rating (rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商表';

CREATE TABLE IF NOT EXISTS crm_purchase_order (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    order_no VARCHAR(50) NOT NULL COMMENT '采购单号',
    supplier_id INT NOT NULL COMMENT '供应商ID',
    total_amount DECIMAL(15,2) DEFAULT 0.00 COMMENT '总金额',
    status TINYINT DEFAULT 1 COMMENT '状态：1=待审批 2=已审批 3=已收货 4=已取消',
    order_date DATE DEFAULT NULL COMMENT '下单日期',
    delivery_date DATE DEFAULT NULL COMMENT '预计交货日期',
    remark TEXT COMMENT '备注',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
    CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_po_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,
    UNIQUE KEY uk_order_no (order_no),
    INDEX idx_po_supplier (supplier_id),
    INDEX idx_po_status (status),
    INDEX idx_po_date (order_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购订单表';

CREATE TABLE IF NOT EXISTS crm_purchase_item (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    order_id INT NOT NULL COMMENT '采购单ID',
    product_id INT NOT NULL COMMENT '产品ID',
    product_name VARCHAR(200) NOT NULL COMMENT '产品名称(快照)',
    quantity INT DEFAULT 1 COMMENT '数量',
    unit_price DECIMAL(15,2) DEFAULT 0.00 COMMENT '单价',
    total_price DECIMAL(15,2) DEFAULT 0.00 COMMENT '小计',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    CONSTRAINT fk_pi_order FOREIGN KEY (order_id) REFERENCES crm_purchase_order(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_pi_product FOREIGN KEY (product_id) REFERENCES crm_product(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_pi_order (order_id),
    INDEX idx_pi_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购订单明细表';

-- ============================================================
-- 第8部分：系统扩展表
-- ============================================================

-- 权限表
CREATE TABLE IF NOT EXISTS sys_permission (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL COMMENT '权限名称',
    code VARCHAR(100) NOT NULL COMMENT '权限编码',
    type VARCHAR(20) DEFAULT 'menu' COMMENT '类型: menu/button/api',
    parent_id INT DEFAULT 0 COMMENT '父权限ID',
    path VARCHAR(200) DEFAULT NULL COMMENT '路由路径',
    icon VARCHAR(100) DEFAULT NULL COMMENT '图标',
    sort INT DEFAULT 0 COMMENT '排序',
    is_visible TINYINT DEFAULT 1 COMMENT '是否可见',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_code (code),
    INDEX idx_parent_id (parent_id),
    INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限表';

-- 角色权限关联表
CREATE TABLE IF NOT EXISTS sys_role_permission (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES sys_role(id) ON DELETE CASCADE,
    CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES sys_permission(id) ON DELETE CASCADE,
    UNIQUE KEY uk_role_permission (role_id, permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色权限关联表';

-- 数据权限表
CREATE TABLE IF NOT EXISTS sys_data_permission (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL,
    module VARCHAR(50) NOT NULL COMMENT '模块名',
    data_scope VARCHAR(20) DEFAULT 'all' COMMENT '数据范围: all/dept/self/custom',
    custom_dept_ids VARCHAR(500) DEFAULT NULL COMMENT '自定义部门ID列表(逗号分隔)',
    CONSTRAINT fk_dp_role FOREIGN KEY (role_id) REFERENCES sys_role(id) ON DELETE CASCADE,
    UNIQUE KEY uk_role_module (role_id, module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据权限表';

-- 操作日志表
CREATE TABLE IF NOT EXISTS sys_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    module VARCHAR(50) DEFAULT NULL COMMENT '模块',
    action VARCHAR(100) DEFAULT NULL COMMENT '操作',
    method VARCHAR(10) DEFAULT NULL COMMENT '请求方法',
    url VARCHAR(500) DEFAULT NULL COMMENT '请求URL',
    params TEXT COMMENT '请求参数',
    ip_address VARCHAR(50) DEFAULT NULL COMMENT 'IP地址',
    user_id INT DEFAULT NULL COMMENT '用户ID',
    user_name VARCHAR(50) DEFAULT NULL COMMENT '用户名',
    description VARCHAR(500) DEFAULT NULL COMMENT '操作描述',
    status TINYINT DEFAULT 1 COMMENT '状态(1成功0失败)',
    error_msg TEXT COMMENT '错误信息',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_user_id (user_id),
    INDEX idx_module (module),
    INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志表';

-- 系统配置表
CREATE TABLE IF NOT EXISTS sys_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL COMMENT '配置键',
    config_value TEXT COMMENT '配置值',
    description VARCHAR(255) DEFAULT NULL COMMENT '描述',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置表';

-- 跟进计划表
CREATE TABLE IF NOT EXISTS crm_follow_plan (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL COMMENT '客户ID',
    plan_time DATETIME NOT NULL COMMENT '计划时间',
    plan_content VARCHAR(500) NOT NULL COMMENT '计划内容',
    status TINYINT DEFAULT 0 COMMENT '状态: 0=待执行 1=已完成 2=已取消',
    create_by INT DEFAULT NULL COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fp_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE,
    CONSTRAINT fk_fp_user FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL,
    INDEX idx_fp_customer (customer_id),
    INDEX idx_fp_time (plan_time),
    INDEX idx_fp_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='跟进计划表';

-- 提醒表
CREATE TABLE IF NOT EXISTS crm_reminder (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT '用户ID',
    type VARCHAR(20) NOT NULL COMMENT '类型: follow/overdue/today/tomorrow',
    title VARCHAR(200) NOT NULL COMMENT '标题',
    content VARCHAR(500) DEFAULT NULL COMMENT '内容',
    related_id INT DEFAULT NULL COMMENT '关联ID',
    related_type VARCHAR(50) DEFAULT NULL COMMENT '关联类型',
    remind_time DATETIME NOT NULL COMMENT '提醒时间',
    is_read TINYINT DEFAULT 0 COMMENT '是否已读',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reminder_user FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE CASCADE,
    INDEX idx_reminder_user (user_id),
    INDEX idx_reminder_time (remind_time),
    INDEX idx_reminder_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='提醒表';

-- 通知表
CREATE TABLE IF NOT EXISTS sys_notification (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT '目标用户',
    title VARCHAR(200) NOT NULL COMMENT '标题',
    content TEXT COMMENT '内容',
    type VARCHAR(20) DEFAULT 'system' COMMENT '类型: system/task/approval',
    is_read TINYINT DEFAULT 0 COMMENT '是否已读',
    related_id INT DEFAULT NULL COMMENT '关联ID',
    related_type VARCHAR(50) DEFAULT NULL COMMENT '关联类型',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE CASCADE,
    INDEX idx_notif_user (user_id),
    INDEX idx_notif_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知表';

-- 销售目标表
CREATE TABLE IF NOT EXISTS crm_sales_target (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT '用户ID',
    year INT NOT NULL COMMENT '年份',
    month INT NOT NULL COMMENT '月份',
    target_amount DECIMAL(15,2) NOT NULL COMMENT '目标金额',
    actual_amount DECIMAL(15,2) DEFAULT 0.00 COMMENT '实际完成金额',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_target_user FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_year_month (user_id, year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='销售目标表';

-- 发票表
CREATE TABLE IF NOT EXISTS crm_invoice (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contract_id INT NOT NULL COMMENT '合同ID',
    invoice_no VARCHAR(50) NOT NULL COMMENT '发票号',
    amount DECIMAL(15,2) NOT NULL COMMENT '发票金额',
    invoice_date DATE NOT NULL COMMENT '开票日期',
    type VARCHAR(20) DEFAULT '增值税专用发票' COMMENT '发票类型',
    status TINYINT DEFAULT 1 COMMENT '状态: 1=已开 2=已寄 3=已作废',
    remark VARCHAR(500) DEFAULT NULL,
    create_by INT DEFAULT NULL,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invoice_contract FOREIGN KEY (contract_id) REFERENCES crm_contract(id) ON DELETE CASCADE,
    CONSTRAINT fk_invoice_user FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL,
    INDEX idx_invoice_contract (contract_id),
    INDEX idx_invoice_no (invoice_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='发票表';

-- 回收站表
CREATE TABLE IF NOT EXISTS sys_recycle_bin (
    id INT AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL COMMENT '表名',
    record_id INT NOT NULL COMMENT '记录ID',
    data_snapshot JSON COMMENT '数据快照',
    deleted_by INT DEFAULT NULL COMMENT '删除人',
    deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '删除时间',
    CONSTRAINT fk_recycle_user FOREIGN KEY (deleted_by) REFERENCES sys_user(id) ON DELETE SET NULL,
    INDEX idx_recycle_table (table_name),
    INDEX idx_recycle_time (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='回收站';

-- 阶段日志表
CREATE TABLE IF NOT EXISTS crm_opportunity_stage_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    opportunity_id INT NOT NULL COMMENT '商机ID',
    from_stage TINYINT DEFAULT NULL COMMENT '原阶段',
    to_stage TINYINT NOT NULL COMMENT '新阶段',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_by INT DEFAULT NULL COMMENT '操作人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_oslog_opportunity FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE CASCADE,
    CONSTRAINT fk_oslog_user FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL,
    INDEX idx_oslog_opportunity (opportunity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商机阶段变更日志';

-- 附件表
CREATE TABLE IF NOT EXISTS sys_attachment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    related_id INT NOT NULL COMMENT '关联ID',
    related_type VARCHAR(50) NOT NULL COMMENT '关联类型(contract/quote/...)',
    file_name VARCHAR(200) NOT NULL COMMENT '文件名',
    file_path VARCHAR(500) NOT NULL COMMENT '文件路径',
    file_size INT DEFAULT 0 COMMENT '文件大小(字节)',
    upload_by INT DEFAULT NULL COMMENT '上传人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_attach_user FOREIGN KEY (upload_by) REFERENCES sys_user(id) ON DELETE SET NULL,
    INDEX idx_attach_related (related_id, related_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='附件表';

-- 数据迁移追踪表
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    version VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据库迁移追踪表';

-- 标记基线迁移已执行（因为本脚本已包含所有表结构）
INSERT IGNORE INTO schema_migrations (version, name) VALUES ('001', '001_init_baseline.sql');

-- ============================================================
-- 完成提示
-- ============================================================
SELECT '========================================' AS '';
SELECT '铧旗CRM 数据库初始化完成！' AS result;
SELECT '默认管理员: admin / admin123' AS login_info;
SELECT '========================================' AS '';

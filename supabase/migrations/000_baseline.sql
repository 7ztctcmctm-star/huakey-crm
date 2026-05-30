-- ============================================================
-- 基线迁移: 所有基础建表 + 种子数据
-- 对应原 MySQL 文件: init.sql, customer.sql, follow_up.sql,
--   opportunity.sql, quote.sql, business_tables.sql,
--   suppliers.sql, purchase_tables.sql
-- ============================================================

-- ============================================================
-- 通用触发器函数（替代 MySQL ON UPDATE CURRENT_TIMESTAMP）
-- ============================================================
CREATE OR REPLACE FUNCTION update_update_time()
RETURNS TRIGGER AS $$
BEGIN
    NEW.update_time = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. 系统基础表
-- ============================================================

-- 部门表
CREATE TABLE IF NOT EXISTS sys_dept (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    parent_id INT DEFAULT 0,
    sort INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);
COMMENT ON TABLE sys_dept IS '部门表';
COMMENT ON COLUMN sys_dept.name IS '部门名称';
COMMENT ON COLUMN sys_dept.parent_id IS '上级部门ID';
COMMENT ON COLUMN sys_dept.sort IS '排序';
CREATE INDEX IF NOT EXISTS idx_dept_parent_id ON sys_dept(parent_id);
CREATE TRIGGER trg_sys_dept_update_time BEFORE UPDATE ON sys_dept FOR EACH ROW EXECUTE FUNCTION update_update_time();

-- 角色表
CREATE TABLE IF NOT EXISTS sys_role (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(50) NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    status SMALLINT DEFAULT 1,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uk_role_code UNIQUE (code)
);
COMMENT ON TABLE sys_role IS '角色表';
COMMENT ON COLUMN sys_role.name IS '角色名称';
COMMENT ON COLUMN sys_role.code IS '角色编码';
COMMENT ON COLUMN sys_role.description IS '描述';
COMMENT ON COLUMN sys_role.status IS '状态(1正常0禁用)';
CREATE TRIGGER trg_sys_role_update_time BEFORE UPDATE ON sys_role FOR EACH ROW EXECUTE FUNCTION update_update_time();

-- 用户表
CREATE TABLE IF NOT EXISTS sys_user (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    real_name VARCHAR(50) DEFAULT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    email VARCHAR(100) DEFAULT NULL,
    dept_id INT DEFAULT NULL,
    role_id INT DEFAULT NULL,
    status SMALLINT DEFAULT 1,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uk_username UNIQUE (username),
    CONSTRAINT fk_user_dept FOREIGN KEY (dept_id) REFERENCES sys_dept(id) ON DELETE SET NULL,
    CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES sys_role(id) ON DELETE SET NULL
);
COMMENT ON TABLE sys_user IS '用户表';
COMMENT ON COLUMN sys_user.username IS '用户名';
COMMENT ON COLUMN sys_user.password IS '密码';
COMMENT ON COLUMN sys_user.real_name IS '真实姓名';
COMMENT ON COLUMN sys_user.phone IS '电话';
COMMENT ON COLUMN sys_user.email IS '邮箱';
COMMENT ON COLUMN sys_user.dept_id IS '部门ID';
COMMENT ON COLUMN sys_user.role_id IS '角色ID';
COMMENT ON COLUMN sys_user.status IS '状态(1正常0禁用)';
CREATE INDEX IF NOT EXISTS idx_user_dept_id ON sys_user(dept_id);
CREATE INDEX IF NOT EXISTS idx_user_role_id ON sys_user(role_id);
CREATE TRIGGER trg_sys_user_update_time BEFORE UPDATE ON sys_user FOR EACH ROW EXECUTE FUNCTION update_update_time();

-- 操作日志表（来源: backend/create_sys_log_table.js）
CREATE TABLE IF NOT EXISTS sys_log (
    id SERIAL PRIMARY KEY,
    module VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    method VARCHAR(10) NOT NULL,
    url VARCHAR(500) NOT NULL,
    params TEXT,
    ip_address VARCHAR(50),
    user_id INT DEFAULT NULL,
    user_name VARCHAR(100),
    description TEXT,
    status SMALLINT DEFAULT 1,
    error_msg TEXT,
    create_time TIMESTAMP DEFAULT NOW()
);
COMMENT ON TABLE sys_log IS '系统操作日志表';
COMMENT ON COLUMN sys_log.module IS '操作模块';
COMMENT ON COLUMN sys_log.action IS '操作动作';
COMMENT ON COLUMN sys_log.method IS '请求方法';
COMMENT ON COLUMN sys_log.url IS '请求URL';
COMMENT ON COLUMN sys_log.params IS '请求参数';
COMMENT ON COLUMN sys_log.ip_address IS 'IP地址';
COMMENT ON COLUMN sys_log.user_id IS '用户ID';
COMMENT ON COLUMN sys_log.user_name IS '用户姓名';
COMMENT ON COLUMN sys_log.description IS '操作描述';
COMMENT ON COLUMN sys_log.status IS '状态 1成功 0失败';
COMMENT ON COLUMN sys_log.error_msg IS '错误信息';
COMMENT ON COLUMN sys_log.create_time IS '操作时间';
CREATE INDEX IF NOT EXISTS idx_log_module ON sys_log(module);
CREATE INDEX IF NOT EXISTS idx_log_user_id ON sys_log(user_id);
CREATE INDEX IF NOT EXISTS idx_log_create_time ON sys_log(create_time);
CREATE INDEX IF NOT EXISTS idx_log_action ON sys_log(action);

-- ============================================================
-- 2. 客户模块
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_customer (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(200) NOT NULL,
    contact_name VARCHAR(50) DEFAULT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    email VARCHAR(100) DEFAULT NULL,
    address VARCHAR(500) DEFAULT NULL,
    industry VARCHAR(50) DEFAULT NULL,
    source VARCHAR(50) DEFAULT NULL,
    level VARCHAR(20) DEFAULT 'C',
    owner_id INT DEFAULT NULL,
    status SMALLINT DEFAULT 1,
    pool_status SMALLINT DEFAULT 0,
    protect_until TIMESTAMP DEFAULT NULL,
    last_follow_time TIMESTAMP DEFAULT NULL,
    remark TEXT,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_customer_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL,
    CONSTRAINT chk_customer_level CHECK (level IN ('A', 'B', 'C', 'D'))
);
COMMENT ON TABLE crm_customer IS '客户表';
COMMENT ON COLUMN crm_customer.company_name IS '公司名称';
COMMENT ON COLUMN crm_customer.contact_name IS '联系人姓名';
COMMENT ON COLUMN crm_customer.phone IS '电话';
COMMENT ON COLUMN crm_customer.email IS '邮箱';
COMMENT ON COLUMN crm_customer.address IS '地址';
COMMENT ON COLUMN crm_customer.industry IS '所属行业';
COMMENT ON COLUMN crm_customer.source IS '客户来源';
COMMENT ON COLUMN crm_customer.level IS '客户等级（A/B/C/D）';
COMMENT ON COLUMN crm_customer.owner_id IS '负责销售ID';
COMMENT ON COLUMN crm_customer.status IS '状态（1潜在客户/2成交客户/3流失客户）';
COMMENT ON COLUMN crm_customer.pool_status IS '公海状态：0=归属销售 1=在公海';
COMMENT ON COLUMN crm_customer.protect_until IS '认领保护截止时间';
COMMENT ON COLUMN crm_customer.last_follow_time IS '最近跟进时间';
COMMENT ON COLUMN crm_customer.remark IS '备注';
CREATE INDEX IF NOT EXISTS idx_customer_company_name ON crm_customer(company_name);
CREATE INDEX IF NOT EXISTS idx_customer_phone ON crm_customer(phone);
CREATE INDEX IF NOT EXISTS idx_customer_industry ON crm_customer(industry);
CREATE INDEX IF NOT EXISTS idx_customer_source ON crm_customer(source);
CREATE INDEX IF NOT EXISTS idx_customer_level ON crm_customer(level);
CREATE INDEX IF NOT EXISTS idx_customer_owner_id ON crm_customer(owner_id);
CREATE INDEX IF NOT EXISTS idx_customer_status ON crm_customer(status);
CREATE INDEX IF NOT EXISTS idx_customer_create_time ON crm_customer(create_time);
CREATE INDEX IF NOT EXISTS idx_customer_pool_status ON crm_customer(pool_status);
CREATE INDEX IF NOT EXISTS idx_customer_protect_until ON crm_customer(protect_until);
CREATE INDEX IF NOT EXISTS idx_customer_last_follow ON crm_customer(last_follow_time);
CREATE INDEX IF NOT EXISTS idx_cust_owner_status_ctime ON crm_customer(owner_id, status, create_time);
CREATE TRIGGER trg_crm_customer_update_time BEFORE UPDATE ON crm_customer FOR EACH ROW EXECUTE FUNCTION update_update_time();

-- 联系人表
CREATE TABLE IF NOT EXISTS crm_contact (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL,
    name VARCHAR(50) NOT NULL,
    position VARCHAR(50) DEFAULT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    email VARCHAR(100) DEFAULT NULL,
    wechat VARCHAR(50) DEFAULT NULL,
    is_decision BOOLEAN DEFAULT FALSE,
    remark VARCHAR(500) DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_contact_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE,
    CONSTRAINT chk_contact_is_decision CHECK (is_decision IN (FALSE, TRUE))
);
COMMENT ON TABLE crm_contact IS '联系人表';
COMMENT ON COLUMN crm_contact.customer_id IS '客户ID';
COMMENT ON COLUMN crm_contact.name IS '姓名';
COMMENT ON COLUMN crm_contact.position IS '职位';
COMMENT ON COLUMN crm_contact.phone IS '电话';
COMMENT ON COLUMN crm_contact.email IS '邮箱';
COMMENT ON COLUMN crm_contact.wechat IS '微信';
COMMENT ON COLUMN crm_contact.is_decision IS '是否决策人';
COMMENT ON COLUMN crm_contact.remark IS '备注';
CREATE INDEX IF NOT EXISTS idx_contact_customer_id ON crm_contact(customer_id);
CREATE INDEX IF NOT EXISTS idx_contact_name ON crm_contact(name);
CREATE INDEX IF NOT EXISTS idx_contact_phone ON crm_contact(phone);
CREATE INDEX IF NOT EXISTS idx_contact_is_decision ON crm_contact(is_decision);
CREATE TRIGGER trg_crm_contact_update_time BEFORE UPDATE ON crm_contact FOR EACH ROW EXECUTE FUNCTION update_update_time();

-- ============================================================
-- 3. 跟进记录
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_follow_up (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL,
    contact_id INT DEFAULT NULL,
    follow_type VARCHAR(20) DEFAULT '电话',
    content TEXT,
    next_time TIMESTAMP DEFAULT NULL,
    next_content VARCHAR(500) DEFAULT NULL,
    create_by INT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_follow_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE,
    CONSTRAINT fk_follow_contact FOREIGN KEY (contact_id) REFERENCES crm_contact(id) ON DELETE SET NULL,
    CONSTRAINT fk_follow_user FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL,
    CONSTRAINT chk_follow_type CHECK (follow_type IN ('电话','拜访','微信','邮件','其他'))
);
COMMENT ON TABLE crm_follow_up IS '跟进记录表';
COMMENT ON COLUMN crm_follow_up.customer_id IS '客户ID';
COMMENT ON COLUMN crm_follow_up.contact_id IS '联系人ID';
COMMENT ON COLUMN crm_follow_up.follow_type IS '跟进方式';
COMMENT ON COLUMN crm_follow_up.content IS '跟进内容';
COMMENT ON COLUMN crm_follow_up.next_time IS '下次提醒时间';
COMMENT ON COLUMN crm_follow_up.next_content IS '下次计划';
COMMENT ON COLUMN crm_follow_up.create_by IS '创建人ID';
CREATE INDEX IF NOT EXISTS idx_follow_customer ON crm_follow_up(customer_id);
CREATE INDEX IF NOT EXISTS idx_follow_create_by ON crm_follow_up(create_by);
CREATE INDEX IF NOT EXISTS idx_follow_next_time ON crm_follow_up(next_time);
CREATE INDEX IF NOT EXISTS idx_follow_create_time ON crm_follow_up(create_time);

-- ============================================================
-- 4. 商机模块
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_opportunity (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    expected_amount DECIMAL(15,2) DEFAULT 0.00,
    expected_date DATE DEFAULT NULL,
    stage SMALLINT DEFAULT 1,
    win_rate SMALLINT DEFAULT 10,
    remark TEXT,
    owner_id INT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP DEFAULT NULL,
    CONSTRAINT fk_opp_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE,
    CONSTRAINT fk_opp_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL,
    CONSTRAINT chk_opp_stage CHECK (stage BETWEEN 1 AND 6),
    CONSTRAINT chk_opp_win_rate CHECK (win_rate BETWEEN 0 AND 100)
);
COMMENT ON TABLE crm_opportunity IS '商机表';
COMMENT ON COLUMN crm_opportunity.customer_id IS '客户ID';
COMMENT ON COLUMN crm_opportunity.name IS '商机名称';
COMMENT ON COLUMN crm_opportunity.expected_amount IS '预计金额';
COMMENT ON COLUMN crm_opportunity.expected_date IS '预计成交日期';
COMMENT ON COLUMN crm_opportunity.stage IS '阶段：1询盘 2需求确认 3方案报价 4谈判 5成交 6失败';
COMMENT ON COLUMN crm_opportunity.win_rate IS '赢单率';
COMMENT ON COLUMN crm_opportunity.owner_id IS '负责人ID';
CREATE INDEX IF NOT EXISTS idx_opp_customer ON crm_opportunity(customer_id);
CREATE INDEX IF NOT EXISTS idx_opp_owner ON crm_opportunity(owner_id);
CREATE INDEX IF NOT EXISTS idx_opp_stage ON crm_opportunity(stage);
CREATE INDEX IF NOT EXISTS idx_opp_expected_date ON crm_opportunity(expected_date);
CREATE INDEX IF NOT EXISTS idx_opp_owner_stage_ctime ON crm_opportunity(owner_id, stage, create_time);
CREATE TRIGGER trg_crm_opportunity_update_time BEFORE UPDATE ON crm_opportunity FOR EACH ROW EXECUTE FUNCTION update_update_time();

-- ============================================================
-- 5. 产品 + 报价模块
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_product (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) UNIQUE,
    category VARCHAR(100) DEFAULT NULL,
    unit VARCHAR(20) DEFAULT '件',
    price DECIMAL(15,2) DEFAULT 0.00,
    cost_price DECIMAL(15,2) DEFAULT 0.00,
    stock INT DEFAULT 0,
    description TEXT,
    status SMALLINT DEFAULT 1,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW()
);
COMMENT ON TABLE crm_product IS '产品表';
COMMENT ON COLUMN crm_product.name IS '产品名称';
COMMENT ON COLUMN crm_product.code IS '产品编码';
COMMENT ON COLUMN crm_product.category IS '产品分类';
COMMENT ON COLUMN crm_product.unit IS '单位';
COMMENT ON COLUMN crm_product.price IS '参考价格';
COMMENT ON COLUMN crm_product.cost_price IS '成本价';
COMMENT ON COLUMN crm_product.stock IS '库存数量';
CREATE INDEX IF NOT EXISTS idx_product_code ON crm_product(code);
CREATE INDEX IF NOT EXISTS idx_product_category ON crm_product(category);
CREATE INDEX IF NOT EXISTS idx_product_status ON crm_product(status);
CREATE TRIGGER trg_crm_product_update_time BEFORE UPDATE ON crm_product FOR EACH ROW EXECUTE FUNCTION update_update_time();

CREATE TABLE IF NOT EXISTS crm_quote (
    id SERIAL PRIMARY KEY,
    quote_no VARCHAR(50) NOT NULL UNIQUE,
    customer_id INT NOT NULL,
    amount DECIMAL(15,2) DEFAULT 0.00,
    discount DECIMAL(5,2) DEFAULT 0.00,
    final_amount DECIMAL(15,2) DEFAULT 0.00,
    valid_days INT DEFAULT 30,
    remark TEXT,
    status SMALLINT DEFAULT 1,
    create_by INT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP DEFAULT NULL,
    CONSTRAINT fk_quote_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE,
    CONSTRAINT fk_quote_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL,
    CONSTRAINT chk_quote_discount CHECK (discount >= 0 AND discount <= 1),
    CONSTRAINT chk_quote_status CHECK (status BETWEEN 1 AND 4)
);
COMMENT ON TABLE crm_quote IS '报价单表';
COMMENT ON COLUMN crm_quote.quote_no IS '报价单号';
COMMENT ON COLUMN crm_quote.customer_id IS '客户ID';
COMMENT ON COLUMN crm_quote.amount IS '总金额';
COMMENT ON COLUMN crm_quote.discount IS '折扣';
COMMENT ON COLUMN crm_quote.final_amount IS '折后金额';
COMMENT ON COLUMN crm_quote.valid_days IS '有效期(天)';
COMMENT ON COLUMN crm_quote.status IS '状态(1草稿/2已发送/3已确认/4已失效)';
CREATE INDEX IF NOT EXISTS idx_quote_no ON crm_quote(quote_no);
CREATE INDEX IF NOT EXISTS idx_quote_customer ON crm_quote(customer_id);
CREATE INDEX IF NOT EXISTS idx_quote_status ON crm_quote(status);
CREATE INDEX IF NOT EXISTS idx_quote_create_time ON crm_quote(create_time);

CREATE TABLE IF NOT EXISTS crm_quote_item (
    id SERIAL PRIMARY KEY,
    quote_id INT NOT NULL,
    product_id INT NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    product_code VARCHAR(50) DEFAULT NULL,
    quantity INT DEFAULT 1,
    unit_price DECIMAL(15,2) DEFAULT 0.00,
    total_price DECIMAL(15,2) DEFAULT 0.00,
    remark VARCHAR(500) DEFAULT NULL,
    CONSTRAINT fk_quote_item_quote FOREIGN KEY (quote_id) REFERENCES crm_quote(id) ON DELETE CASCADE,
    CONSTRAINT fk_quote_item_product FOREIGN KEY (product_id) REFERENCES crm_product(id) ON DELETE RESTRICT
);
COMMENT ON TABLE crm_quote_item IS '报价单项表';
CREATE INDEX IF NOT EXISTS idx_quote_item_quote ON crm_quote_item(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_item_product ON crm_quote_item(product_id);

-- ============================================================
-- 6. 合同 + 回款模块
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_contract (
    id SERIAL PRIMARY KEY,
    contract_no VARCHAR(50) NOT NULL,
    customer_id INT NOT NULL,
    opportunity_id INT DEFAULT NULL,
    amount DECIMAL(15, 2) DEFAULT 0.00,
    sign_date DATE DEFAULT NULL,
    delivery_date DATE DEFAULT NULL,
    payment_terms VARCHAR(500) DEFAULT NULL,
    status SMALLINT DEFAULT 1,
    remark TEXT,
    create_by INT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP DEFAULT NULL,
    CONSTRAINT fk_contract_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE,
    CONSTRAINT fk_contract_opportunity FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE SET NULL,
    CONSTRAINT fk_contract_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL
);
COMMENT ON TABLE crm_contract IS '合同表';
COMMENT ON COLUMN crm_contract.contract_no IS '合同编号';
COMMENT ON COLUMN crm_contract.customer_id IS '客户ID';
COMMENT ON COLUMN crm_contract.amount IS '合同金额';
COMMENT ON COLUMN crm_contract.sign_date IS '签订日期';
COMMENT ON COLUMN crm_contract.status IS '状态：1=执行中 2=已完成 3=已终止';
COMMENT ON COLUMN crm_contract.deleted_at IS '软删除时间';
CREATE INDEX IF NOT EXISTS idx_contract_no ON crm_contract(contract_no);
CREATE INDEX IF NOT EXISTS idx_contract_customer ON crm_contract(customer_id);
CREATE INDEX IF NOT EXISTS idx_contract_status ON crm_contract(status);
CREATE INDEX IF NOT EXISTS idx_contract_sign_date ON crm_contract(sign_date);
CREATE INDEX IF NOT EXISTS idx_contract_create_by ON crm_contract(create_by);
CREATE INDEX IF NOT EXISTS idx_contract_create_time ON crm_contract(create_time);
CREATE INDEX IF NOT EXISTS idx_contract_status_ctime ON crm_contract(status, create_time);
CREATE TRIGGER trg_crm_contract_update_time BEFORE UPDATE ON crm_contract FOR EACH ROW EXECUTE FUNCTION update_update_time();

CREATE TABLE IF NOT EXISTS crm_payment_plan (
    id SERIAL PRIMARY KEY,
    contract_id INT NOT NULL,
    plan_date DATE NOT NULL,
    plan_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    remark VARCHAR(500) DEFAULT NULL,
    CONSTRAINT fk_plan_contract FOREIGN KEY (contract_id) REFERENCES crm_contract(id) ON DELETE CASCADE
);
COMMENT ON TABLE crm_payment_plan IS '回款计划表';
CREATE INDEX IF NOT EXISTS idx_plan_contract ON crm_payment_plan(contract_id);
CREATE INDEX IF NOT EXISTS idx_plan_date ON crm_payment_plan(plan_date);

CREATE TABLE IF NOT EXISTS crm_payment (
    id SERIAL PRIMARY KEY,
    contract_id INT NOT NULL,
    plan_id INT DEFAULT NULL,
    pay_date DATE NOT NULL,
    pay_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    pay_method VARCHAR(50) DEFAULT NULL,
    remark VARCHAR(500) DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP DEFAULT NULL,
    CONSTRAINT fk_payment_contract FOREIGN KEY (contract_id) REFERENCES crm_contract(id) ON DELETE CASCADE,
    CONSTRAINT fk_payment_plan FOREIGN KEY (plan_id) REFERENCES crm_payment_plan(id) ON DELETE SET NULL
);
COMMENT ON TABLE crm_payment IS '实际回款表';
CREATE INDEX IF NOT EXISTS idx_payment_contract ON crm_payment(contract_id);
CREATE INDEX IF NOT EXISTS idx_payment_plan ON crm_payment(plan_id);
CREATE INDEX IF NOT EXISTS idx_payment_date ON crm_payment(pay_date);

-- ============================================================
-- 7. 服务工单 + 公海日志
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_service_order (
    id SERIAL PRIMARY KEY,
    order_no VARCHAR(50) NOT NULL,
    customer_id INT NOT NULL,
    contract_id INT DEFAULT NULL,
    type VARCHAR(50) DEFAULT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    priority SMALLINT DEFAULT 3,
    status SMALLINT DEFAULT 1,
    assignee_id INT DEFAULT NULL,
    create_by INT DEFAULT NULL,
    finish_desc TEXT,
    finish_time TIMESTAMP DEFAULT NULL,
    satisfaction SMALLINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_service_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE,
    CONSTRAINT fk_service_contract FOREIGN KEY (contract_id) REFERENCES crm_contract(id) ON DELETE SET NULL,
    CONSTRAINT fk_service_assignee FOREIGN KEY (assignee_id) REFERENCES sys_user(id) ON DELETE SET NULL,
    CONSTRAINT fk_service_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL
);
COMMENT ON TABLE crm_service_order IS '服务工单表';
COMMENT ON COLUMN crm_service_order.order_no IS '工单编号';
COMMENT ON COLUMN crm_service_order.type IS '工单类型：安装/维修/咨询/投诉/其他';
COMMENT ON COLUMN crm_service_order.priority IS '优先级：1=紧急 2=高 3=中 4=低';
COMMENT ON COLUMN crm_service_order.status IS '状态：1=待处理 2=处理中 3=已完成 4=已关闭 5=已评价';
CREATE INDEX IF NOT EXISTS idx_service_order_no ON crm_service_order(order_no);
CREATE INDEX IF NOT EXISTS idx_service_customer ON crm_service_order(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_contract ON crm_service_order(contract_id);
CREATE INDEX IF NOT EXISTS idx_service_type ON crm_service_order(type);
CREATE INDEX IF NOT EXISTS idx_service_status ON crm_service_order(status);
CREATE INDEX IF NOT EXISTS idx_service_priority ON crm_service_order(priority);
CREATE INDEX IF NOT EXISTS idx_service_assignee ON crm_service_order(assignee_id);
CREATE INDEX IF NOT EXISTS idx_service_create_time ON crm_service_order(create_time);
CREATE TRIGGER trg_crm_service_order_update_time BEFORE UPDATE ON crm_service_order FOR EACH ROW EXECUTE FUNCTION update_update_time();

CREATE TABLE IF NOT EXISTS crm_pool_log (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL,
    action VARCHAR(20) NOT NULL,
    from_user_id INT DEFAULT NULL,
    to_user_id INT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_pool_log_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE
);
COMMENT ON TABLE crm_pool_log IS '公海操作日志表';
COMMENT ON COLUMN crm_pool_log.action IS '操作：claim=认领 release=释放';
CREATE INDEX IF NOT EXISTS idx_pool_log_customer ON crm_pool_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_pool_log_action ON crm_pool_log(action);
CREATE INDEX IF NOT EXISTS idx_pool_log_create_time ON crm_pool_log(create_time);

-- ============================================================
-- 8. 供应商模块
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_supplier (
    id SERIAL PRIMARY KEY,
    supplier_no VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    short_name VARCHAR(100) DEFAULT NULL,
    type VARCHAR(20) DEFAULT '贸易' CHECK (type IN ('生产', '贸易', '服务')),
    industry VARCHAR(100) DEFAULT NULL,
    level VARCHAR(10) DEFAULT '普通' CHECK (level IN ('核心', '重点', '普通', '备用')),
    status SMALLINT DEFAULT 1,
    rating DECIMAL(2,1) DEFAULT 0.0,
    contact_person VARCHAR(100) DEFAULT NULL,
    contact_phone VARCHAR(20) DEFAULT NULL,
    contact_email VARCHAR(100) DEFAULT NULL,
    address VARCHAR(500) DEFAULT NULL,
    payment_terms VARCHAR(200) DEFAULT NULL,
    delivery_days INT DEFAULT NULL,
    remark TEXT,
    owner_id INT DEFAULT NULL,
    create_by INT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP DEFAULT NULL,
    CONSTRAINT fk_supplier_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL,
    CONSTRAINT fk_supplier_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL
);
COMMENT ON TABLE crm_supplier IS '供应商表';
COMMENT ON COLUMN crm_supplier.supplier_no IS '供应商编号';
COMMENT ON COLUMN crm_supplier.name IS '供应商名称';
COMMENT ON COLUMN crm_supplier.type IS '类型';
COMMENT ON COLUMN crm_supplier.level IS '等级';
COMMENT ON COLUMN crm_supplier.status IS '状态：1=合作中 2=暂停 3=终止';
COMMENT ON COLUMN crm_supplier.rating IS '综合评分（0-5）';
CREATE INDEX IF NOT EXISTS idx_supplier_no ON crm_supplier(supplier_no);
CREATE INDEX IF NOT EXISTS idx_supplier_name ON crm_supplier(name);
CREATE INDEX IF NOT EXISTS idx_supplier_type ON crm_supplier(type);
CREATE INDEX IF NOT EXISTS idx_supplier_level ON crm_supplier(level);
CREATE INDEX IF NOT EXISTS idx_supplier_status ON crm_supplier(status);
CREATE INDEX IF NOT EXISTS idx_supplier_owner ON crm_supplier(owner_id);
CREATE TRIGGER trg_crm_supplier_update_time BEFORE UPDATE ON crm_supplier FOR EACH ROW EXECUTE FUNCTION update_update_time();

CREATE TABLE IF NOT EXISTS crm_supplier_contact (
    id SERIAL PRIMARY KEY,
    supplier_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    position VARCHAR(100) DEFAULT NULL,
    department VARCHAR(100) DEFAULT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    mobile VARCHAR(20) DEFAULT NULL,
    email VARCHAR(100) DEFAULT NULL,
    wechat VARCHAR(50) DEFAULT NULL,
    role VARCHAR(20) DEFAULT '对接人' CHECK (role IN ('决策人', '对接人', '财务', '技术', '其他')),
    is_primary BOOLEAN DEFAULT FALSE,
    remark VARCHAR(500) DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_contact_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE CASCADE
);
COMMENT ON TABLE crm_supplier_contact IS '供应商联系人表';
CREATE INDEX IF NOT EXISTS idx_scontact_supplier ON crm_supplier_contact(supplier_id);
CREATE INDEX IF NOT EXISTS idx_scontact_role ON crm_supplier_contact(role);

CREATE TABLE IF NOT EXISTS crm_supplier_qualification (
    id SERIAL PRIMARY KEY,
    supplier_id INT NOT NULL,
    cert_type VARCHAR(100) NOT NULL,
    cert_no VARCHAR(100) DEFAULT NULL,
    cert_name VARCHAR(200) DEFAULT NULL,
    issue_date DATE DEFAULT NULL,
    expire_date DATE DEFAULT NULL,
    issuing_authority VARCHAR(200) DEFAULT NULL,
    file_path VARCHAR(500) DEFAULT NULL,
    status SMALLINT DEFAULT 1,
    remark VARCHAR(500) DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_qual_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE CASCADE
);
COMMENT ON TABLE crm_supplier_qualification IS '供应商资质证照表';
CREATE INDEX IF NOT EXISTS idx_qual_supplier ON crm_supplier_qualification(supplier_id);
CREATE INDEX IF NOT EXISTS idx_qual_type ON crm_supplier_qualification(cert_type);
CREATE INDEX IF NOT EXISTS idx_qual_expire ON crm_supplier_qualification(expire_date);

CREATE TABLE IF NOT EXISTS crm_supplier_rating (
    id SERIAL PRIMARY KEY,
    supplier_id INT NOT NULL,
    quality_score DECIMAL(2,1) DEFAULT 0.0,
    delivery_score DECIMAL(2,1) DEFAULT 0.0,
    service_score DECIMAL(2,1) DEFAULT 0.0,
    price_score DECIMAL(2,1) DEFAULT 0.0,
    total_score DECIMAL(2,1) DEFAULT 0.0,
    rating_period VARCHAR(20) NOT NULL,
    evaluator_id INT DEFAULT NULL,
    remark TEXT,
    create_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_rating_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE CASCADE,
    CONSTRAINT fk_rating_evaluator FOREIGN KEY (evaluator_id) REFERENCES sys_user(id) ON DELETE SET NULL
);
COMMENT ON TABLE crm_supplier_rating IS '供应商评分记录表';
CREATE INDEX IF NOT EXISTS idx_rating_supplier ON crm_supplier_rating(supplier_id);
CREATE INDEX IF NOT EXISTS idx_rating_period ON crm_supplier_rating(rating_period);

CREATE TABLE IF NOT EXISTS crm_customer_supplier_relation (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL,
    supplier_id INT NOT NULL,
    relationship_type VARCHAR(10) DEFAULT '主要' CHECK (relationship_type IN ('主要', '次要', '禁用')),
    effective_date DATE DEFAULT NULL,
    remark VARCHAR(500) DEFAULT NULL,
    create_by INT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_csr_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE,
    CONSTRAINT fk_csr_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE CASCADE,
    CONSTRAINT uk_customer_supplier UNIQUE (customer_id, supplier_id)
);
COMMENT ON TABLE crm_customer_supplier_relation IS '客户供应商关联表';
CREATE INDEX IF NOT EXISTS idx_csr_customer ON crm_customer_supplier_relation(customer_id);
CREATE INDEX IF NOT EXISTS idx_csr_supplier ON crm_customer_supplier_relation(supplier_id);

-- ============================================================
-- 9. 采购模块
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_purchase_order (
    id SERIAL PRIMARY KEY,
    order_no VARCHAR(50) NOT NULL,
    supplier_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    type VARCHAR(20) DEFAULT '常规',
    expected_date DATE DEFAULT NULL,
    payment_terms VARCHAR(100) DEFAULT NULL,
    delivery_address VARCHAR(500) DEFAULT NULL,
    remark VARCHAR(2000) DEFAULT NULL,
    total_amount DECIMAL(15, 2) DEFAULT 0.00,
    tax_rate DECIMAL(5, 2) DEFAULT 13.00,
    tax_amount DECIMAL(15, 2) DEFAULT 0.00,
    total_with_tax DECIMAL(15, 2) DEFAULT 0.00,
    actual_date DATE DEFAULT NULL,
    owner_id INT DEFAULT NULL,
    create_by INT DEFAULT NULL,
    status VARCHAR(20) DEFAULT '草稿',
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE RESTRICT,
    CONSTRAINT fk_po_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL,
    CONSTRAINT fk_po_create_by FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL
);
COMMENT ON TABLE crm_purchase_order IS '采购订单表';
COMMENT ON COLUMN crm_purchase_order.order_no IS '采购单号';
COMMENT ON COLUMN crm_purchase_order.supplier_id IS '供应商ID';
COMMENT ON COLUMN crm_purchase_order.status IS '状态：草稿/待审核/已确认/部分收货/已完成/已取消';
CREATE UNIQUE INDEX IF NOT EXISTS idx_po_no ON crm_purchase_order(order_no);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON crm_purchase_order(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON crm_purchase_order(status);
CREATE INDEX IF NOT EXISTS idx_po_create_time ON crm_purchase_order(create_time);
CREATE TRIGGER trg_crm_purchase_order_update_time BEFORE UPDATE ON crm_purchase_order FOR EACH ROW EXECUTE FUNCTION update_update_time();

CREATE TABLE IF NOT EXISTS crm_purchase_item (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    product_spec VARCHAR(200) DEFAULT NULL,
    unit VARCHAR(20) DEFAULT '个',
    quantity DECIMAL(12, 3) NOT NULL,
    unit_price DECIMAL(12, 4) NOT NULL,
    discount_rate DECIMAL(5, 2) DEFAULT 0.00,
    discount_amount DECIMAL(15, 2) DEFAULT 0.00,
    amount DECIMAL(15, 2) NOT NULL,
    received_qty DECIMAL(12, 3) DEFAULT 0.000,
    quality_status VARCHAR(20) DEFAULT '待检',
    remark VARCHAR(500) DEFAULT NULL,
    CONSTRAINT fk_poi_order FOREIGN KEY (order_id) REFERENCES crm_purchase_order(id) ON DELETE CASCADE
);
COMMENT ON TABLE crm_purchase_item IS '采购订单明细表';
CREATE INDEX IF NOT EXISTS idx_poi_order ON crm_purchase_item(order_id);

CREATE TABLE IF NOT EXISTS crm_purchase_receipt (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL,
    item_id INT NOT NULL,
    receipt_no VARCHAR(50) NOT NULL,
    quantity DECIMAL(12, 3) NOT NULL,
    quality_check BOOLEAN DEFAULT TRUE,
    quality_result VARCHAR(20) DEFAULT '待检',
    defect_desc VARCHAR(500) DEFAULT NULL,
    warehouse VARCHAR(100) DEFAULT NULL,
    remark VARCHAR(500) DEFAULT NULL,
    operator_id INT DEFAULT NULL,
    receive_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_pr_order FOREIGN KEY (order_id) REFERENCES crm_purchase_order(id) ON DELETE CASCADE,
    CONSTRAINT fk_pr_item FOREIGN KEY (item_id) REFERENCES crm_purchase_item(id) ON DELETE CASCADE,
    CONSTRAINT fk_pr_operator FOREIGN KEY (operator_id) REFERENCES sys_user(id) ON DELETE SET NULL
);
COMMENT ON TABLE crm_purchase_receipt IS '采购收货记录表';
CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_no ON crm_purchase_receipt(receipt_no);
CREATE INDEX IF NOT EXISTS idx_pr_order ON crm_purchase_receipt(order_id);
CREATE INDEX IF NOT EXISTS idx_pr_item ON crm_purchase_receipt(item_id);

CREATE TABLE IF NOT EXISTS crm_purchase_payment (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    pay_method VARCHAR(50) DEFAULT NULL,
    pay_date DATE DEFAULT NULL,
    remark VARCHAR(500) DEFAULT NULL,
    payer_id INT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_pp_order FOREIGN KEY (order_id) REFERENCES crm_purchase_order(id) ON DELETE CASCADE,
    CONSTRAINT fk_pp_payer FOREIGN KEY (payer_id) REFERENCES sys_user(id) ON DELETE SET NULL
);
COMMENT ON TABLE crm_purchase_payment IS '采购付款记录表';
CREATE INDEX IF NOT EXISTS idx_pp_order ON crm_purchase_payment(order_id);

CREATE TABLE IF NOT EXISTS crm_scoring_rule (
    id SERIAL PRIMARY KEY,
    category VARCHAR(20) NOT NULL CHECK (category IN ('quality', 'delivery', 'service', 'price')),
    rule_name VARCHAR(100) NOT NULL,
    min_score DECIMAL(2,1) DEFAULT 1.0,
    max_score DECIMAL(2,1) DEFAULT 5.0,
    weight DECIMAL(3,2) DEFAULT 0.25,
    description VARCHAR(500) DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uk_category_name UNIQUE (category, rule_name)
);
COMMENT ON TABLE crm_scoring_rule IS '供应商评分规则表';
CREATE INDEX IF NOT EXISTS idx_sr_category ON crm_scoring_rule(category);
CREATE INDEX IF NOT EXISTS idx_sr_active ON crm_scoring_rule(is_active);

CREATE TABLE IF NOT EXISTS crm_qualification_reminder (
    id SERIAL PRIMARY KEY,
    qualification_id INT NOT NULL,
    supplier_id INT NOT NULL,
    cert_name VARCHAR(200) NOT NULL,
    expire_date DATE NOT NULL,
    days_before INT NOT NULL,
    reminder_type VARCHAR(10) DEFAULT '即将到期' CHECK (reminder_type IN ('即将到期', '已过期')),
    is_notified BOOLEAN DEFAULT FALSE,
    notified_at TIMESTAMP DEFAULT NULL,
    notify_to_user_ids VARCHAR(500) DEFAULT NULL,
    remark VARCHAR(500) DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_reminder_qual FOREIGN KEY (qualification_id) REFERENCES crm_supplier_qualification(id) ON DELETE CASCADE,
    CONSTRAINT fk_reminder_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id)
);
COMMENT ON TABLE crm_qualification_reminder IS '资质到期提醒记录表';
CREATE INDEX IF NOT EXISTS idx_qr_expire ON crm_qualification_reminder(expire_date);
CREATE INDEX IF NOT EXISTS idx_qr_notified ON crm_qualification_reminder(is_notified);
CREATE INDEX IF NOT EXISTS idx_qr_type ON crm_qualification_reminder(reminder_type);

-- ============================================================
-- 10. 种子数据
-- ============================================================

-- 部门
INSERT INTO sys_dept (name, parent_id, sort) VALUES
('总公司', 0, 1),
('销售部', 1, 1),
('技术部', 1, 2),
('客服部', 1, 3),
('市场部', 1, 4);

-- 角色
INSERT INTO sys_role (name, code, description, status) VALUES
('超级管理员', 'super_admin', '系统超级管理员，拥有所有权限', 1),
('管理员', 'admin', '系统管理员', 1),
('销售经理', 'sales_manager', '销售部门经理', 1),
('销售人员', 'sales', '普通销售人员', 1),
('技术人员', 'tech', '技术人员', 1);

-- 默认管理员 (密码: admin123)
INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status)
SELECT 'admin', '$2b$10$eY0sRG.fsdRu5RO/HHMDrOVBEuFwE.BbPfe66qnMi3DqP0BIbofry',
       '系统管理员', '13800138000', 'admin@huakey.com',
       d.id, r.id, 1
FROM sys_dept d, sys_role r
WHERE d.name = '总公司' AND r.code = 'super_admin';

-- 供应商评分规则
INSERT INTO crm_scoring_rule (category, rule_name, min_score, max_score, weight, description, sort_order) VALUES
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
('service', '响应慢、配合度差', 1.0, 2.4, 0.15, '响应很慢，配合度差', 4)
ON CONFLICT DO NOTHING;

-- 供应商示例数据
INSERT INTO crm_supplier (supplier_no, name, short_name, type, industry, level, status, rating, contact_person, contact_phone, owner_id, create_by)
SELECT 'SUP-20240101-001', '深圳市华强电子有限公司', '华强电子', '生产', '电子元器件', '核心', 1, 4.5, '张经理', '13800138001', u.id, u.id
FROM sys_user u WHERE u.username = 'admin'
UNION ALL
SELECT 'SUP-20240102-002', '广州通达物流有限公司', '通达物流', '服务', '物流运输', '重点', 1, 4.0, '李主管', '13900139002', u.id, u.id
FROM sys_user u WHERE u.username = 'admin';

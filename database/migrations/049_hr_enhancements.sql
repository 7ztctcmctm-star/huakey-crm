-- 049_hr_enhancements.sql
-- HR增强：员工档案 + 佣金计算 + 组织架构

-- 员工档案扩展表
CREATE TABLE IF NOT EXISTS crm_employee_profile (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE COMMENT '关联sys_user.id',
  gender VARCHAR(10) DEFAULT NULL COMMENT '性别',
  birth_date DATE DEFAULT NULL COMMENT '出生日期',
  id_card VARCHAR(20) DEFAULT NULL COMMENT '身份证号',
  hire_date DATE DEFAULT NULL COMMENT '入职日期',
  leave_date DATE DEFAULT NULL COMMENT '离职日期',
  position VARCHAR(50) DEFAULT NULL COMMENT '职位',
  employment_type VARCHAR(20) DEFAULT 'fulltime' COMMENT '用工类型',
  contract_start DATE DEFAULT NULL COMMENT '合同起始日',
  contract_end DATE DEFAULT NULL COMMENT '合同到期日',
  salary_base DECIMAL(10,2) DEFAULT NULL COMMENT '基本工资',
  salary_commission_rate DECIMAL(5,2) DEFAULT 0 COMMENT '提成比例(%)',
  bank_name VARCHAR(50) DEFAULT NULL COMMENT '开户银行',
  bank_account VARCHAR(30) DEFAULT NULL COMMENT '银行账号',
  emergency_contact VARCHAR(50) DEFAULT NULL COMMENT '紧急联系人',
  emergency_phone VARCHAR(20) DEFAULT NULL COMMENT '紧急联系电话',
  address VARCHAR(200) DEFAULT NULL COMMENT '家庭住址',
  education VARCHAR(20) DEFAULT NULL COMMENT '学历',
  university VARCHAR(100) DEFAULT NULL COMMENT '毕业院校',
  major VARCHAR(50) DEFAULT NULL COMMENT '专业',
  remark TEXT COMMENT '备注',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ep_user FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='员工档案扩展';

-- 佣金规则表
CREATE TABLE IF NOT EXISTS crm_commission_rule (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '规则名称',
  rule_type VARCHAR(20) NOT NULL COMMENT '规则类型：fixed/tiered/amount',
  apply_to VARCHAR(20) DEFAULT 'contract' COMMENT '适用对象：contract/payment',
  config TEXT NOT NULL COMMENT '规则配置JSON',
  status TINYINT(1) DEFAULT 1 COMMENT '状态',
  remark VARCHAR(200) DEFAULT NULL,
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_cr_type (rule_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='佣金规则';

-- 佣金记录表
CREATE TABLE IF NOT EXISTS crm_commission_record (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '销售人员ID',
  rule_id INT DEFAULT NULL COMMENT '规则ID',
  business_type VARCHAR(20) NOT NULL COMMENT '业务类型：contract/payment',
  business_id INT NOT NULL COMMENT '业务ID',
  base_amount DECIMAL(12,2) NOT NULL COMMENT '计算基数',
  commission_rate DECIMAL(5,2) DEFAULT NULL COMMENT '佣金比例(%)',
  commission_amount DECIMAL(12,2) NOT NULL COMMENT '佣金金额',
  period VARCHAR(10) DEFAULT NULL COMMENT '归属月份',
  status VARCHAR(20) DEFAULT 'calculated' COMMENT '状态：calculated/confirmed/paid',
  remark VARCHAR(200) DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ccr_user (user_id),
  KEY idx_ccr_period (period),
  KEY idx_ccr_status (status),
  UNIQUE KEY uk_ccr_biz (business_type, business_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='佣金记录';

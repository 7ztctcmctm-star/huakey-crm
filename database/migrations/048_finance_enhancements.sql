-- 048_finance_enhancements.sql
-- 财务增强：回款提醒 + 对账单 + 财务分析

-- 回款提醒记录表
CREATE TABLE IF NOT EXISTS crm_payment_reminder (
  id INT PRIMARY KEY AUTO_INCREMENT,
  contract_id INT NOT NULL COMMENT '合同ID',
  plan_id INT DEFAULT NULL COMMENT '回款计划ID',
  customer_id INT NOT NULL COMMENT '客户ID',
  remind_date DATE NOT NULL COMMENT '提醒日期',
  remind_type VARCHAR(20) NOT NULL COMMENT '提醒类型：upcoming/overdue/weekly',
  remind_days INT DEFAULT NULL COMMENT '距到期天数',
  amount DECIMAL(12,2) DEFAULT NULL COMMENT '应回款金额',
  status VARCHAR(20) DEFAULT 'pending' COMMENT '状态：pending/acknowledged/sent',
  remark VARCHAR(200) DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pr_contract (contract_id),
  KEY idx_pr_customer (customer_id),
  KEY idx_pr_status (status),
  KEY idx_pr_date (remind_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='回款提醒记录';

-- 对账单表
CREATE TABLE IF NOT EXISTS crm_reconciliation (
  id INT PRIMARY KEY AUTO_INCREMENT,
  recon_no VARCHAR(50) NOT NULL COMMENT '对账单号',
  recon_type VARCHAR(20) NOT NULL COMMENT '对账类型：customer/supplier',
  target_id INT NOT NULL COMMENT '客户/供应商ID',
  target_name VARCHAR(100) DEFAULT NULL COMMENT '名称',
  period_start DATE NOT NULL COMMENT '起始日',
  period_end DATE NOT NULL COMMENT '截止日',
  total_amount DECIMAL(12,2) DEFAULT 0 COMMENT '总金额',
  paid_amount DECIMAL(12,2) DEFAULT 0 COMMENT '已付金额',
  unpaid_amount DECIMAL(12,2) DEFAULT 0 COMMENT '未付金额',
  status VARCHAR(20) DEFAULT 'draft' COMMENT '状态：draft/confirmed/disputed',
  detail_data TEXT COMMENT '明细JSON',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rc_type (recon_type),
  KEY idx_rc_target (target_id),
  KEY idx_rc_no (recon_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对账单';

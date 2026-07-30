-- ============================================
-- CI 补充表创建脚本
-- init-complete.sql 仅包含到 migration 055 的表结构，
-- 此脚本创建 056-072 中新增但不在 dump 中的表。
-- 所有语句使用 IF NOT EXISTS 确保幂等。
-- ============================================

-- 056: sys_log_archive
CREATE TABLE IF NOT EXISTS sys_log_archive LIKE sys_log;

-- 061: sys_token_blacklist
CREATE TABLE IF NOT EXISTS sys_token_blacklist (
  id INT PRIMARY KEY AUTO_INCREMENT,
  token_hash VARCHAR(64) NOT NULL,
  user_id INT DEFAULT NULL,
  expire_at DATETIME NOT NULL,
  reason VARCHAR(50) DEFAULT 'logout',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_token_hash (token_hash),
  INDEX idx_expire (expire_at),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 066: crm_purchase_request
CREATE TABLE IF NOT EXISTS crm_purchase_request (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  request_no VARCHAR(50) DEFAULT NULL,
  dept_id INT DEFAULT NULL,
  request_by INT DEFAULT NULL,
  request_date DATE DEFAULT NULL,
  expected_date DATE DEFAULT NULL,
  urgency VARCHAR(20) DEFAULT 'normal',
  status VARCHAR(20) DEFAULT 'draft',
  total_amount DECIMAL(12,2) DEFAULT 0.00,
  remark TEXT,
  deleted_at DATETIME DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_request_by (request_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 067: crm_purchase_comparison
CREATE TABLE IF NOT EXISTS crm_purchase_comparison (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  request_id INT DEFAULT NULL,
  compare_no VARCHAR(50) DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  remark TEXT,
  deleted_at DATETIME DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 067: crm_purchase_comparison_item
CREATE TABLE IF NOT EXISTS crm_purchase_comparison_item (
  id INT PRIMARY KEY AUTO_INCREMENT,
  comparison_id INT NOT NULL,
  supplier_id INT DEFAULT NULL,
  product_name VARCHAR(200) DEFAULT NULL,
  spec VARCHAR(200) DEFAULT NULL,
  quantity DECIMAL(12,2) DEFAULT NULL,
  unit VARCHAR(20) DEFAULT NULL,
  unit_price DECIMAL(12,2) DEFAULT NULL,
  total_price DECIMAL(12,2) DEFAULT NULL,
  delivery_days INT DEFAULT NULL,
  remark TEXT,
  deleted_at DATETIME DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_comparison (comparison_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 069: crm_user_permission
CREATE TABLE IF NOT EXISTS crm_user_permission (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  permission_id INT NOT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_permission (user_id, permission_id),
  INDEX idx_user_id (user_id),
  INDEX idx_permission_id (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 070: sys_customer_status
CREATE TABLE IF NOT EXISTS sys_customer_status (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(50) NOT NULL,
  sort_order INT DEFAULT 0,
  is_default TINYINT(1) DEFAULT 0,
  is_end TINYINT(1) DEFAULT 0,
  color VARCHAR(20) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 070: sys_customer_status_transition
CREATE TABLE IF NOT EXISTS sys_customer_status_transition (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  from_code VARCHAR(32) NOT NULL,
  to_code VARCHAR(32) NOT NULL,
  require_permission VARCHAR(50) DEFAULT NULL,
  require_reason TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_transition (from_code, to_code),
  KEY idx_from_code (from_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 072: crm_scoring_rule
CREATE TABLE IF NOT EXISTS crm_scoring_rule (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  module VARCHAR(50) NOT NULL,
  field_name VARCHAR(50) DEFAULT NULL,
  operator VARCHAR(20) DEFAULT NULL,
  threshold VARCHAR(100) DEFAULT NULL,
  score INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

-- ============================================
-- DDL 变更（migration 中 ALTER TABLE 等操作）
-- 这些变更不在 init-complete.sql 中，必须显式执行
-- ============================================

-- 070: crm_customer.status TINYINT -> VARCHAR(32)
-- migration 088 的 roundtrip 测试依赖 VARCHAR 类型的 status 列
SET @is_int_status = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer'
  AND COLUMN_NAME = 'status' AND DATA_TYPE = 'tinyint');
SET @modify_status_sql = IF(@is_int_status > 0,
  'ALTER TABLE crm_customer MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT ''following''',
  'SELECT ''status 已是 VARCHAR，跳过 MODIFY'' AS msg');
PREPARE modify_status_stmt FROM @modify_status_sql;
EXECUTE modify_status_stmt;
DEALLOCATE PREPARE modify_status_stmt;

-- 070: 初始化默认客户状态 (seed data)
INSERT IGNORE INTO sys_customer_status (code, name, sort_order, is_default, is_end, color) VALUES
('sea', '公海客户', 10, 0, 0, '#909399'),
('following', '跟进中', 20, 1, 0, '#409EFF'),
('quoted', '已报价', 30, 0, 0, '#67C23A'),
('negotiating', '谈判中', 40, 0, 0, '#E6A23C'),
('signed', '已签约', 50, 0, 1, '#67C23A'),
('lost', '已流失', 60, 0, 1, '#F56C6C'),
('paused', '暂停跟进', 70, 0, 0, '#909399');

-- 070: 初始化客户状态流转规则
INSERT IGNORE INTO sys_customer_status_transition (from_code, to_code, require_permission, require_reason) VALUES
('sea', 'following', NULL, 0),
('following', 'sea', NULL, 0),
('following', 'quoted', NULL, 0),
('following', 'paused', NULL, 1),
('following', 'lost', NULL, 1),
('quoted', 'negotiating', NULL, 0),
('quoted', 'lost', NULL, 1),
('quoted', 'following', NULL, 0),
('negotiating', 'signed', NULL, 0),
('negotiating', 'lost', NULL, 1),
('negotiating', 'quoted', NULL, 0),
('paused', 'following', NULL, 0),
('lost', 'following', 'customer:manage', 1),
('signed', 'following', 'customer:manage', 1),
('signed', 'negotiating', NULL, 1);

-- 088: 初始化 lead 状态（线索池）
INSERT IGNORE INTO sys_customer_status (code, name, sort_order, is_default, is_end, color) VALUES
('lead', '线索', 0, 0, 0, '#909399');

-- 088: 初始化 lead 流转规则
INSERT IGNORE INTO sys_customer_status_transition (from_code, to_code, require_permission, require_reason) VALUES
('lead', 'following', 0, 0),
('lead', 'sea', 0, 0);

-- 089: sys_user 增加 must_change_password + password_changed_at 列
-- authService.login/getMe 查询依赖这两个列
SET @has_must_pwd = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'must_change_password');
SET @sql089a = IF(@has_must_pwd = 0,
  'ALTER TABLE sys_user ADD COLUMN must_change_password TINYINT NOT NULL DEFAULT 0 COMMENT ''首次登录/重置密码后必须改密(1是0否)''',
  'SELECT 1');
PREPARE stmt089a FROM @sql089a; EXECUTE stmt089a; DEALLOCATE PREPARE stmt089a;

SET @has_pwd_ch = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'password_changed_at');
SET @sql089b = IF(@has_pwd_ch = 0,
  'ALTER TABLE sys_user ADD COLUMN password_changed_at DATETIME DEFAULT NULL COMMENT ''密码最后修改时间''',
  'SELECT 1');
PREPARE stmt089b FROM @sql089b; EXECUTE stmt089b; DEALLOCATE PREPARE stmt089b;

-- 为已有账号设置 password_changed_at（避免历史账号被误判为首次登录）
UPDATE sys_user SET password_changed_at = NOW() WHERE password_changed_at IS NULL;

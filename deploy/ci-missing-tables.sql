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

-- 079: crm_contract.quote_id (080_down.sql rollback 依赖此列)
SET @col_quote_id = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contract' AND COLUMN_NAME = 'quote_id');
SET @sql079 = IF(@col_quote_id = 0,
  'ALTER TABLE crm_contract ADD COLUMN quote_id INT DEFAULT NULL COMMENT ''关联合同来源报价单ID''',
  'SELECT 1');
PREPARE stmt079 FROM @sql079; EXECUTE stmt079; DEALLOCATE PREPARE stmt079;
SET @idx_quote_id = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contract' AND INDEX_NAME = 'idx_contract_quote_id');
SET @sql079b = IF(@idx_quote_id = 0,
  'CREATE INDEX idx_contract_quote_id ON crm_contract(quote_id)',
  'SELECT 1');
PREPARE stmt079b FROM @sql079b; EXECUTE stmt079b; DEALLOCATE PREPARE stmt079b;

-- 076: crm_follow_up 新增字段 (077_down.sql rollback 依赖)
SET @col_is_plan = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'is_plan');
SET @sql076a = IF(@col_is_plan = 0,
  "ALTER TABLE crm_follow_up ADD COLUMN is_plan TINYINT(1) NOT NULL DEFAULT 0",
  'SELECT 1');
PREPARE stmt076a FROM @sql076a; EXECUTE stmt076a; DEALLOCATE PREPARE stmt076a;

SET @col_spid = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'source_plan_id');
SET @sql076b = IF(@col_spid = 0,
  'ALTER TABLE crm_follow_up ADD COLUMN source_plan_id INT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt076b FROM @sql076b; EXECUTE stmt076b; DEALLOCATE PREPARE stmt076b;

-- 076: plan_status 和 finish_time（customerDetailService/followUpService 查询依赖，原 ci-missing-tables 遗漏）
SET @col_pstatus = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'plan_status');
SET @sql076c = IF(@col_pstatus = 0,
  "ALTER TABLE crm_follow_up ADD COLUMN plan_status VARCHAR(20) DEFAULT NULL COMMENT '计划状态: pending/completed/overdue/cancelled'",
  'SELECT 1');
PREPARE stmt076c FROM @sql076c; EXECUTE stmt076c; DEALLOCATE PREPARE stmt076c;

SET @col_ftime = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'finish_time');
SET @sql076d = IF(@col_ftime = 0,
  'ALTER TABLE crm_follow_up ADD COLUMN finish_time DATETIME DEFAULT NULL',
  'SELECT 1');
PREPARE stmt076d FROM @sql076d; EXECUTE stmt076d; DEALLOCATE PREPARE stmt076d;

-- crm_quote / crm_contract 缺失 update_time（quoteService.convertToContract 查询依赖）
SET @col_qt = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_quote' AND COLUMN_NAME = 'update_time');
SET @sql_qt = IF(@col_qt = 0,
  'ALTER TABLE crm_quote ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1');
PREPARE stmt_qt FROM @sql_qt; EXECUTE stmt_qt; DEALLOCATE PREPARE stmt_qt;

SET @col_ct = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contract' AND COLUMN_NAME = 'update_time');
SET @sql_ct = IF(@col_ct = 0,
  'ALTER TABLE crm_contract ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1');
PREPARE stmt_ct FROM @sql_ct; EXECUTE stmt_ct; DEALLOCATE PREPARE stmt_ct;

-- 071: crm_contact.is_primary (071_down.sql rollback 依赖)
SET @col_primary = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact' AND COLUMN_NAME = 'is_primary');
SET @sql071 = IF(@col_primary = 0,
  'ALTER TABLE crm_contact ADD COLUMN is_primary TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt071 FROM @sql071; EXECUTE stmt071; DEALLOCATE PREPARE stmt071;
SET @idx_primary = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact' AND INDEX_NAME = 'idx_contact_primary');
SET @sql071b = IF(@idx_primary = 0,
  'CREATE INDEX idx_contact_primary ON crm_contact(is_primary)',
  'SELECT 1');
PREPARE stmt071b FROM @sql071b; EXECUTE stmt071b; DEALLOCATE PREPARE stmt071b;

-- 074: crm_customer.original_lead_id (074_down.sql rollback 依赖)
SET @col_olid = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'original_lead_id');
SET @sql074 = IF(@col_olid = 0,
  'ALTER TABLE crm_customer ADD COLUMN original_lead_id INT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt074 FROM @sql074; EXECUTE stmt074; DEALLOCATE PREPARE stmt074;
SET @idx_olid = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_original_lead_id');
SET @sql074b = IF(@idx_olid = 0,
  'CREATE INDEX idx_original_lead_id ON crm_customer(original_lead_id)',
  'SELECT 1');
PREPARE stmt074b FROM @sql074b; EXECUTE stmt074b; DEALLOCATE PREPARE stmt074b;

-- ============================================================
-- 089: sys_user 增加 must_change_password / password_changed_at
-- （CI 标记迁移为"已执行"但不实际执行 SQL，需在此补 DDL）
-- ============================================================
SET @col_mcp = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'must_change_password');
SET @sql089a = IF(@col_mcp = 0,
  'ALTER TABLE sys_user ADD COLUMN must_change_password TINYINT NOT NULL DEFAULT 0 COMMENT ''首次登录/重置密码后必须改密''',
  'SELECT 1');
PREPARE stmt089a FROM @sql089a; EXECUTE stmt089a; DEALLOCATE PREPARE stmt089a;

SET @col_pca = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'password_changed_at');
SET @sql089b = IF(@col_pca = 0,
  'ALTER TABLE sys_user ADD COLUMN password_changed_at DATETIME DEFAULT NULL COMMENT ''密码最后修改时间''',
  'SELECT 1');
PREPARE stmt089b FROM @sql089b; EXECUTE stmt089b; DEALLOCATE PREPARE stmt089b;

-- ============================================================
-- crm_payment_plan 补齐 create_time / update_time
-- contractService.getContract 查询依赖这两列，缺失会导致合同详情接口 500
-- （init-complete.sql 早期版本未包含这两列，迁移 055 之后才补充）
-- ============================================================
SET @col_pp_ct = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_payment_plan' AND COLUMN_NAME = 'create_time');
SET @sql_pp_ct = IF(@col_pp_ct = 0,
  'ALTER TABLE crm_payment_plan ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP',
  'SELECT 1');
PREPARE stmt_pp_ct FROM @sql_pp_ct; EXECUTE stmt_pp_ct; DEALLOCATE PREPARE stmt_pp_ct;

SET @col_pp_ut = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_payment_plan' AND COLUMN_NAME = 'update_time');
SET @sql_pp_ut = IF(@col_pp_ut = 0,
  'ALTER TABLE crm_payment_plan ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1');
PREPARE stmt_pp_ut FROM @sql_pp_ut; EXECUTE stmt_pp_ut; DEALLOCATE PREPARE stmt_pp_ut;

-- ⚠️ CI 测试用户已剥离到 .github/ci/test-users.sql
-- 如需 E2E 测试用户，请执行 .github/ci/test-users.sql（仅限 CI/测试环境）

-- ============================================================
-- 095: Demo 数据标识字段 is_demo（核心 12 表）
-- CI 标记迁移为"已执行"但不实际跑 SQL，需在此补 DDL，
-- 否则 seed:demo（demo_admin / demo_sales / demo_purchase + 业务链）会因缺列失败。
-- 幂等：每列先查 information_schema，已存在则跳过。
-- ============================================================
-- 1. sys_user
SET @c095_1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'is_demo');
SET @s095_1 = IF(@c095_1 = 0,
  "ALTER TABLE sys_user ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt095_1 FROM @s095_1; EXECUTE stmt095_1; DEALLOCATE PREPARE stmt095_1;

-- 2. crm_customer
SET @c095_2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'is_demo');
SET @s095_2 = IF(@c095_2 = 0,
  "ALTER TABLE crm_customer ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt095_2 FROM @s095_2; EXECUTE stmt095_2; DEALLOCATE PREPARE stmt095_2;

-- 3. crm_contact
SET @c095_3 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact' AND COLUMN_NAME = 'is_demo');
SET @s095_3 = IF(@c095_3 = 0,
  "ALTER TABLE crm_contact ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt095_3 FROM @s095_3; EXECUTE stmt095_3; DEALLOCATE PREPARE stmt095_3;

-- 4. crm_opportunity
SET @c095_4 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_opportunity' AND COLUMN_NAME = 'is_demo');
SET @s095_4 = IF(@c095_4 = 0,
  "ALTER TABLE crm_opportunity ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt095_4 FROM @s095_4; EXECUTE stmt095_4; DEALLOCATE PREPARE stmt095_4;

-- 5. crm_follow_up
SET @c095_5 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'is_demo');
SET @s095_5 = IF(@c095_5 = 0,
  "ALTER TABLE crm_follow_up ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt095_5 FROM @s095_5; EXECUTE stmt095_5; DEALLOCATE PREPARE stmt095_5;

-- 6. crm_product
SET @c095_6 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_product' AND COLUMN_NAME = 'is_demo');
SET @s095_6 = IF(@c095_6 = 0,
  "ALTER TABLE crm_product ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt095_6 FROM @s095_6; EXECUTE stmt095_6; DEALLOCATE PREPARE stmt095_6;

-- 7. crm_quote
SET @c095_7 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_quote' AND COLUMN_NAME = 'is_demo');
SET @s095_7 = IF(@c095_7 = 0,
  "ALTER TABLE crm_quote ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt095_7 FROM @s095_7; EXECUTE stmt095_7; DEALLOCATE PREPARE stmt095_7;

-- 8. crm_contract
SET @c095_8 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contract' AND COLUMN_NAME = 'is_demo');
SET @s095_8 = IF(@c095_8 = 0,
  "ALTER TABLE crm_contract ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt095_8 FROM @s095_8; EXECUTE stmt095_8; DEALLOCATE PREPARE stmt095_8;

-- 9. crm_payment_plan
SET @c095_9 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_payment_plan' AND COLUMN_NAME = 'is_demo');
SET @s095_9 = IF(@c095_9 = 0,
  "ALTER TABLE crm_payment_plan ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt095_9 FROM @s095_9; EXECUTE stmt095_9; DEALLOCATE PREPARE stmt095_9;

-- 10. crm_payment
SET @c095_10 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_payment' AND COLUMN_NAME = 'is_demo');
SET @s095_10 = IF(@c095_10 = 0,
  "ALTER TABLE crm_payment ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt095_10 FROM @s095_10; EXECUTE stmt095_10; DEALLOCATE PREPARE stmt095_10;

-- 11. crm_supplier
SET @c095_11 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier' AND COLUMN_NAME = 'is_demo');
SET @s095_11 = IF(@c095_11 = 0,
  "ALTER TABLE crm_supplier ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt095_11 FROM @s095_11; EXECUTE stmt095_11; DEALLOCATE PREPARE stmt095_11;

-- 12. crm_approval_workflow
SET @c095_12 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_approval_workflow' AND COLUMN_NAME = 'is_demo');
SET @s095_12 = IF(@c095_12 = 0,
  "ALTER TABLE crm_approval_workflow ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Demo数据标识: 0=真实 1=Demo'",
  'SELECT 1');
PREPARE stmt095_12 FROM @s095_12; EXECUTE stmt095_12; DEALLOCATE PREPARE stmt095_12;

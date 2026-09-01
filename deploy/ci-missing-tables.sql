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

-- ============================================
-- 补充 096-104 迁移引入的列级/表级变更
-- （096 采购审批 / 097 customer business_status / 102-104 opportunity 扩展）
-- init-complete 与上述 056-095 段均未含这些列，缺列会导致对应模块查询报错。
-- 全部幂等：基于 information_schema 判断，重复执行安全。
-- ============================================

-- 096: crm_purchase_request 审批字段
SET @c096_1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_request' AND COLUMN_NAME = 'applicant_id');
SET @s096_1 = IF(@c096_1 = 0,
  "ALTER TABLE crm_purchase_request ADD COLUMN applicant_id INT NOT NULL DEFAULT 0 COMMENT '申请人'",
  'SELECT 1');
PREPARE stmt096_1 FROM @s096_1; EXECUTE stmt096_1; DEALLOCATE PREPARE stmt096_1;

SET @c096_2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_request' AND COLUMN_NAME = 'expected_amount');
SET @s096_2 = IF(@c096_2 = 0,
  "ALTER TABLE crm_purchase_request ADD COLUMN expected_amount DECIMAL(12,2) NULL DEFAULT NULL COMMENT '预计金额'",
  'SELECT 1');
PREPARE stmt096_2 FROM @s096_2; EXECUTE stmt096_2; DEALLOCATE PREPARE stmt096_2;

SET @c096_3 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_request' AND COLUMN_NAME = 'reason');
SET @s096_3 = IF(@c096_3 = 0,
  "ALTER TABLE crm_purchase_request ADD COLUMN reason TEXT NULL COMMENT '采购原因'",
  'SELECT 1');
PREPARE stmt096_3 FROM @s096_3; EXECUTE stmt096_3; DEALLOCATE PREPARE stmt096_3;

SET @c096_4 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_request' AND COLUMN_NAME = 'approved_by');
SET @s096_4 = IF(@c096_4 = 0,
  "ALTER TABLE crm_purchase_request ADD COLUMN approved_by INT NULL DEFAULT NULL COMMENT '审批人'",
  'SELECT 1');
PREPARE stmt096_4 FROM @s096_4; EXECUTE stmt096_4; DEALLOCATE PREPARE stmt096_4;

SET @c096_5 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_request' AND COLUMN_NAME = 'approved_at');
SET @s096_5 = IF(@c096_5 = 0,
  "ALTER TABLE crm_purchase_request ADD COLUMN approved_at DATETIME NULL DEFAULT NULL COMMENT '审批时间'",
  'SELECT 1');
PREPARE stmt096_5 FROM @s096_5; EXECUTE stmt096_5; DEALLOCATE PREPARE stmt096_5;

SET @c096_6 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_request' AND COLUMN_NAME = 'reject_reason');
SET @s096_6 = IF(@c096_6 = 0,
  "ALTER TABLE crm_purchase_request ADD COLUMN reject_reason TEXT NULL COMMENT '驳回原因'",
  'SELECT 1');
PREPARE stmt096_6 FROM @s096_6; EXECUTE stmt096_6; DEALLOCATE PREPARE stmt096_6;

SET @c096_7 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_request' AND COLUMN_NAME = 'created_at');
SET @s096_7 = IF(@c096_7 = 0,
  "ALTER TABLE crm_purchase_request ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  'SELECT 1');
PREPARE stmt096_7 FROM @s096_7; EXECUTE stmt096_7; DEALLOCATE PREPARE stmt096_7;

SET @c096_8 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_request' AND COLUMN_NAME = 'updated_at');
SET @s096_8 = IF(@c096_8 = 0,
  "ALTER TABLE crm_purchase_request ADD COLUMN updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
  'SELECT 1');
PREPARE stmt096_8 FROM @s096_8; EXECUTE stmt096_8; DEALLOCATE PREPARE stmt096_8;

-- 096: crm_purchase_comparison 扩展字段
SET @c096_9 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison' AND COLUMN_NAME = 'comparison_no');
SET @s096_9 = IF(@c096_9 = 0,
  "ALTER TABLE crm_purchase_comparison ADD COLUMN comparison_no VARCHAR(50) NULL DEFAULT NULL COMMENT '比价单号'",
  'SELECT 1');
PREPARE stmt096_9 FROM @s096_9; EXECUTE stmt096_9; DEALLOCATE PREPARE stmt096_9;

SET @c096_10 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison' AND COLUMN_NAME = 'product_name');
SET @s096_10 = IF(@c096_10 = 0,
  "ALTER TABLE crm_purchase_comparison ADD COLUMN product_name VARCHAR(200) NULL DEFAULT NULL COMMENT '产品名称'",
  'SELECT 1');
PREPARE stmt096_10 FROM @s096_10; EXECUTE stmt096_10; DEALLOCATE PREPARE stmt096_10;

SET @c096_11 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison' AND COLUMN_NAME = 'quantity');
SET @s096_11 = IF(@c096_11 = 0,
  "ALTER TABLE crm_purchase_comparison ADD COLUMN quantity DECIMAL(10,2) NULL DEFAULT NULL COMMENT '数量'",
  'SELECT 1');
PREPARE stmt096_11 FROM @s096_11; EXECUTE stmt096_11; DEALLOCATE PREPARE stmt096_11;

SET @c096_12 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison' AND COLUMN_NAME = 'unit');
SET @s096_12 = IF(@c096_12 = 0,
  "ALTER TABLE crm_purchase_comparison ADD COLUMN unit VARCHAR(20) NULL DEFAULT NULL COMMENT '单位'",
  'SELECT 1');
PREPARE stmt096_12 FROM @s096_12; EXECUTE stmt096_12; DEALLOCATE PREPARE stmt096_12;

SET @c096_13 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison' AND COLUMN_NAME = 'selected_supplier_id');
SET @s096_13 = IF(@c096_13 = 0,
  "ALTER TABLE crm_purchase_comparison ADD COLUMN selected_supplier_id INT NULL DEFAULT NULL COMMENT '选中供应商'",
  'SELECT 1');
PREPARE stmt096_13 FROM @s096_13; EXECUTE stmt096_13; DEALLOCATE PREPARE stmt096_13;

SET @c096_14 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison' AND COLUMN_NAME = 'created_by');
SET @s096_14 = IF(@c096_14 = 0,
  "ALTER TABLE crm_purchase_comparison ADD COLUMN created_by INT NOT NULL DEFAULT 0 COMMENT '创建人'",
  'SELECT 1');
PREPARE stmt096_14 FROM @s096_14; EXECUTE stmt096_14; DEALLOCATE PREPARE stmt096_14;

SET @c096_15 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison' AND COLUMN_NAME = 'created_at');
SET @s096_15 = IF(@c096_15 = 0,
  "ALTER TABLE crm_purchase_comparison ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  'SELECT 1');
PREPARE stmt096_15 FROM @s096_15; EXECUTE stmt096_15; DEALLOCATE PREPARE stmt096_15;

SET @c096_16 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison' AND COLUMN_NAME = 'updated_at');
SET @s096_16 = IF(@c096_16 = 0,
  "ALTER TABLE crm_purchase_comparison ADD COLUMN updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
  'SELECT 1');
PREPARE stmt096_16 FROM @s096_16; EXECUTE stmt096_16; DEALLOCATE PREPARE stmt096_16;

-- 096: crm_purchase_comparison_item
SET @c096_17 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison_item' AND COLUMN_NAME = 'payment_terms');
SET @s096_17 = IF(@c096_17 = 0,
  "ALTER TABLE crm_purchase_comparison_item ADD COLUMN payment_terms VARCHAR(200) NULL DEFAULT NULL COMMENT '付款条件'",
  'SELECT 1');
PREPARE stmt096_17 FROM @s096_17; EXECUTE stmt096_17; DEALLOCATE PREPARE stmt096_17;

SET @c096_18 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison_item' AND COLUMN_NAME = 'created_at');
SET @s096_18 = IF(@c096_18 = 0,
  "ALTER TABLE crm_purchase_comparison_item ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  'SELECT 1');
PREPARE stmt096_18 FROM @s096_18; EXECUTE stmt096_18; DEALLOCATE PREPARE stmt096_18;

-- 096: 软删除列（090 迁移的 purchase 表补充，与 090 语义一致）
SET @c096_19 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_request' AND COLUMN_NAME = 'deleted_at');
SET @s096_19 = IF(@c096_19 = 0,
  "ALTER TABLE crm_purchase_request ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '软删除时间'",
  'SELECT 1');
PREPARE stmt096_19 FROM @s096_19; EXECUTE stmt096_19; DEALLOCATE PREPARE stmt096_19;

SET @c096_20 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison' AND COLUMN_NAME = 'deleted_at');
SET @s096_20 = IF(@c096_20 = 0,
  "ALTER TABLE crm_purchase_comparison ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '软删除时间'",
  'SELECT 1');
PREPARE stmt096_20 FROM @s096_20; EXECUTE stmt096_20; DEALLOCATE PREPARE stmt096_20;

SET @c096_21 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_comparison_item' AND COLUMN_NAME = 'deleted_at');
SET @s096_21 = IF(@c096_21 = 0,
  "ALTER TABLE crm_purchase_comparison_item ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '软删除时间'",
  'SELECT 1');
PREPARE stmt096_21 FROM @s096_21; EXECUTE stmt096_21; DEALLOCATE PREPARE stmt096_21;

-- 097: crm_customer business_status + pool_status 枚举化
SET @c097_1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'business_status');
SET @s097_1 = IF(@c097_1 = 0,
  "ALTER TABLE crm_customer ADD COLUMN business_status VARCHAR(32) NOT NULL DEFAULT 'lead' COMMENT '业务生命周期: lead/following/quoted/negotiating/signed/lost'",
  'SELECT 1');
PREPARE stmt097_1 FROM @s097_1; EXECUTE stmt097_1; DEALLOCATE PREPARE stmt097_1;

SET @c097_2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'pool_status' AND DATA_TYPE = 'tinyint');
SET @s097_2 = IF(@c097_2 > 0,
  "ALTER TABLE crm_customer MODIFY COLUMN pool_status VARCHAR(8) NOT NULL DEFAULT 'private' COMMENT '资源归属: private=私有 sea=公海'",
  'SELECT 1');
PREPARE stmt097_2 FROM @s097_2; EXECUTE stmt097_2; DEALLOCATE PREPARE stmt097_2;

-- 102: crm_opportunity 扩展字段
SET @c102_1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_opportunity' AND COLUMN_NAME = 'lost_reason');
SET @s102_1 = IF(@c102_1 = 0,
  "ALTER TABLE crm_opportunity ADD COLUMN lost_reason VARCHAR(500) NULL DEFAULT NULL COMMENT '输单原因'",
  'SELECT 1');
PREPARE stmt102_1 FROM @s102_1; EXECUTE stmt102_1; DEALLOCATE PREPARE stmt102_1;

-- 103: crm_opportunity_stage_log 扩展
SET @c103_1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_opportunity_stage_log' AND COLUMN_NAME = 'opportunity_id');
SET @s103_1 = IF(@c103_1 = 0,
  "ALTER TABLE crm_opportunity_stage_log ADD COLUMN opportunity_id INT NULL DEFAULT NULL COMMENT '商机ID'",
  'SELECT 1');
PREPARE stmt103_1 FROM @s103_1; EXECUTE stmt103_1; DEALLOCATE PREPARE stmt103_1;

SET @c103_2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_opportunity_stage_log' AND COLUMN_NAME = 'from_stage');
SET @s103_2 = IF(@c103_2 = 0,
  "ALTER TABLE crm_opportunity_stage_log ADD COLUMN from_stage TINYINT NOT NULL DEFAULT 0 COMMENT '原阶段'",
  'SELECT 1');
PREPARE stmt103_2 FROM @s103_2; EXECUTE stmt103_2; DEALLOCATE PREPARE stmt103_2;

SET @c103_3 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_opportunity_stage_log' AND COLUMN_NAME = 'to_stage');
SET @s103_3 = IF(@c103_3 = 0,
  "ALTER TABLE crm_opportunity_stage_log ADD COLUMN to_stage TINYINT NOT NULL DEFAULT 0 COMMENT '目标阶段'",
  'SELECT 1');
PREPARE stmt103_3 FROM @s103_3; EXECUTE stmt103_3; DEALLOCATE PREPARE stmt103_3;

SET @c103_4 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_opportunity_stage_log' AND COLUMN_NAME = 'changed_by');
SET @s103_4 = IF(@c103_4 = 0,
  "ALTER TABLE crm_opportunity_stage_log ADD COLUMN changed_by INT NULL DEFAULT NULL COMMENT '操作人'",
  'SELECT 1');
PREPARE stmt103_4 FROM @s103_4; EXECUTE stmt103_4; DEALLOCATE PREPARE stmt103_4;

SET @c103_5 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_opportunity_stage_log' AND COLUMN_NAME = 'create_time');
SET @s103_5 = IF(@c103_5 = 0,
  "ALTER TABLE crm_opportunity_stage_log ADD COLUMN create_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
  'SELECT 1');
PREPARE stmt103_5 FROM @s103_5; EXECUTE stmt103_5; DEALLOCATE PREPARE stmt103_5;

-- 104: crm_opportunity_source 表 + opportunity_no/source_id
CREATE TABLE IF NOT EXISTS crm_opportunity_source (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL COMMENT '来源名称',
  code VARCHAR(30) NOT NULL COMMENT '来源代码',
  sort_order INT DEFAULT 0 COMMENT '排序',
  is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_source_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商机来源字典表';

SET @c104_1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_opportunity' AND COLUMN_NAME = 'opportunity_no');
SET @s104_1 = IF(@c104_1 = 0,
  "ALTER TABLE crm_opportunity ADD COLUMN opportunity_no VARCHAR(32) NULL DEFAULT NULL COMMENT '商机编号'",
  'SELECT 1');
PREPARE stmt104_1 FROM @s104_1; EXECUTE stmt104_1; DEALLOCATE PREPARE stmt104_1;

SET @c104_2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_opportunity' AND COLUMN_NAME = 'source_id');
SET @s104_2 = IF(@c104_2 = 0,
  "ALTER TABLE crm_opportunity ADD COLUMN source_id INT NULL DEFAULT NULL COMMENT '商机来源ID'",
  'SELECT 1');
PREPARE stmt104_2 FROM @s104_2; EXECUTE stmt104_2; DEALLOCATE PREPARE stmt104_2;

SET @c104_3 = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_opportunity' AND INDEX_NAME = 'uk_opportunity_no');
SET @s104_3 = IF(@c104_3 = 0,
  "ALTER TABLE crm_opportunity ADD UNIQUE INDEX uk_opportunity_no (opportunity_no)",
  'SELECT 1');
PREPARE stmt104_3 FROM @s104_3; EXECUTE stmt104_3; DEALLOCATE PREPARE stmt104_3;

SET @c104_4 = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_opportunity' AND INDEX_NAME = 'idx_source_id');
SET @s104_4 = IF(@c104_4 = 0,
  "ALTER TABLE crm_opportunity ADD INDEX idx_source_id (source_id)",
  'SELECT 1');
PREPARE stmt104_4 FROM @s104_4; EXECUTE stmt104_4; DEALLOCATE PREPARE stmt104_4;

-- ============================================
-- 补充 070/072/090/091 引入的软删除与评分规则列
-- （090 软删除 / 072 scoring_rule / 070 old_status_int / supplier 扩展）
-- ============================================

-- 090: 多表软删除 deleted_at
SET @c090_1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_attachment' AND COLUMN_NAME = 'deleted_at');
SET @s090_1 = IF(@c090_1 = 0,
  "ALTER TABLE crm_attachment ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '软删除时间'",
  'SELECT 1');
PREPARE stmt090_1 FROM @s090_1; EXECUTE stmt090_1; DEALLOCATE PREPARE stmt090_1;

SET @c090_2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_competitor_encounter' AND COLUMN_NAME = 'deleted_at');
SET @s090_2 = IF(@c090_2 = 0,
  "ALTER TABLE crm_competitor_encounter ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '软删除时间'",
  'SELECT 1');
PREPARE stmt090_2 FROM @s090_2; EXECUTE stmt090_2; DEALLOCATE PREPARE stmt090_2;

SET @c090_3 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_competitor_intel' AND COLUMN_NAME = 'deleted_at');
SET @s090_3 = IF(@c090_3 = 0,
  "ALTER TABLE crm_competitor_intel ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '软删除时间'",
  'SELECT 1');
PREPARE stmt090_3 FROM @s090_3; EXECUTE stmt090_3; DEALLOCATE PREPARE stmt090_3;

SET @c090_4 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contract_template' AND COLUMN_NAME = 'deleted_at');
SET @s090_4 = IF(@c090_4 = 0,
  "ALTER TABLE crm_contract_template ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '软删除时间'",
  'SELECT 1');
PREPARE stmt090_4 FROM @s090_4; EXECUTE stmt090_4; DEALLOCATE PREPARE stmt090_4;

SET @c090_5 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_currency' AND COLUMN_NAME = 'deleted_at');
SET @s090_5 = IF(@c090_5 = 0,
  "ALTER TABLE crm_currency ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '软删除时间'",
  'SELECT 1');
PREPARE stmt090_5 FROM @s090_5; EXECUTE stmt090_5; DEALLOCATE PREPARE stmt090_5;

SET @c090_6 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_email_account' AND COLUMN_NAME = 'deleted_at');
SET @s090_6 = IF(@c090_6 = 0,
  "ALTER TABLE crm_email_account ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '软删除时间'",
  'SELECT 1');
PREPARE stmt090_6 FROM @s090_6; EXECUTE stmt090_6; DEALLOCATE PREPARE stmt090_6;

SET @c090_7 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_product_price' AND COLUMN_NAME = 'deleted_at');
SET @s090_7 = IF(@c090_7 = 0,
  "ALTER TABLE crm_product_price ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '软删除时间'",
  'SELECT 1');
PREPARE stmt090_7 FROM @s090_7; EXECUTE stmt090_7; DEALLOCATE PREPARE stmt090_7;

SET @c090_8 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_score_rule' AND COLUMN_NAME = 'deleted_at');
SET @s090_8 = IF(@c090_8 = 0,
  "ALTER TABLE crm_score_rule ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '软删除时间'",
  'SELECT 1');
PREPARE stmt090_8 FROM @s090_8; EXECUTE stmt090_8; DEALLOCATE PREPARE stmt090_8;

SET @c090_9 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_social_contact' AND COLUMN_NAME = 'deleted_at');
SET @s090_9 = IF(@c090_9 = 0,
  "ALTER TABLE crm_social_contact ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '软删除时间'",
  'SELECT 1');
PREPARE stmt090_9 FROM @s090_9; EXECUTE stmt090_9; DEALLOCATE PREPARE stmt090_9;

SET @c090_10 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_tag' AND COLUMN_NAME = 'deleted_at');
SET @s090_10 = IF(@c090_10 = 0,
  "ALTER TABLE crm_tag ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT '软删除时间'",
  'SELECT 1');
PREPARE stmt090_10 FROM @s090_10; EXECUTE stmt090_10; DEALLOCATE PREPARE stmt090_10;

-- 070: crm_customer old_status_int（旧版数值状态备份）
SET @c070_1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'old_status_int');
SET @s070_1 = IF(@c070_1 = 0,
  "ALTER TABLE crm_customer ADD COLUMN old_status_int TINYINT NULL DEFAULT NULL COMMENT '旧版数值状态备份'",
  'SELECT 1');
PREPARE stmt070_1 FROM @s070_1; EXECUTE stmt070_1; DEALLOCATE PREPARE stmt070_1;

-- 091: crm_notification link_url
SET @c091_1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_notification' AND COLUMN_NAME = 'link_url');
SET @s091_1 = IF(@c091_1 = 0,
  "ALTER TABLE crm_notification ADD COLUMN link_url VARCHAR(500) NULL DEFAULT NULL COMMENT '跳转链接'",
  'SELECT 1');
PREPARE stmt091_1 FROM @s091_1; EXECUTE stmt091_1; DEALLOCATE PREPARE stmt091_1;

-- 072: crm_scoring_rule 评分规则字段
SET @c072_1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_scoring_rule' AND COLUMN_NAME = 'category');
SET @s072_1 = IF(@c072_1 = 0,
  "ALTER TABLE crm_scoring_rule ADD COLUMN category VARCHAR(20) NOT NULL DEFAULT 'general' COMMENT '规则分类'",
  'SELECT 1');
PREPARE stmt072_1 FROM @s072_1; EXECUTE stmt072_1; DEALLOCATE PREPARE stmt072_1;

SET @c072_2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_scoring_rule' AND COLUMN_NAME = 'rule_name');
SET @s072_2 = IF(@c072_2 = 0,
  "ALTER TABLE crm_scoring_rule ADD COLUMN rule_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '规则名称'",
  'SELECT 1');
PREPARE stmt072_2 FROM @s072_2; EXECUTE stmt072_2; DEALLOCATE PREPARE stmt072_2;

SET @c072_3 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_scoring_rule' AND COLUMN_NAME = 'min_score');
SET @s072_3 = IF(@c072_3 = 0,
  "ALTER TABLE crm_scoring_rule ADD COLUMN min_score DECIMAL(3,1) NOT NULL DEFAULT 1.0 COMMENT '最低分'",
  'SELECT 1');
PREPARE stmt072_3 FROM @s072_3; EXECUTE stmt072_3; DEALLOCATE PREPARE stmt072_3;

SET @c072_4 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_scoring_rule' AND COLUMN_NAME = 'max_score');
SET @s072_4 = IF(@c072_4 = 0,
  "ALTER TABLE crm_scoring_rule ADD COLUMN max_score DECIMAL(3,1) NOT NULL DEFAULT 5.0 COMMENT '最高分'",
  'SELECT 1');
PREPARE stmt072_4 FROM @s072_4; EXECUTE stmt072_4; DEALLOCATE PREPARE stmt072_4;

SET @c072_5 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_scoring_rule' AND COLUMN_NAME = 'weight');
SET @s072_5 = IF(@c072_5 = 0,
  "ALTER TABLE crm_scoring_rule ADD COLUMN weight DECIMAL(4,2) NOT NULL DEFAULT 1.00 COMMENT '权重'",
  'SELECT 1');
PREPARE stmt072_5 FROM @s072_5; EXECUTE stmt072_5; DEALLOCATE PREPARE stmt072_5;

SET @c072_6 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_scoring_rule' AND COLUMN_NAME = 'sort_order');
SET @s072_6 = IF(@c072_6 = 0,
  "ALTER TABLE crm_scoring_rule ADD COLUMN sort_order INT NULL DEFAULT 0 COMMENT '排序'",
  'SELECT 1');
PREPARE stmt072_6 FROM @s072_6; EXECUTE stmt072_6; DEALLOCATE PREPARE stmt072_6;

-- supplier contact/qualification 扩展（create_by/update_time）
SET @c091_2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier_contact' AND COLUMN_NAME = 'create_by');
SET @s091_2 = IF(@c091_2 = 0,
  "ALTER TABLE crm_supplier_contact ADD COLUMN create_by INT NULL DEFAULT NULL COMMENT '创建人'",
  'SELECT 1');
PREPARE stmt091_2 FROM @s091_2; EXECUTE stmt091_2; DEALLOCATE PREPARE stmt091_2;

SET @c091_3 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier_contact' AND COLUMN_NAME = 'update_time');
SET @s091_3 = IF(@c091_3 = 0,
  "ALTER TABLE crm_supplier_contact ADD COLUMN update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
  'SELECT 1');
PREPARE stmt091_3 FROM @s091_3; EXECUTE stmt091_3; DEALLOCATE PREPARE stmt091_3;

SET @c091_4 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier_qualification' AND COLUMN_NAME = 'create_by');
SET @s091_4 = IF(@c091_4 = 0,
  "ALTER TABLE crm_supplier_qualification ADD COLUMN create_by INT NULL DEFAULT NULL COMMENT '创建人'",
  'SELECT 1');
PREPARE stmt091_4 FROM @s091_4; EXECUTE stmt091_4; DEALLOCATE PREPARE stmt091_4;

SET @c091_5 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier_qualification' AND COLUMN_NAME = 'update_time');
SET @s091_5 = IF(@c091_5 = 0,
  "ALTER TABLE crm_supplier_qualification ADD COLUMN update_time DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
  'SELECT 1');
PREPARE stmt091_5 FROM @s091_5; EXECUTE stmt091_5; DEALLOCATE PREPARE stmt091_5;

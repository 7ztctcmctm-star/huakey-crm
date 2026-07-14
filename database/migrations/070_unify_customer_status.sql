-- ============================================
-- 迁移: 统一客户状态机
-- 说明: 将 status/customer_type/lifecycle_status 三套字段合并为单一 status 状态码
-- ============================================

-- 1. 创建客户状态配置表
CREATE TABLE IF NOT EXISTS sys_customer_status (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL COMMENT '状态编码',
  name VARCHAR(50) NOT NULL COMMENT '显示名称',
  sort_order INT DEFAULT 0 COMMENT '排序',
  is_default TINYINT(1) DEFAULT 0 COMMENT '是否默认状态',
  is_end TINYINT(1) DEFAULT 0 COMMENT '是否终态',
  color VARCHAR(20) DEFAULT '' COMMENT '标签颜色',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户状态配置';

-- 2. 创建状态流转规则表
CREATE TABLE IF NOT EXISTS sys_customer_status_transition (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  from_code VARCHAR(32) NOT NULL COMMENT '来源状态',
  to_code VARCHAR(32) NOT NULL COMMENT '目标状态',
  require_permission VARCHAR(50) DEFAULT NULL COMMENT '需要的权限码',
  require_reason TINYINT(1) DEFAULT 0 COMMENT '是否需要填写原因',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_transition (from_code, to_code),
  KEY idx_from_code (from_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户状态流转规则';

-- 3. 初始化默认状态
INSERT INTO sys_customer_status (code, name, sort_order, is_default, is_end, color) VALUES
('sea', '公海客户', 10, 0, 0, '#909399'),
('following', '跟进中', 20, 1, 0, '#409EFF'),
('quoted', '已报价', 30, 0, 0, '#67C23A'),
('negotiating', '谈判中', 40, 0, 0, '#E6A23C'),
('signed', '已签约', 50, 0, 1, '#67C23A'),
('lost', '已流失', 60, 0, 1, '#F56C6C'),
('paused', '暂停跟进', 70, 0, 0, '#909399')
ON DUPLICATE KEY UPDATE name=VALUES(name), sort_order=VALUES(sort_order), is_default=VALUES(is_default), is_end=VALUES(is_end), color=VALUES(color);

-- 4. 初始化流转规则
INSERT INTO sys_customer_status_transition (from_code, to_code, require_permission, require_reason) VALUES
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
('signed', 'negotiating', NULL, 1)
ON DUPLICATE KEY UPDATE from_code=from_code;

-- 5. 备份原 status 值（仅备份未删除的数据）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'old_status_int');
SET @add_col_sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN old_status_int TINYINT NULL COMMENT \'迁移前状态备份\'',
  'SELECT 1');
PREPARE add_col_stmt FROM @add_col_sql;
EXECUTE add_col_stmt;
DEALLOCATE PREPARE add_col_stmt;

UPDATE crm_customer SET old_status_int = status WHERE deleted_at IS NULL;

-- 6. 修改 status 字段类型为 varchar(32)
ALTER TABLE crm_customer MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'following';

-- 7. 映射旧状态到新状态码（仅处理未删除数据）
-- 旧状态：0=已删除(跳过), 1=潜客, 2=正式客户, 3=流失, 5=线索
UPDATE crm_customer SET status = 'following' WHERE deleted_at IS NULL AND old_status_int = 1;
UPDATE crm_customer SET status = 'signed'    WHERE deleted_at IS NULL AND old_status_int = 2;
UPDATE crm_customer SET status = 'lost'      WHERE deleted_at IS NULL AND old_status_int = 3;
UPDATE crm_customer SET status = 'following' WHERE deleted_at IS NULL AND old_status_int = 5;

-- 8. 公海客户统一设置为 sea（覆盖上述映射，确保 pool_status=1 的优先）
UPDATE crm_customer SET status = 'sea' WHERE deleted_at IS NULL AND pool_status = 1;

-- 9. 兜底：任何空值都设为 following
UPDATE crm_customer SET status = 'following' WHERE deleted_at IS NULL AND (status IS NULL OR status = '');

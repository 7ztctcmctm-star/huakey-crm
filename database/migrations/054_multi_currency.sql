-- ============================================================
-- 迁移 054: 多币种支持 + 产品价格表
-- 日期: 2026-06-11
-- ============================================================

USE huakey_crm;

-- ============================================================
-- 1. 汇率配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_currency (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(10) NOT NULL UNIQUE COMMENT '货币代码：CNY/USD/EUR/INR/GBP/AED/THB',
  name VARCHAR(50) NOT NULL COMMENT '货币名称',
  symbol VARCHAR(10) NOT NULL COMMENT '符号：¥/$/€/₹',
  exchange_rate DECIMAL(10,4) DEFAULT 1.0000 COMMENT '对人民币汇率',
  is_default TINYINT(1) DEFAULT 0 COMMENT '是否默认货币',
  status TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='货币配置表';

-- 预设货币数据
INSERT IGNORE INTO crm_currency (code, name, symbol, exchange_rate, is_default) VALUES
('CNY', '人民币', '¥', 1.0000, 1),
('USD', '美元', '$', 7.2500, 0),
('EUR', '欧元', '€', 7.8500, 0),
('INR', '印度卢比', '₹', 0.8700, 0),
('GBP', '英镑', '£', 9.1500, 0),
('AED', '迪拉姆', 'د.إ', 1.9750, 0),
('THB', '泰铢', '฿', 0.2100, 0);

-- ============================================================
-- 2. 为报价/合同添加币种字段（安全模式）
-- ============================================================

-- crm_quote 添加 currency 和 exchange_rate
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_quote' AND COLUMN_NAME = 'currency'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_quote ADD COLUMN currency VARCHAR(10) DEFAULT ''CNY'' COMMENT ''报价货币'' AFTER final_amount',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_quote' AND COLUMN_NAME = 'exchange_rate'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_quote ADD COLUMN exchange_rate DECIMAL(10,4) DEFAULT 1.0000 COMMENT ''使用汇率'' AFTER currency',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_contract 添加 currency 和 exchange_rate
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_contract' AND COLUMN_NAME = 'currency'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_contract ADD COLUMN currency VARCHAR(10) DEFAULT ''CNY'' COMMENT ''合同货币'' AFTER amount',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_contract' AND COLUMN_NAME = 'exchange_rate'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_contract ADD COLUMN exchange_rate DECIMAL(10,4) DEFAULT 1.0000 COMMENT ''使用汇率'' AFTER currency',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. 产品价格表
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_product_price (
  id INT PRIMARY KEY AUTO_INCREMENT,
  product_id INT NOT NULL COMMENT '产品ID',
  price_type VARCHAR(20) NOT NULL COMMENT '价格类型：retail/wholesale/vip/custom',
  customer_level VARCHAR(20) COMMENT '适用客户等级：A/B/C',
  unit_price DECIMAL(12,2) NOT NULL COMMENT '单价',
  min_quantity INT DEFAULT 1 COMMENT '最小起订量',
  currency VARCHAR(10) DEFAULT 'CNY' COMMENT '货币',
  valid_from DATE COMMENT '生效日期',
  valid_to DATE COMMENT '失效日期',
  status TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pp_product (product_id),
  INDEX idx_pp_type (price_type),
  INDEX idx_pp_level (customer_level),
  FOREIGN KEY (product_id) REFERENCES crm_product(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='产品价格表';

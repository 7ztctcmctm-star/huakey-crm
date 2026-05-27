-- 021_follow_plan_and_pool_type.sql
-- 创建跟进计划表 + 给客户表添加池类型字段

-- 1. 创建跟进计划表
CREATE TABLE IF NOT EXISTS crm_follow_plan (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    contact_id INT DEFAULT NULL COMMENT '联系人ID',
    plan_time DATETIME NOT NULL COMMENT '计划跟进时间',
    plan_content VARCHAR(500) NOT NULL COMMENT '计划内容',
    follow_type VARCHAR(20) DEFAULT '电话' COMMENT '跟进方式',
    status ENUM('pending','completed','overdue') DEFAULT 'pending' COMMENT '状态',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',

    INDEX idx_fp_customer (customer_id),
    INDEX idx_fp_plan_time (plan_time),
    INDEX idx_fp_status (status),
    INDEX idx_fp_create_by (create_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='跟进计划表';

-- 2. 给crm_customer添加pool_type字段（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'pool_type');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN pool_type ENUM(''public'',''private'') DEFAULT ''public'' COMMENT ''池类型'' AFTER pool_status',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 添加pool_type索引（幂等）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_customer_pool_type');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_customer_pool_type ON crm_customer(pool_type)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

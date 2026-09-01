-- ============================================================
-- 迁移: 基础数据质量保障
-- 日期: 2026-05-25
-- 说明: 创建验证规则表、质量报告表、为客户表添加唯一索引和 deleted_at
-- ============================================================

USE huakey_crm;

-- 1. 为 crm_customer 添加 deleted_at（统一软删除方式，当前用 status=0）
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'huakey_crm'
  AND TABLE_NAME = 'crm_customer'
  AND COLUMN_NAME = 'deleted_at';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间'' AFTER update_time',
  'SELECT ''crm_customer.deleted_at already exists'' AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 为 crm_customer 添加唯一索引 uk_company_phone（company_name + phone）
-- 注意：phone 允许 NULL，MySQL 唯一索引中多行 NULL 不冲突
SELECT COUNT(*) INTO @idx_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'huakey_crm'
  AND TABLE_NAME = 'crm_customer'
  AND INDEX_NAME = 'uk_company_phone';

SET @sql2 = IF(@idx_exists = 0,
  'ALTER TABLE crm_customer ADD UNIQUE KEY uk_company_phone (company_name, phone)',
  'SELECT ''uk_company_phone already exists'' AS msg');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 3. 为 crm_supplier 添加唯一索引 uk_supplier_name（name）
SELECT COUNT(*) INTO @idx_exists2
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'huakey_crm'
  AND TABLE_NAME = 'crm_supplier'
  AND INDEX_NAME = 'uk_supplier_name';

SET @sql3 = IF(@idx_exists2 = 0,
  'ALTER TABLE crm_supplier ADD UNIQUE KEY uk_supplier_name (name)',
  'SELECT ''uk_supplier_name already exists'' AS msg');
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- 4. 数据验证规则表
CREATE TABLE IF NOT EXISTS sys_validation_rule (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '规则ID',
    table_name VARCHAR(50) NOT NULL COMMENT '表名',
    column_name VARCHAR(50) NOT NULL COMMENT '列名',
    rule_type ENUM('required', 'unique', 'format', 'range', 'custom') NOT NULL COMMENT '规则类型',
    rule_config JSON COMMENT '规则配置',
    error_message VARCHAR(200) COMMENT '错误提示',
    is_active TINYINT DEFAULT 1 COMMENT '是否启用',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_table_column (table_name, column_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据验证规则表';

-- 5. 数据质量报告表
CREATE TABLE IF NOT EXISTS sys_data_quality_report (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '报告ID',
    table_name VARCHAR(50) NOT NULL COMMENT '表名',
    total_count INT DEFAULT 0 COMMENT '总记录数',
    duplicate_count INT DEFAULT 0 COMMENT '重复记录数',
    invalid_count INT DEFAULT 0 COMMENT '无效记录数',
    missing_count INT DEFAULT 0 COMMENT '缺失记录数',
    quality_score DECIMAL(5,2) DEFAULT 0.00 COMMENT '质量评分',
    check_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '检查时间',
    INDEX idx_table_name (table_name),
    INDEX idx_check_time (check_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据质量报告表';

-- 6. 插入默认验证规则
INSERT IGNORE INTO sys_validation_rule (table_name, column_name, rule_type, rule_config, error_message) VALUES
('crm_customer', 'company_name', 'required', NULL, '公司名称不能为空'),
('crm_customer', 'phone', 'format', '{"pattern": "^$|^\\\\+?\\\\d{7,20}$"}', '电话格式不正确（7-20位数字）'),
('crm_customer', 'email', 'format', '{"pattern": "^$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\.[a-zA-Z]{2,}$"}', '邮箱格式不正确'),
('crm_customer', 'level', 'range', '{"values": ["A","B","C","D"]}', '客户等级必须为 A/B/C/D'),
('crm_supplier', 'name', 'required', NULL, '供应商名称不能为空');

-- 7. 新增权限点
INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort) VALUES
('数据质量检查', 'data_quality:check', 'button', 2, 10);

INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT 1, id FROM sys_permission WHERE code = 'data_quality:check';

-- 8. 迁移版本由 run_migrations.js 统一以文件名注册（内嵌中文自注册破坏 rollback 的 down 文件定位）

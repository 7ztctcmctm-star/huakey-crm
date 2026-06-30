-- ============================================================
-- TASK-002: 数据保护机制完善
-- 日期: 2026-05-25
-- ============================================================

USE huakey_crm;

-- 1. 为缺失deleted_at的表添加字段
SET @db = DATABASE();

-- crm_product
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_product' AND COLUMN_NAME = 'deleted_at';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_product ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_follow_up
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_follow_up' AND COLUMN_NAME = 'deleted_at';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_follow_up ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_pool_log
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_pool_log' AND COLUMN_NAME = 'deleted_at';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_pool_log ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sys_dept
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sys_dept' AND COLUMN_NAME = 'deleted_at';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE sys_dept ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sys_role
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sys_role' AND COLUMN_NAME = 'deleted_at';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE sys_role ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sys_user
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'deleted_at';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE sys_user ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 为deleted_at字段添加索引提升查询性能
SELECT COUNT(*) INTO @idx_exists FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_product' AND INDEX_NAME = 'idx_deleted_at';
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_product ADD INDEX idx_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. 操作日志表（已废弃双表方案，统一使用 sys_log）
-- CREATE TABLE IF NOT EXISTS sys_operation_log (
--     id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '日志ID',
--     user_id INT DEFAULT NULL COMMENT '用户ID',
--     username VARCHAR(50) DEFAULT NULL COMMENT '用户名',
--     module VARCHAR(50) DEFAULT NULL COMMENT '模块名称',
--     operation VARCHAR(100) DEFAULT NULL COMMENT '操作类型',
--     method VARCHAR(200) DEFAULT NULL COMMENT '方法名',
--     params TEXT COMMENT '请求参数',
--     result TEXT COMMENT '返回结果摘要',
--     ip VARCHAR(50) DEFAULT NULL COMMENT '操作IP',
--     user_agent VARCHAR(500) DEFAULT NULL COMMENT '用户代理',
--     execution_time INT DEFAULT NULL COMMENT '执行时长(ms)',
--     status TINYINT DEFAULT 1 COMMENT '状态：1成功 0失败',
--     error_msg TEXT COMMENT '错误信息',
--     create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
--     INDEX idx_user_id (user_id),
--     INDEX idx_module (module),
--     INDEX idx_create_time (create_time),
--     INDEX idx_status (status)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='详细操作日志表';

-- 4. 数据备份记录表
CREATE TABLE IF NOT EXISTS sys_backup_record (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '备份ID',
    backup_type ENUM('full', 'incremental') DEFAULT 'full' COMMENT '备份类型',
    file_name VARCHAR(200) NOT NULL COMMENT '备份文件名',
    file_path VARCHAR(500) NOT NULL COMMENT '备份文件路径',
    file_size BIGINT DEFAULT 0 COMMENT '文件大小(bytes)',
    status ENUM('running', 'success', 'failed') DEFAULT 'running' COMMENT '状态',
    error_msg TEXT COMMENT '错误信息',
    create_by INT DEFAULT NULL COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_create_time (create_time),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据备份记录表';

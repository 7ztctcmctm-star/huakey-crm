-- ============================================================
-- 迁移: 老板权限 + 客户分配日志 + 跟进提醒
-- 日期: 2026-05-18
-- 兼容 MySQL 5.7+ / 8.0
-- ============================================================

USE huakey_crm;

-- Step 1: sys_role 增加权限标识字段（安全添加，已存在则跳过）
SET @db_name = 'huakey_crm';

-- 检查并添加 view_all 列
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'sys_role' AND COLUMN_NAME = 'view_all');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sys_role ADD COLUMN view_all TINYINT DEFAULT 0 COMMENT ''查看全部数据权限''',
  'SELECT ''view_all already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 检查并添加 manage_all 列
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'sys_role' AND COLUMN_NAME = 'manage_all');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sys_role ADD COLUMN manage_all TINYINT DEFAULT 0 COMMENT ''管理全部数据权限''',
  'SELECT ''manage_all already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 超级管理员拥有全部权限
UPDATE sys_role SET view_all = 1, manage_all = 1 WHERE code = 'super_admin';

-- 管理员也拥有全部权限
UPDATE sys_role SET view_all = 1, manage_all = 1 WHERE code = 'admin';

-- 新增老板角色
INSERT INTO sys_role (name, code, description, status, view_all, manage_all)
SELECT '老板', 'boss', '公司老板，查看全公司数据，分配客户', 1, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE code = 'boss');

-- Step 2: sys_user 增加上级ID字段（安全添加）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'manager_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sys_user ADD COLUMN manager_id INT DEFAULT NULL COMMENT ''直属上级ID''',
  'SELECT ''manager_id already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Step 3: 创建客户分配日志表
CREATE TABLE IF NOT EXISTS crm_assign_log (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    from_user_id INT DEFAULT NULL COMMENT '原负责人ID',
    to_user_id INT NOT NULL COMMENT '新负责人ID',
    operator_id INT NOT NULL COMMENT '操作人ID',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '分配时间',

    INDEX idx_assign_customer (customer_id),
    INDEX idx_assign_operator (operator_id),
    INDEX idx_assign_to_user (to_user_id),
    INDEX idx_assign_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户分配日志表';

-- Step 4: 创建跟进提醒表
CREATE TABLE IF NOT EXISTS crm_follow_up_reminder (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    owner_id INT DEFAULT NULL COMMENT '客户负责人ID',
    manager_id INT DEFAULT NULL COMMENT '负责人上级ID',
    reminder_type VARCHAR(20) DEFAULT 'overdue' COMMENT '提醒类型: overdue=逾期未跟进',
    reminder_date DATE NOT NULL COMMENT '提醒日期',
    is_read TINYINT DEFAULT 0 COMMENT '是否已读(0未读/1已读)',
    is_dismissed TINYINT DEFAULT 0 COMMENT '是否已处理(0未处理/1已处理)',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    UNIQUE KEY uk_customer_date (customer_id, reminder_date),
    INDEX idx_reminder_owner (owner_id),
    INDEX idx_reminder_is_read (is_read),
    INDEX idx_reminder_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='跟进提醒表';

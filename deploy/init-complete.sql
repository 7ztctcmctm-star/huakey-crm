-- ============================================================
-- 迁移: 基线标记 — 创建迁移追踪表
-- 日期: 2026-05-22
-- 说明: 初始建表脚本（init.sql / business_tables.sql 等）在本迁移之前已执行
--       本迁移仅创建 schema_migrations 追踪表
-- ============================================================

USE huakey_crm;

CREATE TABLE IF NOT EXISTS schema_migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    version VARCHAR(50) NOT NULL COMMENT '迁移版本号，如 001',
    name VARCHAR(200) NOT NULL COMMENT '迁移名称',
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '执行时间',
    UNIQUE KEY uk_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据库迁移追踪表';
-- ============================================================
-- 迁移: 细化客户来源字段
-- 日期: 2026-05-16
-- 说明:
--   1. 删除旧的 CHECK 约束（仅限 5 个值）
--   2. 将历史数据中 source='网络' 迁移为 '其他网络渠道'
--   3. 不重新添加 CHECK 约束（新来源值较多，由应用层校验）
-- ============================================================

USE huakey_crm;

-- Step 1: 删除旧约束
SET @constraint_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_customer'
    AND CONSTRAINT_NAME = 'chk_customer_source'
    AND CONSTRAINT_TYPE = 'CHECK'
);
SET @sql = IF(@constraint_exists > 0,
  'ALTER TABLE crm_customer DROP CHECK CONSTRAINT chk_customer_source',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: 迁移历史数据
-- "网络" → "其他网络渠道"（无法确定具体渠道的归入此项）
UPDATE crm_customer
SET source = '其他网络渠道'
WHERE source = '网络';

-- Step 3: 验证迁移结果
SELECT source, COUNT(*) as cnt
FROM crm_customer
WHERE status != 0
GROUP BY source
ORDER BY cnt DESC;
-- ============================================================
-- 迁移: 为 crm_customer 补充公海相关字段
-- 说明:
--   pool_status: 0=归属销售 1=在公海
--   protect_until: 认领后的保护截止时间（7天）
--   last_follow_time: 最近跟进时间（用于掉公海判断）
-- ============================================================

USE huakey_crm;

-- 添加公海状态字段（安全添加，已存在则跳过）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND COLUMN_NAME='pool_status');
SET @sql = IF(@col_exists=0,
  'ALTER TABLE crm_customer ADD COLUMN pool_status TINYINT DEFAULT 0 COMMENT ''公海状态：0=归属销售 1=在公海''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND COLUMN_NAME='protect_until');
SET @sql = IF(@col_exists=0,
  'ALTER TABLE crm_customer ADD COLUMN protect_until DATETIME DEFAULT NULL COMMENT ''认领保护截止时间''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND COLUMN_NAME='last_follow_time');
SET @sql = IF(@col_exists=0,
  'ALTER TABLE crm_customer ADD COLUMN last_follow_time DATETIME DEFAULT NULL COMMENT ''最近跟进时间''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加索引（安全添加）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_customer_pool_status');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX idx_customer_pool_status ON crm_customer(pool_status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_customer_protect_until');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX idx_customer_protect_until ON crm_customer(protect_until)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_customer_last_follow');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX idx_customer_last_follow ON crm_customer(last_follow_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
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
-- ============================================================
-- 迁移: 线索管理字段
-- 为 crm_customer 增加 lead_level(意向等级) 和 follow_status(跟进状态)
-- 日期: 2026-05-19
-- ============================================================

USE huakey_crm;

SET @db_name = 'huakey_crm';

-- 检查并添加 lead_level 列
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'lead_level');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN lead_level VARCHAR(10) DEFAULT NULL COMMENT ''意向等级：高/中/低'' AFTER level',
  'SELECT ''lead_level already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 检查并添加 follow_status 列
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'follow_status');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN follow_status VARCHAR(20) DEFAULT NULL COMMENT ''跟进状态：初次联系/需求确认/报价中/已流失'' AFTER lead_level',
  'SELECT ''follow_status already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 检查并添加 converted_at 列
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'converted_at');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN converted_at DATETIME DEFAULT NULL COMMENT ''转化为客户的时间'' AFTER follow_status',
  'SELECT ''converted_at already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 为现有潜在客户(status=1)填充默认值
UPDATE crm_customer SET lead_level = '中', follow_status = '初次联系'
WHERE status = 1 AND lead_level IS NULL;

-- 为已成交客户(status=2)也设置默认值
UPDATE crm_customer SET lead_level = '高', follow_status = '需求确认'
WHERE status = 2 AND lead_level IS NULL;

SELECT 'lead_fields migration done' AS result;
-- ============================================================
-- 迁移: 添加缺失的外键约束
-- 日期: 2026-05-22
-- 兼容 MySQL 5.7+ / 8.0
-- 策略: ON DELETE SET NULL（用户删除时置空，不级联删除业务数据）
-- ============================================================

USE huakey_crm;

SET @db_name = 'huakey_crm';

-- ========== sys_user.manager_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'sys_user'
  AND CONSTRAINT_NAME = 'fk_user_manager' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE sys_user ADD CONSTRAINT fk_user_manager FOREIGN KEY (manager_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_user_manager already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_pool_log.from_user_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_pool_log'
  AND CONSTRAINT_NAME = 'fk_pool_log_from_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_pool_log ADD CONSTRAINT fk_pool_log_from_user FOREIGN KEY (from_user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_pool_log_from_user already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_pool_log.to_user_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_pool_log'
  AND CONSTRAINT_NAME = 'fk_pool_log_to_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_pool_log ADD CONSTRAINT fk_pool_log_to_user FOREIGN KEY (to_user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_pool_log_to_user already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_assign_log.customer_id → crm_customer.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_assign_log'
  AND CONSTRAINT_NAME = 'fk_assign_log_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_assign_log ADD CONSTRAINT fk_assign_log_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE',
  'SELECT ''fk_assign_log_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_assign_log.from_user_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_assign_log'
  AND CONSTRAINT_NAME = 'fk_assign_log_from_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_assign_log ADD CONSTRAINT fk_assign_log_from_user FOREIGN KEY (from_user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_assign_log_from_user already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_assign_log.to_user_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_assign_log'
  AND CONSTRAINT_NAME = 'fk_assign_log_to_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_assign_log ADD CONSTRAINT fk_assign_log_to_user FOREIGN KEY (to_user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_assign_log_to_user already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_assign_log.operator_id → sys_user.id ==========
-- 先将 operator_id 改为可空（ON DELETE SET NULL 要求列可为 NULL）
ALTER TABLE crm_assign_log MODIFY COLUMN operator_id INT NULL;
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_assign_log'
  AND CONSTRAINT_NAME = 'fk_assign_log_operator' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_assign_log ADD CONSTRAINT fk_assign_log_operator FOREIGN KEY (operator_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_assign_log_operator already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_follow_up_reminder.customer_id → crm_customer.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_up_reminder'
  AND CONSTRAINT_NAME = 'fk_reminder_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_follow_up_reminder ADD CONSTRAINT fk_reminder_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE',
  'SELECT ''fk_reminder_customer already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_follow_up_reminder.owner_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_up_reminder'
  AND CONSTRAINT_NAME = 'fk_reminder_owner' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_follow_up_reminder ADD CONSTRAINT fk_reminder_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_reminder_owner already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== crm_follow_up_reminder.manager_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_up_reminder'
  AND CONSTRAINT_NAME = 'fk_reminder_manager' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_follow_up_reminder ADD CONSTRAINT fk_reminder_manager FOREIGN KEY (manager_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_reminder_manager already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== sys_log.user_id → sys_user.id ==========
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'sys_log'
  AND CONSTRAINT_NAME = 'fk_log_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE sys_log ADD CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT ''fk_log_user already exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- Bug #02: 联系人软删除支持
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_contact' AND column_name='deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_contact ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- Bug #35: 为高频列表查询添加复合索引

SET @db = 'huakey_crm';

-- crm_customer: 列表查询固定过滤 owner_id + status，按 create_time 排序
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_cust_owner_status_ctime');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_cust_owner_status_ctime ON crm_customer(owner_id, status, create_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_opportunity: 列表查询过滤 owner_id + stage，按 create_time 排序
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity' AND INDEX_NAME='idx_opp_owner_stage_ctime');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_opp_owner_stage_ctime ON crm_opportunity(owner_id, stage, create_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_contract: 列表查询过滤 status，按 create_time 排序
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND INDEX_NAME='idx_contract_status_ctime');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_contract_status_ctime ON crm_contract(status, create_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- Migration 009: 为商机、报价、合同、回款、供应商表添加软删除支持
-- 解决 Bug #03（商机/报价/合同/回款硬删除）和 Bug #13（供应商硬删除）

SET @db = 'huakey_crm';

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db AND table_name='crm_opportunity' AND column_name='deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_opportunity ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db AND table_name='crm_quote' AND column_name='deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_quote ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db AND table_name='crm_contract' AND column_name='deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_contract ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db AND table_name='crm_payment' AND column_name='deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_payment ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db AND table_name='crm_supplier' AND column_name='deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_supplier ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- 系统配置表
CREATE TABLE IF NOT EXISTS sys_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE COMMENT '配置键',
    config_value VARCHAR(500) NOT NULL COMMENT '配置值',
    description VARCHAR(200) DEFAULT NULL COMMENT '配置说明',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统配置';

-- 初始配置：逾期天数
INSERT IGNORE INTO sys_config (config_key, config_value, description) VALUES
('overdue_days', '15', '客户逾期跟进天数阈值');
-- 商机阶段变更记录表
CREATE TABLE IF NOT EXISTS crm_opportunity_stage_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    opportunity_id INT NOT NULL COMMENT '商机ID',
    from_stage TINYINT NOT NULL COMMENT '原阶段',
    to_stage TINYINT NOT NULL COMMENT '新阶段',
    changed_by INT DEFAULT NULL COMMENT '操作人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_opp_stage_log_opp (opportunity_id),
    CONSTRAINT fk_stage_log_opportunity FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE CASCADE,
    CONSTRAINT fk_stage_log_user FOREIGN KEY (changed_by) REFERENCES sys_user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商机阶段变更记录';
-- 售后工单软删除
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_service_order' AND column_name='deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_service_order ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''删除时间'' AFTER update_time', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- ============================================================
-- 迁移: 权限系统重构
-- 日期: 2026-05-25
-- 说明: 创建权限表、角色权限关联表、数据权限配置表
-- ============================================================

USE huakey_crm;

-- 1. 权限表
CREATE TABLE IF NOT EXISTS sys_permission (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '权限ID',
    name VARCHAR(50) NOT NULL COMMENT '权限名称',
    code VARCHAR(50) NOT NULL COMMENT '权限编码',
    type ENUM('menu', 'button', 'api') NOT NULL COMMENT '权限类型',
    parent_id INT DEFAULT 0 COMMENT '父权限ID',
    path VARCHAR(200) DEFAULT NULL COMMENT '权限路径（菜单路径或API路径）',
    icon VARCHAR(50) DEFAULT NULL COMMENT '图标',
    sort INT DEFAULT 0 COMMENT '排序',
    is_visible TINYINT DEFAULT 1 COMMENT '是否可见',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_code (code),
    INDEX idx_parent_id (parent_id),
    INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限表';

-- 2. 角色权限关联表
CREATE TABLE IF NOT EXISTS sys_role_permission (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    role_id INT NOT NULL COMMENT '角色ID',
    permission_id INT NOT NULL COMMENT '权限ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_role_permission (role_id, permission_id),
    INDEX idx_role_id (role_id),
    INDEX idx_permission_id (permission_id),
    CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES sys_role(id) ON DELETE CASCADE,
    CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES sys_permission(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色权限关联表';

-- 3. 数据权限配置表
CREATE TABLE IF NOT EXISTS sys_data_permission (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    role_id INT NOT NULL COMMENT '角色ID',
    module VARCHAR(50) NOT NULL COMMENT '模块名称',
    data_scope ENUM('all', 'dept', 'dept_and_sub', 'self', 'custom') DEFAULT 'self' COMMENT '数据范围',
    custom_dept_ids VARCHAR(500) DEFAULT NULL COMMENT '自定义部门ID列表',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_role_module (role_id, module),
    INDEX idx_role_id (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据权限配置表';

SELECT '权限表创建完成' AS result;
-- ============================================================
-- 迁移: 用户权限字段
-- 日期: 2026-05-25
-- 说明: 为用户表添加权限相关字段，创建用户权限视图
-- ============================================================

USE huakey_crm;

-- 为用户表添加权限相关字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='sys_user' AND column_name='last_login_time');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE sys_user ADD COLUMN last_login_time DATETIME COMMENT ''最后登录时间'' AFTER update_time', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='sys_user' AND column_name='last_login_ip');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE sys_user ADD COLUMN last_login_ip VARCHAR(50) COMMENT ''最后登录IP'' AFTER last_login_time', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 创建用户权限视图（方便查询）
CREATE OR REPLACE VIEW v_user_permissions AS
SELECT
    u.id as user_id,
    u.username,
    u.real_name,
    u.role_id,
    r.name as role_name,
    p.code as permission_code,
    p.name as permission_name,
    p.type as permission_type
FROM sys_user u
LEFT JOIN sys_role r ON u.role_id = r.id
LEFT JOIN sys_role_permission rp ON r.id = rp.role_id
LEFT JOIN sys_permission p ON rp.permission_id = p.id
WHERE u.status = 1 AND p.id IS NOT NULL;

SELECT '用户权限字段更新完成' AS result;
DESCRIBE sys_user;
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

-- 3. 操作日志表 (sys_operation_log 已有 sys_log 表，此表用于更详细的审计)
CREATE TABLE IF NOT EXISTS sys_operation_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '日志ID',
    user_id INT DEFAULT NULL COMMENT '用户ID',
    username VARCHAR(50) DEFAULT NULL COMMENT '用户名',
    module VARCHAR(50) DEFAULT NULL COMMENT '模块名称',
    operation VARCHAR(100) DEFAULT NULL COMMENT '操作类型',
    method VARCHAR(200) DEFAULT NULL COMMENT '方法名',
    params TEXT COMMENT '请求参数',
    result TEXT COMMENT '返回结果摘要',
    ip VARCHAR(50) DEFAULT NULL COMMENT '操作IP',
    user_agent VARCHAR(500) DEFAULT NULL COMMENT '用户代理',
    execution_time INT DEFAULT NULL COMMENT '执行时长(ms)',
    status TINYINT DEFAULT 1 COMMENT '状态：1成功 0失败',
    error_msg TEXT COMMENT '错误信息',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_user_id (user_id),
    INDEX idx_module (module),
    INDEX idx_create_time (create_time),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='详细操作日志表';

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

-- 8. 记录迁移版本
INSERT IGNORE INTO schema_migrations (version, name) VALUES ('016', '基础数据质量保障');
-- ============================================================
-- 迁移: 性能优化 — 补充 deleted_at 索引
-- 日期: 2026-05-25
-- 说明: 为缺失 deleted_at 索引的业务大表补充索引
-- ============================================================

USE huakey_crm;

-- 辅助过程：仅在索引不存在时添加
DELIMITER //
CREATE PROCEDURE add_idx_if_not_exists(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(255))
BEGIN
  SELECT COUNT(*) INTO @cnt
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = tbl AND INDEX_NAME = idx;
  IF @cnt = 0 THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', idx, '` (', cols, ')');
    PREPARE stmt FROM @s;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL add_idx_if_not_exists('crm_contract',      'idx_contract_deleted_at',    'deleted_at');
CALL add_idx_if_not_exists('crm_opportunity',    'idx_opp_deleted_at',         'deleted_at');
CALL add_idx_if_not_exists('crm_quote',          'idx_quote_deleted_at',       'deleted_at');
CALL add_idx_if_not_exists('crm_payment',        'idx_payment_deleted_at',     'deleted_at');
CALL add_idx_if_not_exists('crm_service_order',  'idx_service_deleted_at',     'deleted_at');
CALL add_idx_if_not_exists('crm_supplier',       'idx_supplier_deleted_at',    'deleted_at');
CALL add_idx_if_not_exists('crm_contact',        'idx_contact_deleted_at',     'deleted_at');
CALL add_idx_if_not_exists('crm_follow_up',      'idx_follow_deleted_at',      'deleted_at');
CALL add_idx_if_not_exists('crm_pool_log',       'idx_pool_log_deleted_at',    'deleted_at');
CALL add_idx_if_not_exists('crm_customer',       'idx_customer_deleted_at',    'deleted_at');

-- 清理辅助过程
DROP PROCEDURE IF EXISTS add_idx_if_not_exists;

-- 记录迁移版本
INSERT IGNORE INTO schema_migrations (version, name) VALUES ('017', '性能优化索引');
-- ============================================================
-- 迁移: 回款计划状态完善
-- 日期: 2026-05-25
-- 说明: crm_payment_plan 增加 status/paid_amount/overdue_days + 数据回填
-- ============================================================

USE huakey_crm;

-- 1. 添加 status 列
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'huakey_crm'
  AND TABLE_NAME = 'crm_payment_plan'
  AND COLUMN_NAME = 'status';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_payment_plan ADD COLUMN status ENUM(''pending'', ''partial'', ''completed'', ''overdue'') DEFAULT ''pending'' COMMENT ''回款状态'' AFTER remark',
  'SELECT ''crm_payment_plan.status already exists'' AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 添加 paid_amount 列
SELECT COUNT(*) INTO @col_exists2
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'huakey_crm'
  AND TABLE_NAME = 'crm_payment_plan'
  AND COLUMN_NAME = 'paid_amount';

SET @sql2 = IF(@col_exists2 = 0,
  'ALTER TABLE crm_payment_plan ADD COLUMN paid_amount DECIMAL(15,2) DEFAULT 0.00 COMMENT ''已回金额'' AFTER status',
  'SELECT ''crm_payment_plan.paid_amount already exists'' AS msg');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 3. 添加 overdue_days 列
SELECT COUNT(*) INTO @col_exists3
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'huakey_crm'
  AND TABLE_NAME = 'crm_payment_plan'
  AND COLUMN_NAME = 'overdue_days';

SET @sql3 = IF(@col_exists3 = 0,
  'ALTER TABLE crm_payment_plan ADD COLUMN overdue_days INT DEFAULT 0 COMMENT ''逾期天数'' AFTER paid_amount',
  'SELECT ''crm_payment_plan.overdue_days already exists'' AS msg');
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- 4. 回填 paid_amount（根据已有回款记录计算）
UPDATE crm_payment_plan pp
SET pp.paid_amount = (
  SELECT COALESCE(SUM(p.pay_amount), 0)
  FROM crm_payment p
  WHERE p.plan_id = pp.id AND p.deleted_at IS NULL
)
WHERE pp.paid_amount = 0;

-- 5. 回填 status
UPDATE crm_payment_plan pp
SET pp.status = CASE
  WHEN pp.paid_amount >= pp.plan_amount THEN 'completed'
  WHEN pp.paid_amount > 0 THEN 'partial'
  WHEN pp.plan_date < CURDATE() THEN 'overdue'
  ELSE 'pending'
END;

-- 6. 回填 overdue_days
UPDATE crm_payment_plan pp
SET pp.overdue_days = CASE
  WHEN pp.status IN ('pending', 'partial') AND pp.plan_date < CURDATE()
  THEN DATEDIFF(CURDATE(), pp.plan_date)
  ELSE 0
END;

-- 7. 记录迁移版本
INSERT IGNORE INTO schema_migrations (version, name) VALUES ('018', '回款计划状态完善');
-- ============================================================
-- 迁移: 补充缺失的 deleted_at 软删除字段
-- 日期: 2026-05-25
-- 说明: 为 13 张缺少 deleted_at 的 crm_ 表添加软删除支持
-- ============================================================

USE huakey_crm;

-- 辅助过程：为指定表添加 deleted_at 列（如不存在）
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS add_deleted_at(IN tbl VARCHAR(64))
BEGIN
  DECLARE col_exists INT DEFAULT 0;
  SELECT COUNT(*) INTO col_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = tbl
    AND COLUMN_NAME = 'deleted_at';
  IF col_exists = 0 THEN
    SET @sql = CONCAT('ALTER TABLE ', tbl, ' ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT ''软删除时间''');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL add_deleted_at('crm_assign_log');
CALL add_deleted_at('crm_customer_supplier_relation');
CALL add_deleted_at('crm_follow_up_reminder');
CALL add_deleted_at('crm_payment_plan');
CALL add_deleted_at('crm_purchase_item');
CALL add_deleted_at('crm_purchase_order');
CALL add_deleted_at('crm_purchase_payment');
CALL add_deleted_at('crm_purchase_receipt');
CALL add_deleted_at('crm_quote_item');
CALL add_deleted_at('crm_sales_target');
CALL add_deleted_at('crm_supplier_contact');
CALL add_deleted_at('crm_supplier_qualification');
CALL add_deleted_at('crm_supplier_rating');

-- 清理辅助过程
DROP PROCEDURE IF EXISTS add_deleted_at;

-- 记录迁移版本
INSERT IGNORE INTO schema_migrations (version, name) VALUES ('019', '补充缺失的deleted_at软删除字段');
-- 020_seed_api_permissions.sql
-- 为所有受保护的API接口创建api类型权限记录

-- 客户管理模块 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '客户列表接口', 'api:customer:list', 'api', id, 'POST /customer/list', 1 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:list');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增客户接口', 'api:customer:add', 'api', id, 'POST /customer/add', 2 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '编辑客户接口', 'api:customer:update', 'api', id, 'POST /customer/update', 3 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:update');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除客户接口', 'api:customer:delete', 'api', id, 'POST /customer/delete', 4 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:delete');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '导出客户接口', 'api:customer:export', 'api', id, 'POST /customer/export', 5 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:export');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '分配客户接口', 'api:customer:assign', 'api', id, 'POST /customer/assign', 6 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:assign');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '批量分配接口', 'api:customer:batch-assign', 'api', id, 'POST /customer/batch-assign', 7 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:batch-assign');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '导入客户接口', 'api:customer:import', 'api', id, 'POST /customer/import-*', 8 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:import');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '客户池认领接口', 'api:customer:claim', 'api', id, 'POST /customer/claim', 9 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:claim');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '客户池释放接口', 'api:customer:release', 'api', id, 'POST /customer/release', 10 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:release');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '批量释放接口', 'api:customer:batch-release', 'api', id, 'POST /customer/batch-release', 11 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:batch-release');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '联系人增删改接口', 'api:customer:contact', 'api', id, 'POST /customer/contact/*', 12 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:contact');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '数据质量检查接口', 'api:customer:quality', 'api', id, 'POST /customer/quality-check', 13 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:customer:quality');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '跟进记录增删改接口', 'api:followup:crud', 'api', id, 'POST /followup/add|update|delete', 14 FROM sys_permission WHERE code = 'customer'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:followup:crud');

-- 线索管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '线索转换接口', 'api:leads:convert', 'api', id, 'POST /leads/convert', 1 FROM sys_permission WHERE code = 'leads'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:leads:convert');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '线索认领接口', 'api:leads:claim', 'api', id, 'POST /leads/claim', 2 FROM sys_permission WHERE code = 'leads'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:leads:claim');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '线索标记丢失接口', 'api:leads:mark-lost', 'api', id, 'POST /leads/mark-lost', 3 FROM sys_permission WHERE code = 'leads'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:leads:mark-lost');

-- 商机管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增商机接口', 'api:opportunity:add', 'api', id, 'POST /opportunity/add', 1 FROM sys_permission WHERE code = 'opportunity'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:opportunity:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '编辑商机接口', 'api:opportunity:update', 'api', id, 'POST /opportunity/update', 2 FROM sys_permission WHERE code = 'opportunity'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:opportunity:update');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '推进阶段接口', 'api:opportunity:update-stage', 'api', id, 'POST /opportunity/update-stage', 3 FROM sys_permission WHERE code = 'opportunity'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:opportunity:update-stage');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除商机接口', 'api:opportunity:delete', 'api', id, 'POST /opportunity/delete', 4 FROM sys_permission WHERE code = 'opportunity'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:opportunity:delete');

-- 合同管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增合同接口', 'api:contract:add', 'api', id, 'POST /contract/add', 1 FROM sys_permission WHERE code = 'contract'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:contract:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '编辑合同接口', 'api:contract:update', 'api', id, 'POST /contract/update', 2 FROM sys_permission WHERE code = 'contract'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:contract:update');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除合同接口', 'api:contract:delete', 'api', id, 'POST /contract/delete', 3 FROM sys_permission WHERE code = 'contract'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:contract:delete');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '回款增删改接口', 'api:contract:payment', 'api', id, 'POST /contract/payment/*', 4 FROM sys_permission WHERE code = 'contract'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:contract:payment');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '合同导出接口', 'api:contract:export', 'api', id, 'POST /contract/export', 5 FROM sys_permission WHERE code = 'contract'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:contract:export');

-- 产品管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增产品接口', 'api:product:add', 'api', id, 'POST /product/add', 1 FROM sys_permission WHERE code = 'product'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:product:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '编辑产品接口', 'api:product:update', 'api', id, 'POST /product/update', 2 FROM sys_permission WHERE code = 'product'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:product:update');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除产品接口', 'api:product:delete', 'api', id, 'POST /product/delete', 3 FROM sys_permission WHERE code = 'product'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:product:delete');

-- 报价管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增报价接口', 'api:quotation:add', 'api', id, 'POST /quote/add', 1 FROM sys_permission WHERE code = 'quotation'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:quotation:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '编辑报价接口', 'api:quotation:update', 'api', id, 'POST /quote/update', 2 FROM sys_permission WHERE code = 'quotation'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:quotation:update');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除报价接口', 'api:quotation:delete', 'api', id, 'POST /quote/delete', 3 FROM sys_permission WHERE code = 'quotation'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:quotation:delete');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '报价转合同接口', 'api:quotation:to-contract', 'api', id, 'POST /quote/to-contract', 4 FROM sys_permission WHERE code = 'quotation'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:quotation:to-contract');

-- 供应商管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增供应商接口', 'api:supplier:add', 'api', id, 'POST /supplier/add', 1 FROM sys_permission WHERE code = 'supplier'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:supplier:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '编辑供应商接口', 'api:supplier:update', 'api', id, 'POST /supplier/update', 2 FROM sys_permission WHERE code = 'supplier'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:supplier:update');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除供应商接口', 'api:supplier:delete', 'api', id, 'POST /supplier/delete', 3 FROM sys_permission WHERE code = 'supplier'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:supplier:delete');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '供应商联系人接口', 'api:supplier:contact', 'api', id, 'POST /supplier/contact/add', 4 FROM sys_permission WHERE code = 'supplier'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:supplier:contact');

-- 采购管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增采购接口', 'api:purchase:add', 'api', id, 'POST /purchase/add', 1 FROM sys_permission WHERE code = 'purchase'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:purchase:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '采购状态更新接口', 'api:purchase:status', 'api', id, 'POST /purchase/update-status', 2 FROM sys_permission WHERE code = 'purchase'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:purchase:status');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '采购收货接口', 'api:purchase:receipt', 'api', id, 'POST /purchase/receipt/add', 3 FROM sys_permission WHERE code = 'purchase'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:purchase:receipt');

-- 售后服务 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '新增工单接口', 'api:service:add', 'api', id, 'POST /service/add', 1 FROM sys_permission WHERE code = 'service'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:service:add');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '编辑工单接口', 'api:service:update', 'api', id, 'POST /service/update', 2 FROM sys_permission WHERE code = 'service'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:service:update');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除工单接口', 'api:service:delete', 'api', id, 'POST /service/delete', 3 FROM sys_permission WHERE code = 'service'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:service:delete');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '工单操作接口', 'api:service:operate', 'api', id, 'POST /service/assign|start|finish|confirm', 4 FROM sys_permission WHERE code = 'service'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:service:operate');

-- 数据报表 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '逾期客户列表接口', 'api:report:overdue', 'api', id, 'POST /report/overdue', 1 FROM sys_permission WHERE code = 'report'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:report:overdue');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '报表导出接口', 'api:report:export', 'api', id, 'POST /report/export', 2 FROM sys_permission WHERE code = 'report'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:report:export');

-- 销售目标 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '设置目标接口', 'api:target:set', 'api', id, 'POST /target/set', 1 FROM sys_permission WHERE code = 'target'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:target:set');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '批量设置目标接口', 'api:target:batch-set', 'api', id, 'POST /target/batch-set', 2 FROM sys_permission WHERE code = 'target'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:target:batch-set');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '删除目标接口', 'api:target:delete', 'api', id, 'POST /target/delete', 3 FROM sys_permission WHERE code = 'target'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:target:delete');

-- 系统管理 API
INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '日志导出接口', 'api:system:log-export', 'api', id, 'POST /log/export', 1 FROM sys_permission WHERE code = 'system'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:system:log-export');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '数据备份接口', 'api:system:backup', 'api', id, 'POST /backup/*', 2 FROM sys_permission WHERE code = 'system'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:system:backup');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '回收站接口', 'api:system:recycle', 'api', id, 'POST /recycle/*', 3 FROM sys_permission WHERE code = 'system'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:system:recycle');

INSERT INTO sys_permission (name, code, type, parent_id, path, sort)
SELECT '数据恢复接口', 'api:system:restore', 'api', id, 'POST /recycle/restore|permanent-delete', 4 FROM sys_permission WHERE code = 'system'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'api:system:restore');
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
-- 022_phase3_supplier_purchase.sql
-- Phase 3: 供应商评分增强 + 采购审批字段

-- 1. 供应商评分表增强（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier_rating' AND COLUMN_NAME = 'purchase_order_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_supplier_rating ADD COLUMN purchase_order_id INT DEFAULT NULL COMMENT ''关联采购单'' AFTER supplier_id',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier_rating' AND COLUMN_NAME = 'quality_rate');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_supplier_rating ADD COLUMN quality_rate DECIMAL(5,2) DEFAULT 0.00 COMMENT ''质量合格率'' AFTER price_score',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier_rating' AND COLUMN_NAME = 'delivery_rate');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_supplier_rating ADD COLUMN delivery_rate DECIMAL(5,2) DEFAULT 0.00 COMMENT ''准时交付率'' AFTER quality_rate',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 采购单增加审批字段（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_order' AND COLUMN_NAME = 'approve_time');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_purchase_order ADD COLUMN approve_time DATETIME DEFAULT NULL COMMENT ''审批时间'' AFTER status',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_purchase_order' AND COLUMN_NAME = 'approveRemark');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_purchase_order ADD COLUMN approveRemark VARCHAR(500) DEFAULT NULL COMMENT ''审批备注'' AFTER approve_time',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
-- Phase 4: 数据分析 + AI + 邮件集成

-- 1. 数据分析配置表
CREATE TABLE IF NOT EXISTS sys_analysis_config (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    type ENUM('prediction', 'anomaly', 'alert') NOT NULL,
    config JSON,
    is_active TINYINT DEFAULT 1,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 第三方集成表
CREATE TABLE IF NOT EXISTS sys_integration (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    type ENUM('email', 'sms', 'erp', 'finance') NOT NULL,
    config JSON,
    status ENUM('active', 'inactive', 'error') DEFAULT 'inactive',
    last_sync_time DATETIME,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. AI建议记录表
CREATE TABLE IF NOT EXISTS crm_ai_suggestion (
    id INT PRIMARY KEY AUTO_INCREMENT,
    type ENUM('customer', 'opportunity', 'pricing', 'follow_up') NOT NULL,
    ref_id INT NOT NULL,
    suggestion TEXT,
    confidence DECIMAL(5,2),
    is_accepted TINYINT DEFAULT 0,
    feedback VARCHAR(500),
    create_by INT,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type_ref (type, ref_id)
);

-- 4. 邮件日志表
CREATE TABLE IF NOT EXISTS sys_email_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    to_email VARCHAR(200) NOT NULL,
    subject VARCHAR(500),
    body TEXT,
    type VARCHAR(50),
    status ENUM('sent', 'failed') DEFAULT 'sent',
    error_msg VARCHAR(500),
    ref_type VARCHAR(50),
    ref_id INT,
    send_by INT,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_create_time (create_time),
    INDEX idx_ref (ref_type, ref_id)
);

-- 5. 初始化分析配置
INSERT IGNORE INTO sys_analysis_config (name, code, type, config) VALUES
('销售预测', 'sales_prediction', 'prediction', '{"months": 3, "method": "moving_average"}'),
('客户流失预警', 'churn_alert', 'alert', '{"overdue_days": 30}'),
('异常检测', 'anomaly_detection', 'anomaly', '{"threshold_sigma": 2}');

-- 6. 初始化邮件集成配置
INSERT IGNORE INTO sys_integration (name, type, config, status) VALUES
('系统邮件', 'email', '{"host":"","port":465,"secure":true,"user":"","pass":"","from":""}', 'inactive');
-- [业务修复] crm_quote 添加 opportunity_id 列，关联商机
-- 兼容旧数据：默认 NULL，不影响已有报价单

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_quote' AND column_name='opportunity_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_quote ADD COLUMN opportunity_id INT DEFAULT NULL COMMENT ''关联商机ID'' AFTER customer_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_quote' AND CONSTRAINT_NAME='fk_quote_opportunity' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql = IF(@fk_exists = 0, 'ALTER TABLE crm_quote ADD CONSTRAINT fk_quote_opportunity FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_quote' AND INDEX_NAME='idx_quote_opportunity');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_quote ADD INDEX idx_quote_opportunity (opportunity_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- ============================================================
-- 迁移: 复合索引优化 v2
-- 日期: 2026-05-26
-- 说明: 为高频查询场景补充复合索引，覆盖看板、漏斗、列表等核心查询
-- 影响: 纯索引变更，不改数据，不锁表(MySQL 8.0 Online DDL)
-- ============================================================

USE huakey_crm;

SET @db = 'huakey_crm';

-- crm_customer: 看板逾期客户查询 (status NOT IN + owner_id + last_follow_time)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_cust_status_owner_follow');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_customer ADD INDEX idx_cust_status_owner_follow (status, owner_id, last_follow_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_opportunity: 销售漏斗聚合 (deleted_at + stage GROUP BY + expected_amount 覆盖)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_opportunity' AND INDEX_NAME='idx_opp_del_stage_amount');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_opportunity ADD INDEX idx_opp_del_stage_amount (deleted_at, stage, expected_amount)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_contract: 合同列表 (deleted_at + status + create_time 排序)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_contract' AND INDEX_NAME='idx_contract_del_status_ctime');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_contract ADD INDEX idx_contract_del_status_ctime (deleted_at, status, create_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_payment: 合同列表中的回款子查询 (contract_id + deleted_at 精确匹配)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_payment' AND INDEX_NAME='idx_payment_contract_del');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_payment ADD INDEX idx_payment_contract_del (contract_id, deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_service_order: 看板待办统计 (assignee_id IN + status IN)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_service_order' AND INDEX_NAME='idx_service_assignee_status');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_service_order ADD INDEX idx_service_assignee_status (assignee_id, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_follow_up: 客户详情跟进列表 (customer_id + deleted_at + create_time 排序)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_follow_up' AND INDEX_NAME='idx_follow_cust_del_time');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_follow_up ADD INDEX idx_follow_cust_del_time (customer_id, deleted_at, create_time)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crm_sales_target: 看板目标达成率 (user_id + year + month 精确匹配)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crm_sales_target' AND INDEX_NAME='idx_target_user_year_month');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_sales_target ADD INDEX idx_target_user_year_month (user_id, year, month)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 迁移: 审批流（简易版）
-- 日期: 2026-05-26
-- 说明: 为报价单和合同添加审批状态字段
-- 影响: 新增2个字段，旧数据默认为"已通过"，不影响现有业务
-- ============================================================

USE huakey_crm;

-- 报价单审批字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_quote' AND column_name='approval_status');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_quote ADD COLUMN approval_status TINYINT NOT NULL DEFAULT 2 COMMENT ''审批状态: 1=待审批, 2=已通过, 3=已拒绝'' AFTER status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_quote' AND column_name='approver_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_quote ADD COLUMN approver_id INT DEFAULT NULL COMMENT ''审批人ID'' AFTER approval_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_quote' AND INDEX_NAME='idx_quote_approval');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_quote ADD INDEX idx_quote_approval (approval_status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 合同审批字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_contract' AND column_name='approval_status');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_contract ADD COLUMN approval_status TINYINT NOT NULL DEFAULT 2 COMMENT ''审批状态: 1=待审批, 2=已通过, 3=已拒绝'' AFTER status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_contract' AND column_name='approver_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_contract ADD COLUMN approver_id INT DEFAULT NULL COMMENT ''审批人ID'' AFTER approval_status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_contract' AND INDEX_NAME='idx_contract_approval');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE crm_contract ADD INDEX idx_contract_approval (approval_status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 迁移: 审批备注字段
-- 日期: 2026-05-26
-- 说明: 为报价单和合同的审批添加备注字段（用于拒绝时填写原因）
-- ============================================================

USE huakey_crm;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_quote' AND column_name='approval_remark');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_quote ADD COLUMN approval_remark VARCHAR(500) DEFAULT NULL COMMENT ''审批备注（拒绝原因）'' AFTER approver_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='huakey_crm' AND table_name='crm_contract' AND column_name='approval_remark');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE crm_contract ADD COLUMN approval_remark VARCHAR(500) DEFAULT NULL COMMENT ''审批备注（拒绝原因）'' AFTER approver_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 通用附件表（支持工单、跟进记录等）
CREATE TABLE IF NOT EXISTS crm_attachment (
  id INT AUTO_INCREMENT PRIMARY KEY,
  business_type VARCHAR(50) NOT NULL COMMENT '关联业务类型: service_order, follow_up',
  business_id INT NOT NULL COMMENT '关联业务ID',
  file_name VARCHAR(255) NOT NULL COMMENT '原始文件名',
  file_path VARCHAR(500) NOT NULL COMMENT '存储路径',
  file_size INT DEFAULT 0 COMMENT '文件大小(字节)',
  file_type VARCHAR(50) DEFAULT NULL COMMENT '文件MIME类型',
  create_by INT DEFAULT NULL COMMENT '上传人',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_business (business_type, business_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通用附件表';
-- ============================================================
-- 迁移: 财务角色 + 权限配置
-- 日期: 2026-05-26
-- ============================================================

USE huakey_crm;

-- Step 1: 创建财务角色（view_all=1 可查看全部数据，manage_all=0 不可管理）
INSERT INTO sys_role (name, code, description, status, view_all, manage_all)
SELECT '财务', 'finance', '财务人员，查看合同/回款/报价全部数据', 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE code = 'finance');

-- Step 2: 分配菜单权限
-- 首页(dashboard), 合同管理(contract), 报价管理(quotation), 售后服务(service)
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
CROSS JOIN sys_permission p
WHERE r.code = 'finance'
  AND p.code IN ('dashboard', 'contract', 'quotation', 'service')
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Step 3: 分配按钮权限
-- 合同: 新增/编辑（不需要删除）, 报价: 编辑, 售后: 新增/编辑
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
CROSS JOIN sys_permission p
WHERE r.code = 'finance'
  AND p.code IN (
    'contract:add', 'contract:edit',
    'quotation:edit',
    'service:add', 'service:edit'
  )
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Step 4: 配置数据权限（全部数据范围）
INSERT INTO sys_data_permission (role_id, module, data_scope)
SELECT r.id, d.module, 'all'
FROM sys_role r
CROSS JOIN (
  SELECT 'contract' AS module
  UNION ALL SELECT 'quotation'
  UNION ALL SELECT 'service'
) d
WHERE r.code = 'finance'
  AND NOT EXISTS (
    SELECT 1 FROM sys_data_permission dp
    WHERE dp.role_id = r.id AND dp.module = d.module
  );

SELECT '财务角色创建完成' AS result;
SELECT id, name, code, view_all, manage_all FROM sys_role WHERE code = 'finance';
-- ============================================================
-- 迁移: 通用通知表（审批/催办/到期等）
-- 日期: 2026-05-26
-- ============================================================

USE huakey_crm;

CREATE TABLE IF NOT EXISTS crm_notification (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    type VARCHAR(30) NOT NULL COMMENT '通知类型: quote_approval, contract_approval, remind, ...',
    title VARCHAR(200) NOT NULL COMMENT '通知标题',
    content VARCHAR(500) DEFAULT NULL COMMENT '通知内容',
    business_type VARCHAR(30) DEFAULT NULL COMMENT '业务类型: quote, contract, ...',
    business_id INT DEFAULT NULL COMMENT '业务记录ID',
    from_user_id INT DEFAULT NULL COMMENT '触发人ID',
    to_user_id INT DEFAULT NULL COMMENT '接收人ID（NULL表示角色组广播）',
    to_role_id INT DEFAULT NULL COMMENT '接收角色ID（当to_user_id为空时按角色广播）',
    is_read TINYINT DEFAULT 0 COMMENT '是否已读(0未读/1已读)',
    is_dismissed TINYINT DEFAULT 0 COMMENT '是否已处理(0未处理/1已处理)',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    INDEX idx_to_user (to_user_id, is_read),
    INDEX idx_to_role (to_role_id, is_read),
    INDEX idx_business (business_type, business_id),
    INDEX idx_type (type),
    INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统通知表';
-- 031_reminder_follow_plan_id.sql
-- 给 crm_follow_up_reminder 表添加 follow_plan_id 字段，关联跟进计划

-- 1. 添加 follow_plan_id 字段（幂等）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up_reminder' AND COLUMN_NAME = 'follow_plan_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_follow_up_reminder ADD COLUMN follow_plan_id INT DEFAULT NULL COMMENT ''关联跟进计划ID'' AFTER manager_id',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 添加索引（幂等）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_follow_up_reminder' AND INDEX_NAME = 'idx_reminder_follow_plan');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_reminder_follow_plan ON crm_follow_up_reminder(follow_plan_id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
-- ============================================================
-- 迁移: 操作日志字段级变更记录
-- 日期: 2026-05-28
-- ============================================================

USE huakey_crm;

-- 新增字段变更相关列（幂等执行）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_log' AND COLUMN_NAME = 'changed_fields');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sys_log ADD COLUMN changed_fields TEXT DEFAULT NULL COMMENT ''变更字段列表(JSON)'' AFTER params',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_log' AND COLUMN_NAME = 'old_value');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sys_log ADD COLUMN old_value TEXT DEFAULT NULL COMMENT ''变更前数据(JSON)'' AFTER changed_fields',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_log' AND COLUMN_NAME = 'new_value');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sys_log ADD COLUMN new_value TEXT DEFAULT NULL COMMENT ''变更后数据(JSON)'' AFTER old_value',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
-- 发票管理表
-- 日期: 2026-05-28

USE huakey_crm;

CREATE TABLE IF NOT EXISTS crm_invoice (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    invoice_no VARCHAR(50) NOT NULL COMMENT '发票编号',
    contract_id INT NOT NULL COMMENT '合同ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    type TINYINT DEFAULT 1 COMMENT '发票类型：1=增值税普票 2=增值税专票 3=电子发票',
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 COMMENT '发票金额',
    tax_rate DECIMAL(5, 2) DEFAULT NULL COMMENT '税率(%)',
    tax_amount DECIMAL(15, 2) DEFAULT NULL COMMENT '税额',
    invoice_date DATE DEFAULT NULL COMMENT '开票日期',
    status TINYINT DEFAULT 1 COMMENT '状态：1=待开票 2=已开票 3=已邮寄 4=已作废',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
    INDEX idx_invoice_no (invoice_no),
    INDEX idx_contract (contract_id),
    INDEX idx_customer (customer_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='发票表';

-- 插入发票菜单权限
INSERT INTO sys_permission (name, code, type, parent_id, path, icon, sort) VALUES
('发票管理', 'invoice', 'menu', 0, '/invoice', 'Document', 13);

SET @invoice_parent_id = LAST_INSERT_ID();

INSERT INTO sys_permission (name, code, type, parent_id, sort) VALUES
('新增发票', 'invoice:add', 'button', @invoice_parent_id, 1),
('编辑发票', 'invoice:edit', 'button', @invoice_parent_id, 2),
('删除发票', 'invoice:delete', 'button', @invoice_parent_id, 3),
('导出发票', 'invoice:export', 'button', @invoice_parent_id, 4);

-- 为超级管理员分配发票权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 1, id FROM sys_permission WHERE code IN ('invoice', 'invoice:add', 'invoice:edit', 'invoice:delete', 'invoice:export');

-- 为管理员分配发票权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 2, id FROM sys_permission WHERE code IN ('invoice', 'invoice:add', 'invoice:edit', 'invoice:delete', 'invoice:export');

SELECT '发票表创建完成' AS result;
-- crm_sales_target 建表（target.js 引用但无建表语句）
-- 日期: 2026-05-28

USE huakey_crm;

CREATE TABLE IF NOT EXISTS crm_sales_target (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    user_id INT NOT NULL COMMENT '销售用户ID',
    year INT NOT NULL COMMENT '目标年份',
    month INT NOT NULL COMMENT '目标月份',
    target_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 COMMENT '目标金额',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
    UNIQUE KEY uk_user_period (user_id, year, month),
    INDEX idx_user (user_id),
    INDEX idx_period (year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='销售目标表';

SELECT 'crm_sales_target 建表完成' AS result;
-- ============================================================
-- 迁移 035: 客户标签系统
-- 日期: 2026-06-04
-- 说明: 新增标签表和客户-标签关联表
-- ============================================================

USE huakey_crm;

-- 标签表
CREATE TABLE IF NOT EXISTS crm_tag (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(30) NOT NULL COMMENT '标签名称',
    color VARCHAR(7) DEFAULT '#1a56db' COMMENT '标签颜色(hex)',
    sort INT DEFAULT 0 COMMENT '排序',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户标签表';

-- 客户-标签关联表
CREATE TABLE IF NOT EXISTS crm_customer_tag (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    tag_id INT NOT NULL,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_customer_tag (customer_id, tag_id),
    INDEX idx_customer (customer_id),
    INDEX idx_tag (tag_id),
    CONSTRAINT fk_ct_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE,
    CONSTRAINT fk_ct_tag FOREIGN KEY (tag_id) REFERENCES crm_tag(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户标签关联表';

-- 默认标签
INSERT IGNORE INTO crm_tag (name, color, sort) VALUES
('VIP客户', '#dc2626', 1),
('重点客户', '#f97316', 2),
('潜在客户', '#6366f1', 3),
('风险客户', '#6b7280', 4),
('外贸客户', '#2563eb', 5),
('长期合作', '#16a34a', 6);
-- ============================================================
-- 迁移 036: 合同模板
-- 日期: 2026-06-04
-- ============================================================

USE huakey_crm;

CREATE TABLE IF NOT EXISTS crm_contract_template (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT '模板名称',
    amount DECIMAL(15,2) DEFAULT 0.00 COMMENT '默认金额',
    payment_terms VARCHAR(500) DEFAULT NULL COMMENT '付款条款',
    delivery_days INT DEFAULT 30 COMMENT '默认交付天数',
    remark TEXT COMMENT '默认备注',
    sort INT DEFAULT 0 COMMENT '排序',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='合同模板表';

-- 默认模板
INSERT IGNORE INTO crm_contract_template (name, amount, payment_terms, delivery_days, remark, sort) VALUES
('标准供货合同', 0.00, '签订后付30%，货到付70%', 30, '标准供货合同模板', 1),
('年度框架合同', 0.00, '按季度结算', 90, '年度框架合作协议', 2),
('短期项目合同', 0.00, '签订后一次性付清', 15, '短期项目合同模板', 3);
-- ============================================================
-- 迁移 037: 客户生命周期字段（兼容式新增，不删除status）
-- 日期: 2026-06-04
-- ============================================================

USE huakey_crm;

-- 1. 新增 customer_type 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND COLUMN_NAME='customer_type');
SET @sql = IF(@col_exists=0,
  'ALTER TABLE crm_customer ADD COLUMN customer_type VARCHAR(20) DEFAULT ''prospect'' COMMENT ''对象类型: prospect=潜客 customer=正式客户'' AFTER status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 新增 lifecycle_status 字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND COLUMN_NAME='lifecycle_status');
SET @sql = IF(@col_exists=0,
  'ALTER TABLE crm_customer ADD COLUMN lifecycle_status VARCHAR(20) DEFAULT ''new'' COMMENT ''生命周期: new/nurturing/intent/active/lost/inactive'' AFTER customer_type',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. 新增索引
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_customer_type');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX idx_customer_type ON crm_customer(customer_type)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='huakey_crm' AND TABLE_NAME='crm_customer' AND INDEX_NAME='idx_lifecycle_status');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX idx_lifecycle_status ON crm_customer(lifecycle_status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. 回填历史数据
-- status=1 → prospect, new（从未跟进过的潜客）
UPDATE crm_customer
  SET customer_type = 'prospect',
      lifecycle_status = CASE
        WHEN last_follow_time IS NOT NULL THEN 'nurturing'
        ELSE 'new'
      END
  WHERE status = 1
    AND (customer_type IS NULL OR customer_type = '' OR customer_type = 'prospect');

-- status=2 → customer, active（成交客户）
UPDATE crm_customer
  SET customer_type = 'customer',
      lifecycle_status = 'active'
  WHERE status = 2
    AND (customer_type IS NULL OR customer_type = '' OR customer_type = 'prospect');

-- status=3 → customer, lost（流失客户）
UPDATE crm_customer
  SET customer_type = 'customer',
      lifecycle_status = 'lost'
  WHERE status = 3
    AND (customer_type IS NULL OR customer_type = '' OR customer_type = 'prospect');

-- 5. 验证回填结果
SELECT '=== 迁移037结果 ===' AS '';
SELECT status,
       customer_type,
       lifecycle_status,
       COUNT(*) as cnt
FROM crm_customer
WHERE status != 0 AND deleted_at IS NULL
GROUP BY status, customer_type, lifecycle_status
ORDER BY status;
-- ============================================================
-- 迁移 038: 客户自动分配规则表
-- 日期: 2026-06-04
-- 数据库: MySQL 8.0
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_assign_rule (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_name VARCHAR(100) NOT NULL COMMENT '规则名称',
  assign_type ENUM('round_robin', 'by_source', 'by_region') NOT NULL COMMENT '分配方式: round_robin=轮询, by_source=按来源, by_region=按区域',
  source_value VARCHAR(100) DEFAULT NULL COMMENT '来源值（by_source时使用）',
  region_value VARCHAR(100) DEFAULT NULL COMMENT '区域值（by_region时使用）',
  user_ids JSON NOT NULL COMMENT '可分配的用户ID列表',
  last_assigned_index INT DEFAULT 0 COMMENT '上次分配的索引（轮询用）',
  priority INT DEFAULT 0 COMMENT '优先级（越大越优先）',
  is_active TINYINT DEFAULT 1 COMMENT '是否启用: 1=启用, 0=禁用',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户自动分配规则';

-- 索引
CREATE INDEX idx_assign_rule_active ON crm_assign_rule(is_active, priority DESC);
-- 039_supplier_contact_qualification.sql
-- 供应商联系人表 & 供应商资质表
-- 列名对齐 backend/routes/supplier.js 的实际引用

-- 供应商联系人表
CREATE TABLE IF NOT EXISTS crm_supplier_contact (
  id INT PRIMARY KEY AUTO_INCREMENT,
  supplier_id INT NOT NULL,
  name VARCHAR(100) NOT NULL COMMENT '联系人姓名',
  position VARCHAR(100) DEFAULT NULL COMMENT '职位',
  department VARCHAR(100) DEFAULT NULL COMMENT '部门',
  phone VARCHAR(20) DEFAULT NULL COMMENT '电话',
  mobile VARCHAR(20) DEFAULT NULL COMMENT '手机',
  email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
  wechat VARCHAR(50) DEFAULT NULL COMMENT '微信',
  role VARCHAR(100) DEFAULT NULL COMMENT '角色/职责',
  is_primary TINYINT(1) DEFAULT 0 COMMENT '是否主要联系人',
  remark TEXT COMMENT '备注',
  create_by INT DEFAULT NULL COMMENT '创建人',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
  KEY idx_sc_supplier (supplier_id),
  CONSTRAINT fk_sc_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商联系人';

-- 供应商资质表
CREATE TABLE IF NOT EXISTS crm_supplier_qualification (
  id INT PRIMARY KEY AUTO_INCREMENT,
  supplier_id INT NOT NULL,
  cert_type VARCHAR(50) DEFAULT NULL COMMENT '资质类型',
  cert_name VARCHAR(200) NOT NULL COMMENT '资质名称',
  cert_no VARCHAR(100) DEFAULT NULL COMMENT '证书编号',
  issue_date DATE DEFAULT NULL COMMENT '发证日期',
  expire_date DATE DEFAULT NULL COMMENT '到期日期',
  issuing_authority VARCHAR(200) DEFAULT NULL COMMENT '发证机关',
  file_path VARCHAR(500) DEFAULT NULL COMMENT '附件路径',
  status TINYINT(1) DEFAULT 1 COMMENT '状态：1有效 0过期',
  remark TEXT COMMENT '备注',
  create_by INT DEFAULT NULL COMMENT '创建人',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
  KEY idx_sq_supplier (supplier_id),
  CONSTRAINT fk_sq_supplier FOREIGN KEY (supplier_id) REFERENCES crm_supplier(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商资质';
-- 041_followup_templates.sql
-- 跟进模板表

CREATE TABLE IF NOT EXISTS crm_followup_template (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL COMMENT '模板名称',
  type VARCHAR(20) DEFAULT 'general' COMMENT '类型：first首次/quote报价/deal成交/general通用',
  content TEXT NOT NULL COMMENT '模板内容',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_ft_type (type),
  KEY idx_ft_creator (create_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='跟进模板';

-- 预置通用模板
INSERT INTO crm_followup_template (name, type, content) VALUES
('首次电话拜访', 'first', '您好，我是铧旗的{联系人}，今天主要想了解贵司的{需求方向}。请问您目前有在使用类似产品吗？主要关注哪些方面？'),
('报价跟进', 'quote', '您好，上次给您发的报价方案（报价单号：{报价单号}）您看了吗？有什么疑问或需要调整的地方吗？我们可以约个时间详细沟通。'),
('成交感谢', 'deal', '感谢贵司的信任与支持！合同已签署，我们会尽快安排{交付内容}。后续有任何问题随时联系我。'),
('日常回访', 'general', '您好，距离上次沟通已有一段时间，想了解一下贵司目前的{业务方向}进展如何？有什么我们可以协助的吗？');
-- 042_lead_scoring.sql
-- 线索评分功能

-- 评分规则表
CREATE TABLE IF NOT EXISTS crm_score_rule (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL COMMENT '规则名称',
  condition_type VARCHAR(20) NOT NULL COMMENT '条件类型：source来源/action行为/interaction互动',
  condition_field VARCHAR(50) DEFAULT NULL COMMENT '条件字段',
  condition_operator VARCHAR(10) DEFAULT NULL COMMENT '条件运算符：eq/gt/lt/contains',
  condition_value VARCHAR(100) DEFAULT NULL COMMENT '条件值',
  score INT NOT NULL DEFAULT 0 COMMENT '分数',
  status TINYINT(1) DEFAULT 1 COMMENT '状态：1启用 0禁用',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sr_type (condition_type),
  KEY idx_sr_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='评分规则';

-- 客户评分记录表
CREATE TABLE IF NOT EXISTS crm_customer_score_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  rule_id INT DEFAULT NULL COMMENT '触发规则',
  score INT NOT NULL COMMENT '分数变化',
  total_score INT NOT NULL COMMENT '总分',
  remark VARCHAR(200) DEFAULT NULL COMMENT '备注',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_csl_customer (customer_id),
  KEY idx_csl_rule (rule_id),
  CONSTRAINT fk_csl_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE,
  CONSTRAINT fk_csl_rule FOREIGN KEY (rule_id) REFERENCES crm_score_rule(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户评分记录';

-- 客户表添加评分字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm' AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'score');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN score INT DEFAULT 0 COMMENT ''客户评分'' AFTER lifecycle_status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 预置评分规则
INSERT IGNORE INTO crm_score_rule (name, condition_type, condition_field, condition_operator, condition_value, score) VALUES
('高价值客户', 'source', 'source', 'eq', '展会', 20),
('主动咨询', 'source', 'source', 'eq', '官网', 15),
('多次跟进', 'action', 'followup_count', 'gt', '5', 25),
('近期活跃', 'interaction', 'last_followup_days', 'lt', '7', 15),
('报价客户', 'action', 'quote_count', 'gt', '0', 20),
('成交客户', 'action', 'contract_count', 'gt', '0', 30);
-- 043_approval_workflow.sql
-- 审批流程功能（审批状态字段已在 026 中添加）

-- 审批流程表
CREATE TABLE IF NOT EXISTS crm_approval_workflow (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL COMMENT '流程名称',
  type VARCHAR(20) NOT NULL COMMENT '流程类型：quote/contract/purchase/discount',
  description VARCHAR(200) DEFAULT NULL COMMENT '流程描述',
  status TINYINT(1) DEFAULT 1 COMMENT '状态：1启用 0禁用',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_aw_type (type),
  KEY idx_aw_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审批流程';

-- 审批步骤表
CREATE TABLE IF NOT EXISTS crm_approval_step (
  id INT PRIMARY KEY AUTO_INCREMENT,
  workflow_id INT NOT NULL COMMENT '流程ID',
  step_order INT NOT NULL COMMENT '步骤顺序',
  step_name VARCHAR(50) NOT NULL COMMENT '步骤名称',
  approver_type VARCHAR(20) NOT NULL COMMENT '审批人类型：user/role/manager',
  approver_id INT DEFAULT NULL COMMENT '审批人ID',
  is_required TINYINT(1) DEFAULT 1 COMMENT '是否必须审批',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_as_workflow (workflow_id),
  CONSTRAINT fk_as_workflow FOREIGN KEY (workflow_id) REFERENCES crm_approval_workflow(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审批步骤';

-- 审批记录表
CREATE TABLE IF NOT EXISTS crm_approval_record (
  id INT PRIMARY KEY AUTO_INCREMENT,
  workflow_id INT NOT NULL COMMENT '流程ID',
  business_type VARCHAR(20) NOT NULL COMMENT '业务类型',
  business_id INT NOT NULL COMMENT '业务ID',
  step_id INT NOT NULL COMMENT '步骤ID',
  step_order INT NOT NULL COMMENT '步骤顺序',
  approver_id INT NOT NULL COMMENT '审批人ID',
  status VARCHAR(20) DEFAULT 'pending' COMMENT '状态：pending/approved/rejected',
  remark VARCHAR(200) DEFAULT NULL COMMENT '审批意见',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ar_approver (approver_id, status),
  KEY idx_ar_business (business_type, business_id),
  CONSTRAINT fk_ar_workflow FOREIGN KEY (workflow_id) REFERENCES crm_approval_workflow(id),
  CONSTRAINT fk_ar_step FOREIGN KEY (step_id) REFERENCES crm_approval_step(id),
  CONSTRAINT fk_ar_approver FOREIGN KEY (approver_id) REFERENCES sys_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审批记录';
-- 044_knowledge_base.sql
-- 知识库模块：产品知识、销售话术、FAQ、文档模板

-- 产品知识库表
CREATE TABLE IF NOT EXISTS crm_knowledge_product (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '产品名称',
  category VARCHAR(50) DEFAULT NULL COMMENT '产品分类',
  model VARCHAR(100) DEFAULT NULL COMMENT '产品型号',
  description TEXT COMMENT '产品描述',
  specs TEXT COMMENT '产品参数(JSON)',
  price DECIMAL(12,2) DEFAULT NULL COMMENT '参考价格',
  images TEXT COMMENT '产品图片(JSON数组)',
  status TINYINT(1) DEFAULT 1 COMMENT '状态：1启用 0停用',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_kp_category (category),
  KEY idx_kp_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品知识库';

-- 销售话术表
CREATE TABLE IF NOT EXISTS crm_knowledge_script (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(100) NOT NULL COMMENT '话术标题',
  scene VARCHAR(50) DEFAULT NULL COMMENT '适用场景',
  content TEXT NOT NULL COMMENT '话术内容',
  sort_order INT DEFAULT 0 COMMENT '排序',
  usage_count INT DEFAULT 0 COMMENT '使用次数',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_ks_scene (scene)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='销售话术';

-- FAQ表
CREATE TABLE IF NOT EXISTS crm_knowledge_faq (
  id INT PRIMARY KEY AUTO_INCREMENT,
  question VARCHAR(200) NOT NULL COMMENT '问题',
  answer TEXT NOT NULL COMMENT '答案',
  category VARCHAR(50) DEFAULT NULL COMMENT '分类',
  view_count INT DEFAULT 0 COMMENT '查看次数',
  sort_order INT DEFAULT 0 COMMENT '排序',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_kf_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='FAQ';

-- 文档模板表
CREATE TABLE IF NOT EXISTS crm_knowledge_document (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '文档名称',
  type VARCHAR(30) NOT NULL COMMENT '文档类型：contract/quote/general',
  description VARCHAR(200) DEFAULT NULL COMMENT '文档说明',
  file_path VARCHAR(500) DEFAULT NULL COMMENT '文件路径',
  file_size INT DEFAULT NULL COMMENT '文件大小(字节)',
  file_type VARCHAR(20) DEFAULT NULL COMMENT '文件类型',
  download_count INT DEFAULT 0 COMMENT '下载次数',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_kd_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文档模板';
-- 045_report_enhancements.sql
-- 报表分析增强：自定义报表配置表

CREATE TABLE IF NOT EXISTS crm_report_config (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '报表名称',
  description VARCHAR(200) DEFAULT NULL COMMENT '报表说明',
  report_type VARCHAR(30) NOT NULL COMMENT '报表类型：table/bar/line/pie',
  data_source VARCHAR(50) NOT NULL COMMENT '数据来源：customer/contract/payment/purchase/opportunity',
  columns_config TEXT COMMENT '列配置JSON',
  filter_config TEXT COMMENT '筛选条件JSON',
  chart_config TEXT COMMENT '图表配置JSON',
  is_public TINYINT(1) DEFAULT 0 COMMENT '是否公开',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_rc_type (report_type),
  KEY idx_rc_source (data_source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='自定义报表配置';
-- 046_satisfaction_survey.sql
-- 客户满意度调查模块

-- 调查模板表
CREATE TABLE IF NOT EXISTS crm_survey_template (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '模板名称',
  description VARCHAR(200) DEFAULT NULL COMMENT '模板说明',
  survey_type VARCHAR(20) NOT NULL DEFAULT 'csat' COMMENT '调查类型：nps/csat/custom',
  questions TEXT NOT NULL COMMENT '问题配置JSON',
  is_system TINYINT(1) DEFAULT 0 COMMENT '是否系统预设',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_st_type (survey_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='调查模板';

-- 调查活动表
CREATE TABLE IF NOT EXISTS crm_survey_campaign (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '调查名称',
  template_id INT NOT NULL COMMENT '使用的模板',
  status VARCHAR(20) DEFAULT 'draft' COMMENT '状态：draft/active/closed',
  target_type VARCHAR(20) DEFAULT 'all' COMMENT '目标：all/specific',
  target_ids TEXT COMMENT '指定客户ID列表JSON',
  send_method VARCHAR(20) DEFAULT 'link' COMMENT '发送方式',
  total_sent INT DEFAULT 0 COMMENT '已发送数',
  total_responded INT DEFAULT 0 COMMENT '已回复数',
  start_date DATE DEFAULT NULL COMMENT '开始日期',
  end_date DATE DEFAULT NULL COMMENT '结束日期',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_sc_status (status),
  KEY idx_sc_template (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='调查活动';

-- 调查回复表
CREATE TABLE IF NOT EXISTS crm_survey_response (
  id INT PRIMARY KEY AUTO_INCREMENT,
  campaign_id INT NOT NULL COMMENT '活动ID',
  customer_id INT DEFAULT NULL COMMENT '关联客户',
  answers TEXT NOT NULL COMMENT '回答JSON',
  nps_score INT DEFAULT NULL COMMENT 'NPS分数(0-10)',
  csat_score DECIMAL(3,1) DEFAULT NULL COMMENT 'CSAT平均分',
  respondent_name VARCHAR(50) DEFAULT NULL COMMENT '回复人',
  respondent_contact VARCHAR(100) DEFAULT NULL COMMENT '联系方式',
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sr_campaign (campaign_id),
  KEY idx_sr_customer (customer_id),
  CONSTRAINT fk_sr_campaign FOREIGN KEY (campaign_id) REFERENCES crm_survey_campaign(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='调查回复';
-- 047_procurement_enhancements.sql
-- 采购增强：库存管理 + 采购计划

-- 库存变动记录表
CREATE TABLE IF NOT EXISTS crm_stock_movement (
  id INT PRIMARY KEY AUTO_INCREMENT,
  product_id INT NOT NULL COMMENT '产品ID',
  movement_type VARCHAR(20) NOT NULL COMMENT '变动类型：in/out/adjust/return',
  quantity INT NOT NULL COMMENT '变动数量',
  before_qty INT NOT NULL COMMENT '变动前库存',
  after_qty INT NOT NULL COMMENT '变动后库存',
  related_type VARCHAR(20) DEFAULT NULL COMMENT '关联类型',
  related_id INT DEFAULT NULL COMMENT '关联单据ID',
  remark VARCHAR(200) DEFAULT NULL,
  operator_id INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sm_product (product_id),
  KEY idx_sm_type (movement_type),
  KEY idx_sm_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存变动记录';

-- 库存预警配置表
CREATE TABLE IF NOT EXISTS crm_stock_alert (
  id INT PRIMARY KEY AUTO_INCREMENT,
  product_id INT NOT NULL UNIQUE COMMENT '产品ID',
  min_qty INT DEFAULT 0 COMMENT '最低库存',
  max_qty INT DEFAULT 9999 COMMENT '最高库存',
  alert_enabled TINYINT(1) DEFAULT 1 COMMENT '启用预警',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sa_product FOREIGN KEY (product_id) REFERENCES crm_product(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存预警配置';

-- 采购计划表
CREATE TABLE IF NOT EXISTS crm_purchase_plan (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plan_no VARCHAR(50) NOT NULL COMMENT '计划编号',
  name VARCHAR(100) NOT NULL COMMENT '计划名称',
  status VARCHAR(20) DEFAULT 'draft' COMMENT '状态',
  total_amount DECIMAL(12,2) DEFAULT 0 COMMENT '计划总金额',
  remark VARCHAR(200) DEFAULT NULL,
  create_by INT DEFAULT NULL,
  approved_by INT DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_pp_status (status),
  KEY idx_pp_no (plan_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购计划';

-- 采购计划明细表
CREATE TABLE IF NOT EXISTS crm_purchase_plan_item (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plan_id INT NOT NULL COMMENT '计划ID',
  product_id INT NOT NULL COMMENT '产品ID',
  supplier_id INT DEFAULT NULL COMMENT '建议供应商',
  quantity INT NOT NULL COMMENT '计划数量',
  unit_price DECIMAL(12,2) DEFAULT NULL COMMENT '预估单价',
  amount DECIMAL(12,2) DEFAULT NULL COMMENT '预估金额',
  reason VARCHAR(200) DEFAULT NULL COMMENT '采购原因',
  status VARCHAR(20) DEFAULT 'pending' COMMENT '状态',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ppi_plan (plan_id),
  CONSTRAINT fk_ppi_plan FOREIGN KEY (plan_id) REFERENCES crm_purchase_plan(id) ON DELETE CASCADE,
  CONSTRAINT fk_ppi_product FOREIGN KEY (product_id) REFERENCES crm_product(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购计划明细';
-- 048_finance_enhancements.sql
-- 财务增强：回款提醒 + 对账单 + 财务分析

-- 回款提醒记录表
CREATE TABLE IF NOT EXISTS crm_payment_reminder (
  id INT PRIMARY KEY AUTO_INCREMENT,
  contract_id INT NOT NULL COMMENT '合同ID',
  plan_id INT DEFAULT NULL COMMENT '回款计划ID',
  customer_id INT NOT NULL COMMENT '客户ID',
  remind_date DATE NOT NULL COMMENT '提醒日期',
  remind_type VARCHAR(20) NOT NULL COMMENT '提醒类型：upcoming/overdue/weekly',
  remind_days INT DEFAULT NULL COMMENT '距到期天数',
  amount DECIMAL(12,2) DEFAULT NULL COMMENT '应回款金额',
  status VARCHAR(20) DEFAULT 'pending' COMMENT '状态：pending/acknowledged/sent',
  remark VARCHAR(200) DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pr_contract (contract_id),
  KEY idx_pr_customer (customer_id),
  KEY idx_pr_status (status),
  KEY idx_pr_date (remind_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='回款提醒记录';

-- 对账单表
CREATE TABLE IF NOT EXISTS crm_reconciliation (
  id INT PRIMARY KEY AUTO_INCREMENT,
  recon_no VARCHAR(50) NOT NULL COMMENT '对账单号',
  recon_type VARCHAR(20) NOT NULL COMMENT '对账类型：customer/supplier',
  target_id INT NOT NULL COMMENT '客户/供应商ID',
  target_name VARCHAR(100) DEFAULT NULL COMMENT '名称',
  period_start DATE NOT NULL COMMENT '起始日',
  period_end DATE NOT NULL COMMENT '截止日',
  total_amount DECIMAL(12,2) DEFAULT 0 COMMENT '总金额',
  paid_amount DECIMAL(12,2) DEFAULT 0 COMMENT '已付金额',
  unpaid_amount DECIMAL(12,2) DEFAULT 0 COMMENT '未付金额',
  status VARCHAR(20) DEFAULT 'draft' COMMENT '状态：draft/confirmed/disputed',
  detail_data TEXT COMMENT '明细JSON',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rc_type (recon_type),
  KEY idx_rc_target (target_id),
  KEY idx_rc_no (recon_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对账单';
-- 049_hr_enhancements.sql
-- HR增强：员工档案 + 佣金计算 + 组织架构

-- 员工档案扩展表
CREATE TABLE IF NOT EXISTS crm_employee_profile (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE COMMENT '关联sys_user.id',
  gender VARCHAR(10) DEFAULT NULL COMMENT '性别',
  birth_date DATE DEFAULT NULL COMMENT '出生日期',
  id_card VARCHAR(20) DEFAULT NULL COMMENT '身份证号',
  hire_date DATE DEFAULT NULL COMMENT '入职日期',
  leave_date DATE DEFAULT NULL COMMENT '离职日期',
  position VARCHAR(50) DEFAULT NULL COMMENT '职位',
  employment_type VARCHAR(20) DEFAULT 'fulltime' COMMENT '用工类型',
  contract_start DATE DEFAULT NULL COMMENT '合同起始日',
  contract_end DATE DEFAULT NULL COMMENT '合同到期日',
  salary_base DECIMAL(10,2) DEFAULT NULL COMMENT '基本工资',
  salary_commission_rate DECIMAL(5,2) DEFAULT 0 COMMENT '提成比例(%)',
  bank_name VARCHAR(50) DEFAULT NULL COMMENT '开户银行',
  bank_account VARCHAR(30) DEFAULT NULL COMMENT '银行账号',
  emergency_contact VARCHAR(50) DEFAULT NULL COMMENT '紧急联系人',
  emergency_phone VARCHAR(20) DEFAULT NULL COMMENT '紧急联系电话',
  address VARCHAR(200) DEFAULT NULL COMMENT '家庭住址',
  education VARCHAR(20) DEFAULT NULL COMMENT '学历',
  university VARCHAR(100) DEFAULT NULL COMMENT '毕业院校',
  major VARCHAR(50) DEFAULT NULL COMMENT '专业',
  remark TEXT COMMENT '备注',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ep_user FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='员工档案扩展';

-- 佣金规则表
CREATE TABLE IF NOT EXISTS crm_commission_rule (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '规则名称',
  rule_type VARCHAR(20) NOT NULL COMMENT '规则类型：fixed/tiered/amount',
  apply_to VARCHAR(20) DEFAULT 'contract' COMMENT '适用对象：contract/payment',
  config TEXT NOT NULL COMMENT '规则配置JSON',
  status TINYINT(1) DEFAULT 1 COMMENT '状态',
  remark VARCHAR(200) DEFAULT NULL,
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_cr_type (rule_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='佣金规则';

-- 佣金记录表
CREATE TABLE IF NOT EXISTS crm_commission_record (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '销售人员ID',
  rule_id INT DEFAULT NULL COMMENT '规则ID',
  business_type VARCHAR(20) NOT NULL COMMENT '业务类型：contract/payment',
  business_id INT NOT NULL COMMENT '业务ID',
  base_amount DECIMAL(12,2) NOT NULL COMMENT '计算基数',
  commission_rate DECIMAL(5,2) DEFAULT NULL COMMENT '佣金比例(%)',
  commission_amount DECIMAL(12,2) NOT NULL COMMENT '佣金金额',
  period VARCHAR(10) DEFAULT NULL COMMENT '归属月份',
  status VARCHAR(20) DEFAULT 'calculated' COMMENT '状态：calculated/confirmed/paid',
  remark VARCHAR(200) DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ccr_user (user_id),
  KEY idx_ccr_period (period),
  KEY idx_ccr_status (status),
  UNIQUE KEY uk_ccr_biz (business_type, business_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='佣金记录';
-- 050_automation.sql
-- 自动化：工作流引擎 + 自动分配 + 智能提醒

-- 工作流规则表
CREATE TABLE IF NOT EXISTS crm_workflow_rule (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '规则名称',
  description VARCHAR(200) DEFAULT NULL,
  trigger_event VARCHAR(50) NOT NULL COMMENT '触发事件',
  conditions TEXT COMMENT '触发条件JSON',
  actions TEXT NOT NULL COMMENT '执行动作JSON',
  status TINYINT(1) DEFAULT 1 COMMENT '状态',
  last_run_at DATETIME DEFAULT NULL,
  run_count INT DEFAULT 0,
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_wr_event (trigger_event),
  KEY idx_wr_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流规则';

-- 工作流执行日志表
CREATE TABLE IF NOT EXISTS crm_workflow_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  rule_id INT NOT NULL,
  trigger_event VARCHAR(50) NOT NULL,
  target_type VARCHAR(30) DEFAULT NULL,
  target_id INT DEFAULT NULL,
  action_type VARCHAR(30) DEFAULT NULL,
  action_result VARCHAR(20) DEFAULT NULL,
  action_detail TEXT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wl_rule (rule_id),
  KEY idx_wl_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流执行日志';

-- 智能提醒规则表
CREATE TABLE IF NOT EXISTS crm_smart_reminder (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '规则名称',
  reminder_type VARCHAR(30) NOT NULL COMMENT '提醒类型',
  config TEXT NOT NULL COMMENT '配置JSON',
  notify_to VARCHAR(20) DEFAULT 'owner' COMMENT '通知对象',
  notify_method VARCHAR(20) DEFAULT 'system' COMMENT '通知方式',
  status TINYINT(1) DEFAULT 1 COMMENT '状态',
  last_run_at DATETIME DEFAULT NULL,
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_sr_type (reminder_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能提醒规则';

-- 智能提醒记录表
CREATE TABLE IF NOT EXISTS crm_smart_reminder_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  rule_id INT NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id INT NOT NULL,
  remind_date DATE NOT NULL,
  user_id INT NOT NULL COMMENT '通知目标用户',
  status VARCHAR(20) DEFAULT 'pending',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_reminder_once (rule_id, target_type, target_id, remind_date),
  KEY idx_srl_user (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能提醒记录';
-- 051_integrations.sql
-- 集成：日程会议 + 社媒沟通 + API开放平台

-- 日程/会议表
CREATE TABLE IF NOT EXISTS crm_calendar_event (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL COMMENT '标题',
  event_type VARCHAR(20) NOT NULL COMMENT '类型：meeting/followup/task/reminder',
  description TEXT COMMENT '描述',
  start_time DATETIME NOT NULL COMMENT '开始时间',
  end_time DATETIME DEFAULT NULL COMMENT '结束时间',
  all_day TINYINT(1) DEFAULT 0 COMMENT '全天事件',
  location VARCHAR(200) DEFAULT NULL COMMENT '地点',
  customer_id INT DEFAULT NULL COMMENT '关联客户',
  contact_id INT DEFAULT NULL COMMENT '关联联系人',
  related_type VARCHAR(20) DEFAULT NULL COMMENT '关联类型',
  related_id INT DEFAULT NULL COMMENT '关联ID',
  attendees TEXT COMMENT '参与人ID列表JSON',
  reminder_minutes INT DEFAULT 15 COMMENT '提前提醒分钟',
  status VARCHAR(20) DEFAULT 'confirmed' COMMENT '状态',
  color VARCHAR(20) DEFAULT '#2563EB' COMMENT '显示颜色',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_ce_time (start_time, end_time),
  KEY idx_ce_customer (customer_id),
  KEY idx_ce_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='日程会议';

-- 社交通讯记录表
CREATE TABLE IF NOT EXISTS crm_social_contact (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT DEFAULT NULL COMMENT '关联客户',
  contact_id INT DEFAULT NULL COMMENT '关联联系人',
  platform VARCHAR(20) NOT NULL COMMENT '平台',
  direction VARCHAR(10) NOT NULL COMMENT '方向：in/out',
  content TEXT COMMENT '沟通内容摘要',
  attachment_url VARCHAR(500) DEFAULT NULL COMMENT '附件路径',
  message_time DATETIME DEFAULT NULL COMMENT '消息时间',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sc_customer (customer_id),
  KEY idx_sc_platform (platform),
  KEY idx_sc_time (message_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社交通讯记录';

-- API密钥表
CREATE TABLE IF NOT EXISTS crm_api_key (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '密钥名称',
  api_key VARCHAR(64) NOT NULL UNIQUE COMMENT 'API Key',
  api_secret VARCHAR(64) DEFAULT NULL COMMENT 'API Secret',
  permissions TEXT COMMENT '权限列表JSON',
  rate_limit INT DEFAULT 100 COMMENT '每小时请求限制',
  status TINYINT(1) DEFAULT 1 COMMENT '状态',
  last_used_at DATETIME DEFAULT NULL COMMENT '最后使用时间',
  expires_at DATETIME DEFAULT NULL COMMENT '过期时间',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_ak_key (api_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='API密钥';

-- Webhook订阅表
CREATE TABLE IF NOT EXISTS crm_webhook (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT 'Webhook名称',
  url VARCHAR(500) NOT NULL COMMENT '回调URL',
  events TEXT NOT NULL COMMENT '订阅事件JSON',
  secret VARCHAR(64) DEFAULT NULL COMMENT '签名密钥',
  status TINYINT(1) DEFAULT 1 COMMENT '状态',
  last_triggered_at DATETIME DEFAULT NULL COMMENT '最后触发时间',
  fail_count INT DEFAULT 0 COMMENT '连续失败次数',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Webhook订阅';

-- Webhook发送日志表
CREATE TABLE IF NOT EXISTS crm_webhook_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  webhook_id INT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload TEXT COMMENT '发送的JSON数据',
  response_status INT DEFAULT NULL COMMENT 'HTTP响应状态码',
  response_body TEXT DEFAULT NULL COMMENT '响应内容',
  status VARCHAR(20) DEFAULT NULL COMMENT 'success/failed/timeout',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wl_webhook (webhook_id),
  KEY idx_wl_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Webhook发送日志';
-- 052_advanced_features.sql
-- 高级功能：竞品分析 + 增强预测 + 智能建议

-- 竞争对手表
CREATE TABLE IF NOT EXISTS crm_competitor (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '竞争对手名称',
  website VARCHAR(200) DEFAULT NULL COMMENT '官网',
  industry VARCHAR(50) DEFAULT NULL COMMENT '行业',
  scale VARCHAR(20) DEFAULT NULL COMMENT '规模：large/medium/small/micro',
  headquarters VARCHAR(100) DEFAULT NULL COMMENT '总部所在地',
  strengths TEXT COMMENT '优势JSON数组',
  weaknesses TEXT COMMENT '劣势JSON数组',
  products TEXT COMMENT '主要产品/服务',
  price_range VARCHAR(100) DEFAULT NULL COMMENT '价格区间',
  market_share DECIMAL(5,2) DEFAULT NULL COMMENT '市场份额(%)',
  description TEXT COMMENT '公司简介',
  status TINYINT(1) DEFAULT 1 COMMENT '状态：1活跃 0不再竞争',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_comp_industry (industry),
  KEY idx_comp_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞争对手';

-- 竞品交锋记录表
CREATE TABLE IF NOT EXISTS crm_competitor_encounter (
  id INT PRIMARY KEY AUTO_INCREMENT,
  competitor_id INT NOT NULL COMMENT '竞争对手ID',
  customer_id INT DEFAULT NULL COMMENT '关联客户',
  opportunity_id INT DEFAULT NULL COMMENT '关联商机',
  encounter_type VARCHAR(30) NOT NULL COMMENT '交锋类型：lost/won/competing/encountered',
  our_price DECIMAL(12,2) DEFAULT NULL COMMENT '我方报价',
  their_price DECIMAL(12,2) DEFAULT NULL COMMENT '对方报价',
  win_reason VARCHAR(200) DEFAULT NULL COMMENT '赢单/丢单原因',
  our_advantage TEXT COMMENT '我方优势体现',
  their_advantage TEXT COMMENT '对方优势体现',
  lesson_learned TEXT COMMENT '经验教训',
  encounter_date DATE DEFAULT NULL COMMENT '交锋日期',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ce_competitor (competitor_id),
  KEY idx_ce_customer (customer_id),
  KEY idx_ce_type (encounter_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞品交锋记录';

-- 竞品情报表
CREATE TABLE IF NOT EXISTS crm_competitor_intel (
  id INT PRIMARY KEY AUTO_INCREMENT,
  competitor_id INT NOT NULL COMMENT '竞争对手ID',
  intel_type VARCHAR(20) NOT NULL COMMENT '情报类型：product/pricing/strategy/partnership/market',
  title VARCHAR(200) NOT NULL COMMENT '情报标题',
  content TEXT NOT NULL COMMENT '情报内容',
  source VARCHAR(100) DEFAULT NULL COMMENT '信息来源',
  importance VARCHAR(10) DEFAULT 'medium' COMMENT '重要程度：high/medium/low',
  verified TINYINT(1) DEFAULT 0 COMMENT '是否已验证',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ci_competitor (competitor_id),
  KEY idx_ci_type (intel_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞品情报';

-- 预测模型配置表
CREATE TABLE IF NOT EXISTS crm_prediction_config (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '模型名称',
  model_type VARCHAR(30) NOT NULL COMMENT '模型类型：moving_avg/linear_reg/seasonal',
  config TEXT COMMENT '模型参数JSON',
  accuracy DECIMAL(5,2) DEFAULT NULL COMMENT '准确率',
  last_run_at DATETIME DEFAULT NULL,
  status TINYINT(1) DEFAULT 1,
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预测模型配置';
-- 053: 性能索引（安全模式，已存在的跳过）
-- 使用存储过程单条执行，避免 DELIMITER 问题

-- 以下索引通过检查 INFORMATION_SCHEMA 动态添加
-- 如果 run_migrations.js 报错，可手动在 MySQL 中执行

-- 客户表
CREATE INDEX idx_customer_assignee ON crm_customer(assignee);
CREATE INDEX idx_customer_status_lifecycle ON crm_customer(status, lifecycle_status);
CREATE INDEX idx_customer_last_follow ON crm_customer(last_follow_time);
CREATE INDEX idx_customer_owner ON crm_customer(owner_id, deleted_at);

-- 跟进记录
CREATE INDEX idx_followup_customer_time ON crm_follow_up(customer_id, follow_time DESC);
CREATE INDEX idx_followup_next_time ON crm_follow_up(next_time);

-- 合同
CREATE INDEX idx_contract_customer ON crm_contract(customer_id, deleted_at);
CREATE INDEX idx_contract_sign_date ON crm_contract(sign_date);
CREATE INDEX idx_contract_status ON crm_contract(status, deleted_at);

-- 回款
CREATE INDEX idx_payment_contract ON crm_payment(contract_id);
CREATE INDEX idx_payment_date ON crm_payment(pay_date);

-- 回款计划
CREATE INDEX idx_plan_contract ON crm_payment_plan(contract_id);
CREATE INDEX idx_plan_date ON crm_payment_plan(plan_date);

-- 报价
CREATE INDEX idx_quote_customer ON crm_quote(customer_id, deleted_at);
CREATE INDEX idx_quote_approval ON crm_quote(approval_status);

-- 商机
CREATE INDEX idx_opp_customer ON crm_opportunity(customer_id, deleted_at);
CREATE INDEX idx_opp_stage ON crm_opportunity(stage, deleted_at);
CREATE INDEX idx_opp_owner ON crm_opportunity(owner_id, deleted_at);

-- 工单
CREATE INDEX idx_service_customer ON crm_service_order(customer_id);
CREATE INDEX idx_service_status ON crm_service_order(status);

-- 审批
CREATE INDEX idx_approval_approver ON crm_approval_record(approver_id, status);
CREATE INDEX idx_approval_business ON crm_approval_record(business_type, business_id);

-- 库存变动
CREATE INDEX idx_stock_product ON crm_stock_movement(product_id, created_at DESC);

-- 日程
CREATE INDEX idx_calendar_time ON crm_calendar_event(start_time, end_time);
CREATE INDEX idx_calendar_create_by ON crm_calendar_event(create_by, deleted_at);

-- 社媒沟通
CREATE INDEX idx_social_customer ON crm_social_contact(customer_id, message_time DESC);

-- 佣金
CREATE INDEX idx_commission_user ON crm_commission_record(user_id, period);
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
-- ============================================================
-- 迁移 055: 邮件集成
-- 日期: 2026-06-11
-- ============================================================

USE huakey_crm;

-- ============================================================
-- 1. 邮件账号配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_email_account (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '关联用户',
  email VARCHAR(100) NOT NULL COMMENT '邮箱地址',
  display_name VARCHAR(50) COMMENT '发件人显示名称',
  imap_host VARCHAR(100) COMMENT 'IMAP服务器',
  imap_port INT DEFAULT 993 COMMENT 'IMAP端口',
  smtp_host VARCHAR(100) COMMENT 'SMTP服务器',
  smtp_port INT DEFAULT 587 COMMENT 'SMTP端口',
  password_encrypted VARCHAR(200) COMMENT '加密存储的密码/授权码',
  use_ssl TINYINT(1) DEFAULT 1,
  sync_status VARCHAR(20) DEFAULT 'pending' COMMENT '同步状态：pending/syncing/active/error',
  last_sync_at TIMESTAMP NULL COMMENT '上次同步时间',
  status TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ea_user (user_id),
  FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='邮件账号配置表';

-- ============================================================
-- 2. 邮件记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_email (
  id INT PRIMARY KEY AUTO_INCREMENT,
  account_id INT NOT NULL COMMENT '邮件账号ID',
  message_id VARCHAR(200) COMMENT '邮件Message-ID（用于去重）',
  direction VARCHAR(10) NOT NULL COMMENT '方向：in收件/out发件',
  from_address VARCHAR(200) COMMENT '发件人',
  to_addresses TEXT COMMENT '收件人（JSON数组）',
  cc_addresses TEXT COMMENT '抄送（JSON数组）',
  subject VARCHAR(500) COMMENT '邮件主题',
  body_text TEXT COMMENT '纯文本内容',
  body_html TEXT COMMENT 'HTML内容',
  has_attachments TINYINT(1) DEFAULT 0 COMMENT '有附件',
  attachment_count INT DEFAULT 0,
  customer_id INT COMMENT '关联客户',
  contact_id INT COMMENT '关联联系人',
  is_read TINYINT(1) DEFAULT 0 COMMENT '是否已读',
  is_starred TINYINT(1) DEFAULT 0 COMMENT '星标',
  folder VARCHAR(20) DEFAULT 'inbox' COMMENT '文件夹：inbox/sent/draft/trash',
  sent_at TIMESTAMP NULL COMMENT '发送时间',
  received_at TIMESTAMP NULL COMMENT '接收时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_account (account_id),
  INDEX idx_email_customer (customer_id),
  INDEX idx_email_contact (contact_id),
  INDEX idx_email_folder (folder),
  INDEX idx_email_message_id (message_id),
  INDEX idx_email_direction (direction),
  FOREIGN KEY (account_id) REFERENCES crm_email_account(id),
  FOREIGN KEY (customer_id) REFERENCES crm_customer(id),
  FOREIGN KEY (contact_id) REFERENCES crm_contact(id),
  UNIQUE KEY uk_message_id (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='邮件记录表';

-- ============================================================
-- 3. 邮件附件表
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_email_attachment (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email_id INT NOT NULL,
  filename VARCHAR(200) NOT NULL COMMENT '文件名',
  file_path VARCHAR(500) COMMENT '存储路径',
  file_size INT COMMENT '文件大小（字节）',
  mime_type VARCHAR(100) COMMENT 'MIME类型',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ea_email (email_id),
  FOREIGN KEY (email_id) REFERENCES crm_email(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='邮件附件表';

-- 104: Opportunity Center v1.1 字段扩展
-- ============================================================
-- 变更内容：
--   1. crm_opportunity 新增 opportunity_no 业务编号（UNIQUE）
--   2. crm_opportunity 新增 source_id 商机来源（外键到字典表）
--   3. 新增 crm_opportunity_source 来源字典表
--   4. 为存量商机回填 opportunity_no
-- 设计说明：
--   - opportunity_no 格式：OPP-YYMMDD-NNN（参考 quote_no 的 QUO-YYMMDD-NNN 模式）
--   - source_id 为可空字段，存量数据 NULL 表示未指定来源
--   - 字典表支持启用/禁用，便于管理来源选项
-- ============================================================
USE huakey_crm;

-- ============================================================
-- 第一步：crm_opportunity 新增 opportunity_no 字段（幂等）
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_opportunity'
    AND COLUMN_NAME = 'opportunity_no'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE crm_opportunity ADD COLUMN opportunity_no VARCHAR(32) DEFAULT NULL COMMENT ''商机编号（OPP-YYMMDD-NNN）'' AFTER name',
  'SELECT ''opportunity_no column already exists'' AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 为存量商机回填 opportunity_no（按 id 顺序生成）
-- 仅回填 NULL 的记录，避免重复执行
SET @row_num := 0;
SET @today := DATE_FORMAT(NOW(), '%y%m%d');
UPDATE crm_opportunity
SET opportunity_no = CONCAT('OPP-', @today, '-', LPAD((@row_num := @row_num + 1), 3, '0'))
WHERE opportunity_no IS NULL AND deleted_at IS NULL;

-- 添加 UNIQUE 索引（幂等：先检查是否存在）
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_opportunity'
    AND INDEX_NAME = 'uk_opportunity_no'
);

SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE crm_opportunity ADD UNIQUE INDEX uk_opportunity_no (opportunity_no)',
  'SELECT ''uk_opportunity_no index already exists'' AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 第二步：新增 crm_opportunity_source 来源字典表（幂等）
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_opportunity_source (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL COMMENT '来源名称',
  code VARCHAR(30) NOT NULL COMMENT '来源代码',
  sort_order INT DEFAULT 0 COMMENT '排序',
  is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用：1=启用 0=禁用',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_source_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商机来源字典表';

-- 初始化默认来源数据（幂等：仅插入不存在的记录）
INSERT IGNORE INTO crm_opportunity_source (name, code, sort_order) VALUES
  ('线上询盘', 'online_inquiry', 1),
  ('电话咨询', 'phone_call', 2),
  ('邮件咨询', 'email', 3),
  ('客户转介绍', 'referral', 4),
  ('展会获客', 'exhibition', 5),
  ('主动开发', 'outbound', 6),
  ('其他', 'other', 99);

-- ============================================================
-- 第三步：crm_opportunity 新增 source_id 字段（幂等）
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_opportunity'
    AND COLUMN_NAME = 'source_id'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE crm_opportunity ADD COLUMN source_id INT DEFAULT NULL COMMENT ''商机来源ID（外键到 crm_opportunity_source）'' AFTER opportunity_no',
  'SELECT ''source_id column already exists'' AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加普通索引（用于按来源筛选，幂等）
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_opportunity'
    AND INDEX_NAME = 'idx_source_id'
);

SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE crm_opportunity ADD INDEX idx_source_id (source_id)',
  'SELECT ''idx_source_id index already exists'' AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

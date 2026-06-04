-- ============================================================
-- 迁移 037: 客户生命周期字段（兼容式新增，不删除status）
-- 日期: 2026-06-04
-- 数据库: MySQL 8.0+
-- ============================================================

USE huakey_crm;

-- 1. 新增 customer_type 字段（如果不存在）
SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_customer'
    AND COLUMN_NAME = 'customer_type'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN customer_type VARCHAR(20) DEFAULT ''prospect'' COMMENT ''对象类型: prospect=潜客 customer=正式客户'' AFTER status',
  'SELECT ''customer_type 字段已存在，跳过'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 新增 lifecycle_status 字段（如果不存在）
SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_customer'
    AND COLUMN_NAME = 'lifecycle_status'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN lifecycle_status VARCHAR(20) DEFAULT ''new'' COMMENT ''生命周期: new/nurturing/intent/active/lost/inactive'' AFTER customer_type',
  'SELECT ''lifecycle_status 字段已存在，跳过'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 新增索引（如果不存在）
SET @index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_customer'
    AND INDEX_NAME = 'idx_customer_type'
);

SET @sql = IF(@index_exists = 0,
  'CREATE INDEX idx_customer_type ON crm_customer(customer_type)',
  'SELECT ''idx_customer_type 索引已存在，跳过'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_customer'
    AND INDEX_NAME = 'idx_lifecycle_status'
);

SET @sql = IF(@index_exists = 0,
  'CREATE INDEX idx_lifecycle_status ON crm_customer(lifecycle_status)',
  'SELECT ''idx_lifecycle_status 索引已存在，跳过'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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
WHERE status != 0
GROUP BY status, customer_type, lifecycle_status
ORDER BY status;

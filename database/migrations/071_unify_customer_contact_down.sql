-- ============================================
-- 回滚: 联系人模块成为客户信息唯一入口
-- 说明: 删除迁移生成的联系人数据，移除 is_primary 字段，恢复旧字段注释
-- ============================================

-- 1. 删除本次迁移插入的联系人（通过主联系人标记识别，避免误删历史数据）
--    注：本次迁移将 is_decision=1 且 is_primary=1 的联系人作为迁移数据，
--        若业务已自行添加其他联系人，建议人工确认后再执行回滚
DELETE FROM crm_contact
WHERE is_primary = 1 AND is_decision = 1
  AND customer_id IN (
    SELECT id FROM crm_customer
    WHERE deleted_at IS NULL
      AND (contact_name IS NOT NULL AND TRIM(contact_name) != '')
  );

-- 2. 移除 is_primary 字段（动态判断列是否存在）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact' AND COLUMN_NAME = 'is_primary');
SET @drop_col_sql = IF(@col_exists = 1,
  'ALTER TABLE crm_contact DROP COLUMN is_primary',
  'SELECT 1');
PREPARE drop_col_stmt FROM @drop_col_sql;
EXECUTE drop_col_stmt;
DEALLOCATE PREPARE drop_col_stmt;

-- 3. 移除索引（动态判断索引是否存在）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact' AND INDEX_NAME = 'idx_contact_primary');
SET @drop_idx_sql = IF(@idx_exists = 1,
  'DROP INDEX idx_contact_primary ON crm_contact',
  'SELECT 1');
PREPARE drop_idx_stmt FROM @drop_idx_sql;
EXECUTE drop_idx_stmt;
DEALLOCATE PREPARE drop_idx_stmt;

-- 4. 恢复 crm_customer 旧字段注释
ALTER TABLE crm_customer
  MODIFY COLUMN contact_name VARCHAR(50) NULL COMMENT '联系人姓名',
  MODIFY COLUMN phone VARCHAR(20) NULL COMMENT '联系电话',
  MODIFY COLUMN email VARCHAR(100) NULL COMMENT '电子邮箱';

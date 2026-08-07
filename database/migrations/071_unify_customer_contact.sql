-- ============================================
-- 迁移: 联系人模块成为客户信息唯一入口
-- 说明: 将 crm_customer 中的 contact_name/phone/email 迁移到 crm_contact，
--       并建立主联系人标记，为后续前端统一取联系人数据做准备
-- ============================================

-- 1. 给 crm_customer 旧字段加废弃注释（不删除字段）
ALTER TABLE crm_customer
  MODIFY COLUMN contact_name VARCHAR(50) NULL COMMENT '【已废弃】请使用 crm_contact',
  MODIFY COLUMN phone VARCHAR(20) NULL COMMENT '【已废弃】请使用 crm_contact',
  MODIFY COLUMN email VARCHAR(100) NULL COMMENT '【已废弃】请使用 crm_contact';

-- 2. 给 crm_contact 增加主联系人标记（动态判断列是否存在）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact' AND COLUMN_NAME = 'is_primary');
SET @add_col_sql = IF(@col_exists = 0,
  'ALTER TABLE crm_contact ADD COLUMN is_primary TINYINT(1) NOT NULL DEFAULT 0 COMMENT "是否主联系人"',
  'SELECT 1');
PREPARE add_col_stmt FROM @add_col_sql;
EXECUTE add_col_stmt;
DEALLOCATE PREPARE add_col_stmt;

-- 3. 添加主联系人复合索引（动态判断索引是否存在）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact' AND INDEX_NAME = 'idx_contact_primary');
SET @add_idx_sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_contact_primary ON crm_contact(customer_id, is_primary)',
  'SELECT 1');
PREPARE add_idx_stmt FROM @add_idx_sql;
EXECUTE add_idx_stmt;
DEALLOCATE PREPARE add_idx_stmt;

-- 4. 迁移历史数据：将 crm_customer 的联系人生成到 crm_contact
--    只迁移未删除客户、且联系人姓名不为空的记录，默认标记为决策人和主联系人
-- [幂等] 使用 NOT EXISTS 防止重复执行时产生重复联系人
INSERT INTO crm_contact (customer_id, name, phone, email, is_decision, is_primary, create_time, update_time)
SELECT
  c.id,
  NULLIF(TRIM(c.contact_name), ''),
  NULLIF(TRIM(c.phone), ''),
  NULLIF(TRIM(c.email), ''),
  1,
  1,
  c.create_time,
  c.update_time
FROM crm_customer c
WHERE c.deleted_at IS NULL
  AND (c.contact_name IS NOT NULL AND TRIM(c.contact_name) != '')
  AND NOT EXISTS (
    SELECT 1 FROM crm_contact existing
    WHERE existing.customer_id = c.id
      AND existing.name = NULLIF(TRIM(c.contact_name), '')
      AND existing.deleted_at IS NULL
  )
ORDER BY c.id;

-- 5. 为已有联系人（本次迁移前存在的）补充主联系人标记：每个客户最多一个主联系人
--    优先保留 is_decision=1 的，否则取 id 最小的一个
UPDATE crm_contact c1
JOIN (
  SELECT MIN(id) AS id
  FROM crm_contact
  WHERE deleted_at IS NULL
  GROUP BY customer_id
  HAVING SUM(is_primary) = 0
) c2 ON c1.id = c2.id
SET c1.is_primary = 1;

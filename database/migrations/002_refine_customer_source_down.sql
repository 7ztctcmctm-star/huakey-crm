-- ============================================================
-- 回滚: 002_refine_customer_source
-- 说明: 无法完美回滚数据变更（'其他网络渠道' 无法区分原始值），
--       仅恢复 CHECK 约束。数据回滚需人工确认。
-- ============================================================

USE huakey_crm;

-- 恢复 CHECK 约束（原始 5 个值）
SET @constraint_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_customer'
    AND CONSTRAINT_NAME = 'chk_customer_source'
    AND CONSTRAINT_TYPE = 'CHECK'
);
SET @sql = IF(@constraint_exists = 0,
  "ALTER TABLE crm_customer ADD CONSTRAINT chk_customer_source CHECK (source IN ('网络', '展会', '转介绍', '电话', '其他'))",
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- [注意] 数据回滚需人工确认:
-- UPDATE crm_customer SET source = '网络' WHERE source = '其他网络渠道';
-- 但无法确定哪些 '其他网络渠道' 原来就是 '网络'，哪些是新增值

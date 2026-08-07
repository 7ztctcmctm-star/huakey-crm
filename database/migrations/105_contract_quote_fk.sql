-- ============================================================
-- 105: Contract quote_id 外键约束
-- ============================================================
-- 变更内容：
--   1. crm_contract.quote_id 新增 FK → crm_quote.id (ON DELETE SET NULL)
--
-- 背景：
--   Contract Center v1 架构审计发现: 079 迁移仅添加了 quote_id 字段和 INDEX，
--   未添加外键约束。应用层 (convertToContract) 校验了 quote 存在性，
--   但 DB 层无兜底保护。
--
-- 风险：🟢 低。纯新增 FK，不修改现有数据。
--       仅在 quote_id IS NOT NULL 且目标 quote 不存在时阻止 INSERT/UPDATE。
--       存量数据: quote_id 默认为 NULL，不受 FK 约束影响。
-- ============================================================

USE huakey_crm;

-- 添加外键约束（幂等）
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_contract'
    AND CONSTRAINT_NAME = 'fk_contract_quote'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE crm_contract
   ADD CONSTRAINT fk_contract_quote
   FOREIGN KEY (quote_id) REFERENCES crm_quote(id)
   ON DELETE SET NULL',
  'SELECT ''fk_contract_quote already exists'' AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

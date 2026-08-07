-- ============================================================
-- 102: 商机字段扩展 - 新增 lost_reason
-- ============================================================
-- 变更内容：
--   1. crm_opportunity 新增 lost_reason 字段（输单原因，stage=6 时填写）
--
-- 背景：
--   Opportunity Center v1 MVP 范围。
--   stage_code 字段经评审不落库，由应用层 STAGE_CODE_MAP 映射生成。
--
-- 风险：🟢 低。纯新增列，零语义变更，零数据回填。
-- ============================================================

USE huakey_crm;

-- 1. 新增 lost_reason 字段（幂等）
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_opportunity'
    AND COLUMN_NAME = 'lost_reason'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE crm_opportunity ADD COLUMN lost_reason VARCHAR(500) DEFAULT NULL COMMENT ''输单原因（stage=6 时填写）'' AFTER remark',
  'SELECT ''lost_reason column already exists'' AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

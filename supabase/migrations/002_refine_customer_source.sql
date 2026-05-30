-- ============================================================
-- 迁移: 细化客户来源字段
-- 日期: 2026-05-16
-- 说明:
--   1. 删除旧的 CHECK 约束（仅限 5 个值）
--   2. 将历史数据中 source='网络' 迁移为 '其他网络渠道'
--   3. 不重新添加 CHECK 约束（新来源值较多，由应用层校验）
-- ============================================================

-- Step 1: 删除旧约束
ALTER TABLE crm_customer
  DROP CONSTRAINT IF EXISTS chk_customer_source;

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

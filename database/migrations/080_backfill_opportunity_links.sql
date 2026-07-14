-- Prompt 4-3-8: 历史数据补齐
-- 为无商机关联的报价单/合同生成占位商机并回填 opportunity_id
-- 幂等：仅处理 opportunity_id IS NULL 的记录

USE huakey_crm;

-- 1. 为无商机关联的报价单生成占位商机
INSERT INTO crm_opportunity (customer_id, name, expected_amount, stage, win_rate, remark, owner_id, create_time)
SELECT
  q.customer_id,
  CONCAT('报价单 ', q.quote_no, ' 关联商机'),
  COALESCE(q.final_amount, q.amount, 0),
  3,  -- stage 3 = 方案报价
  50,
  '系统自动补齐（来自报价单）',
  q.create_by,
  q.create_time
FROM crm_quote q
WHERE q.opportunity_id IS NULL
  AND q.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM crm_opportunity o
    WHERE o.customer_id = q.customer_id
      AND o.name = CONCAT('报价单 ', q.quote_no, ' 关联商机')
  );

-- 2. 回填报价单的 opportunity_id
UPDATE crm_quote q
JOIN crm_opportunity o
  ON o.customer_id = q.customer_id
  AND o.name = CONCAT('报价单 ', q.quote_no, ' 关联商机')
SET q.opportunity_id = o.id
WHERE q.opportunity_id IS NULL
  AND q.deleted_at IS NULL;

-- 3. 为无商机关联的合同生成占位商机
INSERT INTO crm_opportunity (customer_id, name, expected_amount, stage, win_rate, remark, owner_id, create_time)
SELECT
  c.customer_id,
  CONCAT('合同 ', c.contract_no, ' 关联商机'),
  COALESCE(c.amount, 0),
  5,  -- stage 5 = 成交
  100,
  '系统自动补齐（来自合同）',
  c.create_by,
  c.create_time
FROM crm_contract c
WHERE c.opportunity_id IS NULL
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM crm_opportunity o
    WHERE o.customer_id = c.customer_id
      AND o.name = CONCAT('合同 ', c.contract_no, ' 关联商机')
  );

-- 4. 回填合同的 opportunity_id
UPDATE crm_contract c
JOIN crm_opportunity o
  ON o.customer_id = c.customer_id
  AND o.name = CONCAT('合同 ', c.contract_no, ' 关联商机')
SET c.opportunity_id = o.id
WHERE c.opportunity_id IS NULL
  AND c.deleted_at IS NULL;

-- 5. 回填合同的 quote_id（同客户同时间的报价单→合同关联）
UPDATE crm_contract c
JOIN crm_quote q
  ON q.customer_id = c.customer_id
  AND q.opportunity_id = c.opportunity_id
SET c.quote_id = q.id
WHERE c.quote_id IS NULL
  AND c.opportunity_id IS NOT NULL
  AND q.deleted_at IS NULL
  AND c.deleted_at IS NULL;

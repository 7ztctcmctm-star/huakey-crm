-- Rollback: Prompt 4-3-8 回退历史数据补齐
-- 注意：生成的占位商机不主动删除（可能已有手动操作引用），仅清除回填的 opportunity_id / quote_id

USE huakey_crm;

-- 1. 清除回填的合同 quote_id（仅清除由补齐脚本设置的）
UPDATE crm_contract c
JOIN crm_opportunity o
  ON o.customer_id = c.customer_id
  AND c.opportunity_id = o.id
SET c.quote_id = NULL
WHERE o.remark = '系统自动补齐（来自合同）'
  AND c.quote_id IS NOT NULL;

-- 2. 清除回填的合同 opportunity_id（仅补齐脚本生成的商机）
UPDATE crm_contract c
JOIN crm_opportunity o ON c.opportunity_id = o.id
SET c.opportunity_id = NULL
WHERE o.remark IN ('系统自动补齐（来自合同）', '系统自动补齐（来自报价单）');

-- 3. 清除回填的报价单 opportunity_id（仅补齐脚本生成的商机）
UPDATE crm_quote q
JOIN crm_opportunity o ON q.opportunity_id = o.id
SET q.opportunity_id = NULL
WHERE o.remark IN ('系统自动补齐（来自合同）', '系统自动补齐（来自报价单）');

-- 4. 删除占位商机
DELETE FROM crm_opportunity
WHERE remark IN ('系统自动补齐（来自合同）', '系统自动补齐（来自报价单）');

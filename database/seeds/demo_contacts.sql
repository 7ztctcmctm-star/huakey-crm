-- ============================================================
-- Demo 种子数据：联系人
-- 联系人：陈志明（采购经理，主联系人 + 决策人）
-- 幂等：用 customer_id + name 组合判断 NOT EXISTS
-- ============================================================

INSERT INTO crm_contact
  (customer_id, name, position, phone, email, wechat, is_decision, is_primary, remark, is_demo, create_time)
SELECT
  c.id,
  '陈志明',
  '采购经理',
  '13800138001',
  'chenzm@huaxin-auto.com',
  'chenzm_auto',
  1,
  1,
  'Demo 演示联系人：项目主要决策人，负责采购与技术对接',
  1, NOW()
FROM crm_customer c
WHERE c.company_name = '广东华信汽车零部件有限公司' AND c.is_demo = 1
  AND NOT EXISTS (
    SELECT 1 FROM crm_contact ct
    WHERE ct.customer_id = c.id AND ct.name = '陈志明' AND ct.is_demo = 1
  );

-- 回填跟进记录的 contact_id（将之前 NULL 的 contact_id 关联到陈志明）
UPDATE crm_follow_up f
JOIN crm_customer c ON f.customer_id = c.id
JOIN crm_contact ct ON ct.customer_id = c.id AND ct.is_demo = 1
SET f.contact_id = ct.id
WHERE c.company_name = '广东华信汽车零部件有限公司'
  AND c.is_demo = 1
  AND ct.name = '陈志明'
  AND f.is_demo = 1
  AND f.contact_id IS NULL;

-- ------------------------------------------------------------
-- 验证输出
-- ------------------------------------------------------------
SELECT '=== demo_contacts 完成 ===' AS result;
SELECT ct.id, ct.name, ct.position, ct.is_primary, ct.is_decision, ct.is_demo
FROM crm_contact ct
JOIN crm_customer c ON ct.customer_id = c.id
WHERE c.is_demo = 1;

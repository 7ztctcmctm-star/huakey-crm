-- ============================================================
-- Demo 种子数据：合同
-- 合同：HT-202609001，3500000，2026-09-01 签订，执行中
-- 幂等：contract_no 为 UNIQUE，用 INSERT IGNORE
-- 关联：customer_id / opportunity_id / quote_id / create_by 用子查询
-- ============================================================

INSERT IGNORE INTO crm_contract
  (contract_no, customer_id, opportunity_id, quote_id, amount,
   currency, exchange_rate, sign_date, delivery_date, payment_terms,
   status, approval_status, approver_id, approval_remark, remark,
   create_by, is_demo, create_time)
SELECT
  'HT-202609001',
  c.id,
  o.id,
  q.id,
  3500000.00,
  'CNY', 1.0000,
  '2026-09-01',
  '2026-12-31',
  '30% 预付款、60% 验收款、10% 质保金（验收后 3 个月）',
  1,
  2,
  (SELECT id FROM sys_user WHERE username = 'demo_admin' LIMIT 1),
  'Demo 自动审批通过',
  'Demo 演示合同：广东华信汽车自动化生产线升级项目，含输送线、视觉检测、MES 三部分交付。',
  (SELECT id FROM sys_user WHERE username = 'demo_sales' LIMIT 1),
  1, NOW()
FROM crm_customer c
JOIN crm_opportunity o ON o.customer_id = c.id AND o.is_demo = 1
LEFT JOIN crm_quote q ON q.customer_id = c.id AND q.is_demo = 1
WHERE c.company_name = '广东华信汽车零部件有限公司' AND c.is_demo = 1
  AND NOT EXISTS (SELECT 1 FROM crm_contract WHERE contract_no = 'HT-202609001');

-- ------------------------------------------------------------
-- 验证输出
-- ------------------------------------------------------------
SELECT '=== demo_contracts 完成 ===' AS result;
SELECT id, contract_no, amount, sign_date, delivery_date, status, approval_status, quote_id, is_demo
FROM crm_contract WHERE is_demo = 1;

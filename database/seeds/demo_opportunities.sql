-- ============================================================
-- Demo 种子数据：商机
-- 商机：2026年华信汽车自动化生产线升级项目，3500000
-- 客户已签约 → stage=5（已成交），win_rate=100
-- 幂等：用 customer_id + name 组合判断 NOT EXISTS
-- ============================================================

INSERT INTO crm_opportunity
  (customer_id, name, expected_amount, expected_date, stage, win_rate, remark,
   owner_id, is_demo, create_time)
SELECT
  c.id,
  '2026年华信汽车自动化生产线升级项目',
  3500000.00,
  '2026-09-30',
  5,
  100,
  'Demo 演示商机：客户签约自动化生产线升级项目，含输送线、视觉检测、MES 三部分，合同金额 350 万。',
  (SELECT id FROM sys_user WHERE username = 'demo_sales' LIMIT 1),
  1, NOW()
FROM crm_customer c
WHERE c.company_name = '广东华信汽车零部件有限公司' AND c.is_demo = 1
  AND NOT EXISTS (
    SELECT 1 FROM crm_opportunity o
    WHERE o.customer_id = c.id AND o.name = '2026年华信汽车自动化生产线升级项目' AND o.is_demo = 1
  );

-- ------------------------------------------------------------
-- 验证输出
-- ------------------------------------------------------------
SELECT '=== demo_opportunities 完成 ===' AS result;
SELECT o.id, o.name, o.expected_amount, o.stage, o.win_rate, o.is_demo
FROM crm_opportunity o
JOIN crm_customer c ON o.customer_id = c.id
WHERE c.is_demo = 1;

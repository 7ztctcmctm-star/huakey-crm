-- ============================================================
-- Demo 种子数据：回款计划 + 回款记录
-- 合同金额 3500000，付款方式 30%/60%/10%
--   第1期 1050000 (30%) 2026-09-15 status=completed 已收
--   第2期 2100000 (60%) 2026-12-15 status=pending   待收
--   第3期 350000  (10%) 2027-03-31 status=pending   未到期（质保金）
-- 回款记录：第1期 1050000 已收（2026-09-20 银行转账）
-- 幂等：用 contract_id + plan_date 组合判断 NOT EXISTS
-- ============================================================

-- ------------------------------------------------------------
-- 1. 回款计划（3 期）
-- ------------------------------------------------------------
INSERT INTO crm_payment_plan
  (contract_id, plan_date, plan_amount, remark, status, paid_amount, overdue_days, is_demo, create_time)
SELECT
  ct.id, '2026-09-15', 1050000.00, 'Demo 第1期：预付款 30%', 'completed', 1050000.00, 0, 1, NOW()
FROM crm_contract ct
WHERE ct.contract_no = 'HT-202609001' AND ct.is_demo = 1
  AND NOT EXISTS (
    SELECT 1 FROM crm_payment_plan pp
    WHERE pp.contract_id = ct.id AND pp.plan_date = '2026-09-15' AND pp.is_demo = 1
  );

INSERT INTO crm_payment_plan
  (contract_id, plan_date, plan_amount, remark, status, paid_amount, overdue_days, is_demo, create_time)
SELECT
  ct.id, '2026-12-15', 2100000.00, 'Demo 第2期：验收款 60%（待收）', 'pending', 0.00, 0, 1, NOW()
FROM crm_contract ct
WHERE ct.contract_no = 'HT-202609001' AND ct.is_demo = 1
  AND NOT EXISTS (
    SELECT 1 FROM crm_payment_plan pp
    WHERE pp.contract_id = ct.id AND pp.plan_date = '2026-12-15' AND pp.is_demo = 1
  );

INSERT INTO crm_payment_plan
  (contract_id, plan_date, plan_amount, remark, status, paid_amount, overdue_days, is_demo, create_time)
SELECT
  ct.id, '2027-03-31', 350000.00, 'Demo 第3期：质保金 10%（未到期）', 'pending', 0.00, 0, 1, NOW()
FROM crm_contract ct
WHERE ct.contract_no = 'HT-202609001' AND ct.is_demo = 1
  AND NOT EXISTS (
    SELECT 1 FROM crm_payment_plan pp
    WHERE pp.contract_id = ct.id AND pp.plan_date = '2027-03-31' AND pp.is_demo = 1
  );

-- ------------------------------------------------------------
-- 2. 回款记录（第1期 1050000 已收）
-- ------------------------------------------------------------
INSERT INTO crm_payment
  (contract_id, plan_id, pay_date, pay_amount, pay_method, remark, is_demo, create_time)
SELECT
  ct.id,
  pp.id,
  '2026-09-20',
  1050000.00,
  'bank_transfer',
  'Demo 回款：第1期预付款 30% 已到账',
  1, NOW()
FROM crm_contract ct
JOIN crm_payment_plan pp ON pp.contract_id = ct.id AND pp.plan_date = '2026-09-15' AND pp.is_demo = 1
WHERE ct.contract_no = 'HT-202609001' AND ct.is_demo = 1
  AND NOT EXISTS (
    SELECT 1 FROM crm_payment p
    WHERE p.contract_id = ct.id AND p.plan_id = pp.id AND p.is_demo = 1
  );

-- ------------------------------------------------------------
-- 验证输出
-- ------------------------------------------------------------
SELECT '=== demo_payments 完成 ===' AS result;
SELECT pp.id, pp.plan_date, pp.plan_amount, pp.status, pp.paid_amount
FROM crm_payment_plan pp JOIN crm_contract ct ON pp.contract_id = ct.id
WHERE ct.is_demo = 1 ORDER BY pp.plan_date;
SELECT p.id, p.pay_date, p.pay_amount, p.pay_method
FROM crm_payment p JOIN crm_contract ct ON p.contract_id = ct.id
WHERE ct.is_demo = 1;

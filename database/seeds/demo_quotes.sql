-- ============================================================
-- Demo 种子数据：报价单 + 报价项
-- 报价：QT-202607001（3 项产品，final_amount=3500000，已审批通过）
-- 幂等：quote_no 为 UNIQUE，用 INSERT IGNORE
-- 关联：customer_id / opportunity_id / create_by 用子查询引用
-- ============================================================

-- ------------------------------------------------------------
-- 1. 报价单主表
-- status: 1=草稿 2=已发送 3=已确认 4=已失效
-- approval_status: 1=待审批 2=通过 3=拒绝
-- ------------------------------------------------------------
INSERT IGNORE INTO crm_quote
  (quote_no, customer_id, opportunity_id, amount, discount, final_amount,
   valid_days, remark, status, approval_status, approver_id, approval_remark,
   create_by, currency, exchange_rate, is_demo, create_time)
SELECT
  'QT-202607001',
  c.id,
  o.id,
  3500000.00,
  0.00,
  3500000.00,
  30,
  'Demo 演示报价单：自动化生产线升级项目（输送线+视觉检测+MES）',
  3,
  2,
  (SELECT id FROM sys_user WHERE username = 'demo_admin' LIMIT 1),
  'Demo 自动审批通过',
  (SELECT id FROM sys_user WHERE username = 'demo_sales' LIMIT 1),
  'CNY', 1.0000, 1, NOW()
FROM crm_customer c
JOIN crm_opportunity o ON o.customer_id = c.id AND o.is_demo = 1
WHERE c.company_name = '广东华信汽车零部件有限公司' AND c.is_demo = 1
  AND NOT EXISTS (SELECT 1 FROM crm_quote WHERE quote_no = 'QT-202607001');

-- ------------------------------------------------------------
-- 2. 报价项（3 项产品）
-- 用 product code 引用，避免 ID 硬编码
-- 幂等：用 quote_id + product_id 组合判断 NOT EXISTS
-- ------------------------------------------------------------
INSERT INTO crm_quote_item
  (quote_id, product_id, product_name, product_code, quantity, unit_price, total_price, remark)
SELECT
  q.id,
  p.id,
  p.name,
  p.code,
  1,
  p.price,
  p.price,
  CASE p.code
    WHEN 'DEMO-PROD-001' THEN '自动化输送生产线 1 套'
    WHEN 'DEMO-PROD-002' THEN '视觉检测系统 1 套'
    WHEN 'DEMO-PROD-003' THEN 'MES数据采集模块 1 套'
  END
FROM crm_quote q
CROSS JOIN crm_product p
WHERE q.quote_no = 'QT-202607001'
  AND p.code IN ('DEMO-PROD-001', 'DEMO-PROD-002', 'DEMO-PROD-003')
  AND p.is_demo = 1
  AND NOT EXISTS (
    SELECT 1 FROM crm_quote_item qi
    WHERE qi.quote_id = q.id AND qi.product_id = p.id
  );

-- ------------------------------------------------------------
-- 验证输出
-- ------------------------------------------------------------
SELECT '=== demo_quotes 完成 ===' AS result;
SELECT q.id, q.quote_no, q.amount, q.final_amount, q.status, q.approval_status, q.is_demo
FROM crm_quote q WHERE q.is_demo = 1;
SELECT qi.id, qi.product_name, qi.quantity, qi.unit_price, qi.total_price
FROM crm_quote_item qi JOIN crm_quote q ON qi.quote_id = q.id
WHERE q.is_demo = 1;

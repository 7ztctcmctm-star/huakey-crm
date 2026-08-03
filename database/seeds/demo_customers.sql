-- ============================================================
-- Demo 种子数据：客户 + 跟进记录
-- 客户：广东华信汽车零部件有限公司（status=signed 终态，owner=demo_sales）
-- 跟进：5 条（实际跟进 + 计划），驱动客户状态机
-- 幂等：company_name 非唯一，用 INSERT...SELECT WHERE NOT EXISTS
-- ============================================================

-- ------------------------------------------------------------
-- 1. 客户：广东华信汽车零部件有限公司
-- ------------------------------------------------------------
INSERT INTO crm_customer
  (company_name, contact_name, phone, email, address, industry, source, level,
   owner_id, status, customer_type, lifecycle_status, score, remark,
   last_follow_time, is_demo, create_time)
SELECT
  '广东华信汽车零部件有限公司',
  '陈志明',
  '0757-88888001',
  'chenzm@huaxin-auto.com',
  '广东省佛山市南海区汽车产业园',
  '汽车零部件制造',
  '展会',
  'A',
  (SELECT id FROM sys_user WHERE username = 'demo_sales' LIMIT 1),
  'signed',
  'customer',
  'active',
  85,
  'Demo 演示客户：自动化生产线升级项目已签约，合同金额 350 万',
  DATE_SUB(NOW(), INTERVAL 3 DAY),
  1, NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM crm_customer WHERE company_name = '广东华信汽车零部件有限公司' AND is_demo = 1
);

-- ------------------------------------------------------------
-- 2. 跟进记录：5 条（按时间倒序推进状态机 lead→following→quoted→negotiating→signed）
-- ------------------------------------------------------------
-- 跟进 1：初次接触（15 天前）
INSERT INTO crm_follow_up
  (customer_id, contact_id, follow_type, content, next_time, next_content,
   create_by, is_plan, plan_status, is_demo, create_time)
SELECT
  c.id,
  NULL, -- contact_id 稍后由 demo_contacts.sql 回填（此处允许 NULL）
  '电话',
  '初次电话沟通，客户对自动化生产线升级有明确需求，预算约 350 万，约定下周实地拜访。',
  DATE_SUB(NOW(), INTERVAL 14 DAY),
  '实地拜访 + 需求调研',
  (SELECT id FROM sys_user WHERE username = 'demo_sales' LIMIT 1),
  0, NULL, 1,
  DATE_SUB(NOW(), INTERVAL 15 DAY)
FROM crm_customer c
WHERE c.company_name = '广东华信汽车零部件有限公司' AND c.is_demo = 1
  AND NOT EXISTS (
    SELECT 1 FROM crm_follow_up f
    WHERE f.customer_id = c.id AND f.is_demo = 1
      AND f.content LIKE '初次电话沟通%'
  );

-- 跟进 2：实地拜访（12 天前）
INSERT INTO crm_follow_up
  (customer_id, contact_id, follow_type, content, next_time, next_content,
   create_by, is_plan, plan_status, is_demo, create_time)
SELECT
  c.id, NULL, '拜访',
  '实地拜访客户，参观了现有生产线，确认 3 个改造点：输送线、视觉检测、MES 数据采集。技术负责人为采购经理陈志明。',
  DATE_SUB(NOW(), INTERVAL 10 DAY),
  '出具初步方案与报价',
  (SELECT id FROM sys_user WHERE username = 'demo_sales' LIMIT 1),
  0, NULL, 1,
  DATE_SUB(NOW(), INTERVAL 12 DAY)
FROM crm_customer c
WHERE c.company_name = '广东华信汽车零部件有限公司' AND c.is_demo = 1
  AND NOT EXISTS (
    SELECT 1 FROM crm_follow_up f
    WHERE f.customer_id = c.id AND f.is_demo = 1
      AND f.content LIKE '实地拜访客户%'
  );

-- 跟进 3：方案汇报（8 天前，对应 quoted 状态）
INSERT INTO crm_follow_up
  (customer_id, contact_id, follow_type, content, next_time, next_content,
   create_by, is_plan, plan_status, is_demo, create_time)
SELECT
  c.id, NULL, '其他',
  '方案汇报会，提交自动化输送生产线、视觉检测系统、MES 数据采集模块三部分方案，客户对技术方案认可，进入商务谈判。',
  DATE_SUB(NOW(), INTERVAL 5 DAY),
  '商务谈判 + 合同条款确认',
  (SELECT id FROM sys_user WHERE username = 'demo_sales' LIMIT 1),
  0, NULL, 1,
  DATE_SUB(NOW(), INTERVAL 8 DAY)
FROM crm_customer c
WHERE c.company_name = '广东华信汽车零部件有限公司' AND c.is_demo = 1
  AND NOT EXISTS (
    SELECT 1 FROM crm_follow_up f
    WHERE f.customer_id = c.id AND f.is_demo = 1
      AND f.content LIKE '方案汇报会%'
  );

-- 跟进 4：合同签订（3 天前，对应 signed 状态）
INSERT INTO crm_follow_up
  (customer_id, contact_id, follow_type, content, next_time, next_content,
   create_by, is_plan, plan_status, is_demo, create_time)
SELECT
  c.id, NULL, '拜访',
  '合同签订，合同号 HT-202609001，金额 350 万。付款方式：30% 预付、60% 验收、10% 质保。预计交付日期 2026-12-31。',
  DATE_ADD(NOW(), INTERVAL 7 DAY),
  '跟进预付款到账 + 启动项目实施',
  (SELECT id FROM sys_user WHERE username = 'demo_sales' LIMIT 1),
  0, NULL, 1,
  DATE_SUB(NOW(), INTERVAL 3 DAY)
FROM crm_customer c
WHERE c.company_name = '广东华信汽车零部件有限公司' AND c.is_demo = 1
  AND NOT EXISTS (
    SELECT 1 FROM crm_follow_up f
    WHERE f.customer_id = c.id AND f.is_demo = 1
      AND f.content LIKE '合同签订%'
  );

-- 跟进 5：跟进计划（未来 7 天，is_plan=1, plan_status=pending）
INSERT INTO crm_follow_up
  (customer_id, contact_id, follow_type, content, next_time, next_content,
   create_by, is_plan, plan_status, finish_time, is_demo, create_time)
SELECT
  c.id, NULL, '电话',
  '【跟进计划】跟进预付款 105 万到账情况，确认后启动项目实施排期。',
  DATE_ADD(NOW(), INTERVAL 7 DAY),
  '确认预付款 + 启动实施',
  (SELECT id FROM sys_user WHERE username = 'demo_sales' LIMIT 1),
  1, 'pending', NULL, 1, NOW()
FROM crm_customer c
WHERE c.company_name = '广东华信汽车零部件有限公司' AND c.is_demo = 1
  AND NOT EXISTS (
    SELECT 1 FROM crm_follow_up f
    WHERE f.customer_id = c.id AND f.is_demo = 1
      AND f.content LIKE '【跟进计划】跟进预付款%'
  );

-- ------------------------------------------------------------
-- 验证输出
-- ------------------------------------------------------------
SELECT '=== demo_customers 完成 ===' AS result;
SELECT id, company_name, status, owner_id, is_demo FROM crm_customer WHERE is_demo = 1;
SELECT COUNT(*) AS followup_count FROM crm_follow_up WHERE is_demo = 1;

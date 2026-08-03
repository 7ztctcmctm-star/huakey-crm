-- ============================================================
-- Demo 种子数据：供应商
-- 供应商：佛山精工自动化有限公司（owner=demo_purchase）
-- 幂等：name 为 UNIQUE，用 INSERT IGNORE
-- ============================================================

INSERT IGNORE INTO crm_supplier
  (supplier_no, name, short_name, type, industry, level, status, rating,
   contact_person, contact_phone, contact_email, address, payment_terms, delivery_days,
   remark, owner_id, create_by, is_demo, create_time)
SELECT
  'DEMO-SUP-001',
  '佛山精工自动化有限公司',
  '精工自动化',
  '设备',
  '自动化设备制造',
  'A',
  1,
  4.5,
  '李工',
  '0757-88889001',
  'ligong@jinggong-auto.com',
  '广东省佛山市禅城区高新区精工路1号',
  '月结 30 天',
  15,
  'Demo 演示供应商：自动化生产线核心零部件供应商，A级评级，长期合作。',
  (SELECT id FROM sys_user WHERE username = 'demo_purchase' LIMIT 1),
  (SELECT id FROM sys_user WHERE username = 'demo_purchase' LIMIT 1),
  1, NOW()
WHERE NOT EXISTS (SELECT 1 FROM crm_supplier WHERE name = '佛山精工自动化有限公司' AND is_demo = 1);

-- ------------------------------------------------------------
-- 验证输出
-- ------------------------------------------------------------
SELECT '=== demo_suppliers 完成 ===' AS result;
SELECT id, supplier_no, name, level, rating, owner_id, is_demo FROM crm_supplier WHERE is_demo = 1;

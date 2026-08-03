-- ============================================================
-- Demo 种子数据：产品（3 个，对应报价项）
-- 1. 自动化输送生产线 1800000 (code=DEMO-PROD-001)
-- 2. 视觉检测系统       800000 (code=DEMO-PROD-002)
-- 3. MES数据采集模块    900000 (code=DEMO-PROD-003)
-- 幂等：code 为 UNIQUE，用 INSERT IGNORE
-- 标识：is_demo=1
-- ============================================================

INSERT IGNORE INTO crm_product
  (name, code, category, unit, price, cost_price, stock, description, status, is_demo, create_time)
VALUES
  ('自动化输送生产线', 'DEMO-PROD-001', '自动化设备', '套', 1800000.00, 1200000.00, 5,
   'Demo 演示产品：定制化自动化输送生产线，含输送带、工位、控制系统', 1, 1, NOW()),
  ('视觉检测系统',     'DEMO-PROD-002', '检测设备',   '套', 800000.00,  550000.00,  8,
   'Demo 演示产品：机器视觉质量检测系统，含相机、光源、检测软件', 1, 1, NOW()),
  ('MES数据采集模块',  'DEMO-PROD-003', '软件系统',   '套', 900000.00,  300000.00,  10,
   'Demo 演示产品：MES 制造执行系统数据采集与分析模块', 1, 1, NOW());

-- ------------------------------------------------------------
-- 验证输出
-- ------------------------------------------------------------
SELECT '=== demo_products 完成 ===' AS result;
SELECT id, name, code, price, is_demo FROM crm_product WHERE is_demo = 1;

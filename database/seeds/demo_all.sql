-- ============================================================
-- Demo 种子数据：聚合入口
-- 用法：mysql -u root -p huakey_crm < demo_all.sql
--       或 npm run seed:demo（通过 Node 执行器，含环境阻断）
-- 顺序：按业务链依赖，角色/用户 → 客户 → 联系人 → 产品 → 商机 → 报价 → 合同 → 回款 → 供应商
-- 幂等：所有子脚本均幂等，可重复执行
-- ============================================================

-- 注意：本文件会被 Node 执行器 scripts/seed-demo.js 读取并按顺序执行各子文件，
--       此处保留 source 聚合方式供手动 mysql 客户端使用。
-- 执行器优先推荐 npm run seed:demo（含生产环境保护与日志）。

SELECT '========================================' AS banner;
SELECT '  HuakeyCRM Demo 数据初始化开始' AS banner;
SELECT '========================================' AS banner;

-- 基线配置 + 用户（必须最先执行，后续业务数据引用用户/角色/部门）
SOURCE demo_roles.sql;
SOURCE demo_users.sql;

-- 客户 + 跟进（业务链起点）
SOURCE demo_customers.sql;

-- 联系人（依赖客户，且回填跟进 contact_id）
SOURCE demo_contacts.sql;

-- 产品（独立，被报价项引用）
SOURCE demo_products.sql;

-- 商机（依赖客户）
SOURCE demo_opportunities.sql;

-- 报价（依赖客户 + 商机 + 产品）
SOURCE demo_quotes.sql;

-- 合同（依赖客户 + 商机 + 报价）
SOURCE demo_contracts.sql;

-- 回款（依赖合同）
SOURCE demo_payments.sql;

-- 供应商（独立，owner 引用 demo_purchase）
SOURCE demo_suppliers.sql;

-- ------------------------------------------------------------
-- 汇总验证
-- ------------------------------------------------------------
SELECT '========================================' AS banner;
SELECT '  Demo 数据初始化完成 — 汇总' AS banner;
SELECT '========================================' AS banner;
SELECT
  (SELECT COUNT(*) FROM sys_user WHERE is_demo=1) AS demo_users,
  (SELECT COUNT(*) FROM crm_customer WHERE is_demo=1) AS demo_customers,
  (SELECT COUNT(*) FROM crm_contact WHERE is_demo=1) AS demo_contacts,
  (SELECT COUNT(*) FROM crm_opportunity WHERE is_demo=1) AS demo_opportunities,
  (SELECT COUNT(*) FROM crm_follow_up WHERE is_demo=1) AS demo_followups,
  (SELECT COUNT(*) FROM crm_product WHERE is_demo=1) AS demo_products,
  (SELECT COUNT(*) FROM crm_quote WHERE is_demo=1) AS demo_quotes,
  (SELECT COUNT(*) FROM crm_contract WHERE is_demo=1) AS demo_contracts,
  (SELECT COUNT(*) FROM crm_payment_plan WHERE is_demo=1) AS demo_payment_plans,
  (SELECT COUNT(*) FROM crm_payment WHERE is_demo=1) AS demo_payments,
  (SELECT COUNT(*) FROM crm_supplier WHERE is_demo=1) AS demo_suppliers;

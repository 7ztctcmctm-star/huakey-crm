-- ============================================================
-- Demo 数据清理脚本 — 按 is_demo=1 精准清理所有 Demo 数据
-- ============================================================
-- 用途：清理 `npm run seed:demo` 生成的全部 Demo 数据（is_demo=1）
-- 用法：mysql -u root -p huakey_crm < demo_cleanup.sql
--       或在 Node 中通过 mysql2 执行
--
-- 安全：
--   1. 环境保护：数据库名含 prod（且不含 test/dev/demo）时强制报错中止
--   2. 精准过滤：所有 DELETE 均带 is_demo=1，绝不触碰真实数据（is_demo=0）
--   3. 子表优先：按外键依赖反序删除，避免约束冲突
--   4. 幂等：重复执行安全（DELETE 命中 0 行不报错）
--
-- ⚠️ 此脚本会物理删除 is_demo=1 的记录，执行前请确认目标数据库
-- ============================================================

-- 环境安全检查：疑似生产库则中止
-- 采用 PREPARE/EXECUTE 模式：仅当库名不安全时才 EXECUTE 一条引用不存在表的语句触发错误，
-- 安全库则执行 SELECT 1。避免 IF(cond, (SELECT bad_col), ok) 模式在 MySQL 8.0 中
-- 无论条件真假都解析子查询列名导致 1054 误报的问题。
SET @guard_db := DATABASE();
SET @guard_safe := (@guard_db LIKE '%test%' OR @guard_db LIKE '%dev%' OR @guard_db LIKE '%demo%');
SET @guard_sql := IF(@guard_safe, 'SELECT 1 AS `guard_ok`', 'SELECT * FROM `__ABORT_POSSIBLE_PRODUCTION_DATABASE__`');
PREPARE guard_stmt FROM @guard_sql;
EXECUTE guard_stmt;
DEALLOCATE PREPARE guard_stmt;

START TRANSACTION;

-- 1. 回款记录（依赖 payment_plan / contract）
DELETE FROM crm_payment WHERE is_demo = 1;

-- 2. 回款计划（依赖 contract）
DELETE FROM crm_payment_plan WHERE is_demo = 1;

-- 3. 报价项（无 is_demo 列，按 demo 报价单关联清理）
DELETE FROM crm_quote_item WHERE quote_id IN (SELECT id FROM crm_quote WHERE is_demo = 1);

-- 4. 报价单
DELETE FROM crm_quote WHERE is_demo = 1;

-- 5. 合同
DELETE FROM crm_contract WHERE is_demo = 1;

-- 6. 审批记录（无 is_demo 列，按 demo 报价/合同关联清理）
DELETE FROM crm_approval_record
  WHERE (business_type = 'quote' AND business_id IN (SELECT id FROM (SELECT id FROM crm_quote WHERE is_demo = 1) AS t))
     OR (business_type = 'contract' AND business_id IN (SELECT id FROM (SELECT id FROM crm_contract WHERE is_demo = 1) AS t));

-- 7. 审批流程
DELETE FROM crm_approval_workflow WHERE is_demo = 1;

-- 8. 商机
DELETE FROM crm_opportunity WHERE is_demo = 1;

-- 9. 跟进记录（依赖 customer / contact）
DELETE FROM crm_follow_up WHERE is_demo = 1;

-- 10. 联系人（依赖 customer）
DELETE FROM crm_contact WHERE is_demo = 1;

-- 11. 客户
DELETE FROM crm_customer WHERE is_demo = 1;

-- 12. 产品
DELETE FROM crm_product WHERE is_demo = 1;

-- 13. 供应商
DELETE FROM crm_supplier WHERE is_demo = 1;

-- 14. Demo 用户（最后删除，避免被业务表引用）
DELETE FROM sys_user WHERE is_demo = 1;

-- 15. Demo 演示部门（仅清理固定 id=900 的 Demo 部门）
DELETE FROM sys_dept WHERE id = 900 AND name = 'Demo演示部门';

COMMIT;

-- 验证清理结果
SELECT '=== Demo 数据清理完成 ===' AS result;
SELECT
  (SELECT COUNT(*) FROM sys_user WHERE is_demo=1) AS remaining_demo_users,
  (SELECT COUNT(*) FROM crm_customer WHERE is_demo=1) AS remaining_demo_customers,
  (SELECT COUNT(*) FROM crm_quote WHERE is_demo=1) AS remaining_demo_quotes,
  (SELECT COUNT(*) FROM crm_contract WHERE is_demo=1) AS remaining_demo_contracts,
  (SELECT COUNT(*) FROM crm_supplier WHERE is_demo=1) AS remaining_demo_suppliers;

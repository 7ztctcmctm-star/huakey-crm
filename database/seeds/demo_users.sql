-- ============================================================
-- Demo 种子数据：用户（3 个 Demo 账号）
-- 账号：demo_admin / demo_sales / demo_purchase
-- 密码：Demo@123456（bcrypt 哈希，统一）
-- 幂等：username 为 UNIQUE，INSERT IGNORE 保证重复执行跳过
-- 安全：不覆盖真实用户（INSERT IGNORE 命中已存在记录时保留原密码）
-- 标识：is_demo=1
-- ============================================================

-- Demo 部门 ID（子查询引用，避免硬编码）
-- Demo 角色引用用 LOWER(code) 兼容大小写（测试库为 SALES 大写，roles.js 为 sales 小写）

-- ------------------------------------------------------------
-- 1. demo_admin（管理员，super_admin 角色，绕过权限检查）
-- ------------------------------------------------------------
INSERT IGNORE INTO sys_user
  (username, password, real_name, phone, email, dept_id, role_id, status, must_change_password, password_changed_at, is_demo, create_time)
SELECT
  'demo_admin',
  '$2b$10$gzztXX6gGQ.dpgvSKiFuc.7LxrOX4VNIab6LJqP9PGoyWkV/7qMBK',
  'Demo管理员',
  '13900000001',
  'demo_admin@huakey-demo.com',
  (SELECT id FROM sys_dept WHERE name = 'Demo演示部门' LIMIT 1),
  (SELECT id FROM sys_role WHERE code = 'super_admin' LIMIT 1),
  1, 0, NOW(), 1, NOW();

-- ------------------------------------------------------------
-- 2. demo_sales（销售，sales 角色）
-- ------------------------------------------------------------
INSERT IGNORE INTO sys_user
  (username, password, real_name, phone, email, dept_id, role_id, status, must_change_password, password_changed_at, is_demo, create_time)
SELECT
  'demo_sales',
  '$2b$10$gzztXX6gGQ.dpgvSKiFuc.7LxrOX4VNIab6LJqP9PGoyWkV/7qMBK',
  'Demo销售',
  '13900000002',
  'demo_sales@huakey-demo.com',
  (SELECT id FROM sys_dept WHERE name = 'Demo演示部门' LIMIT 1),
  (SELECT id FROM sys_role WHERE LOWER(code) = 'sales' LIMIT 1),
  1, 0, NOW(), 1, NOW();

-- ------------------------------------------------------------
-- 3. demo_purchase（采购，purchase 角色）
-- ------------------------------------------------------------
INSERT IGNORE INTO sys_user
  (username, password, real_name, phone, email, dept_id, role_id, status, must_change_password, password_changed_at, is_demo, create_time)
SELECT
  'demo_purchase',
  '$2b$10$gzztXX6gGQ.dpgvSKiFuc.7LxrOX4VNIab6LJqP9PGoyWkV/7qMBK',
  'Demo采购',
  '13900000003',
  'demo_purchase@huakey-demo.com',
  (SELECT id FROM sys_dept WHERE name = 'Demo演示部门' LIMIT 1),
  (SELECT id FROM sys_role WHERE LOWER(code) = 'purchase' LIMIT 1),
  1, 0, NOW(), 1, NOW();

-- ------------------------------------------------------------
-- 4. demo_sales2（第二销售，sales 角色）
--    【新增 2026-09-10】为「客户转移（双方同意制）」端到端走查提供第二个
--    具备 customer:transfer 权限的账号。
--    背景：转移的接收人必须有 customer:transfer 权限，否则同意时 403。
--    demo_purchase 是 purchase 角色，不具备该权限，无法充当接收人；
--    而测试库中其它 sales 账号（如 vivianli）是真实数据，密码未知，无法登录。
--    故此处补一个密码受控的第二个销售账号。
-- ------------------------------------------------------------
INSERT IGNORE INTO sys_user
  (username, password, real_name, phone, email, dept_id, role_id, status, must_change_password, password_changed_at, is_demo, create_time)
SELECT
  'demo_sales2',
  '$2b$10$gzztXX6gGQ.dpgvSKiFuc.7LxrOX4VNIab6LJqP9PGoyWkV/7qMBK',
  'Demo销售2',
  '13900000004',
  'demo_sales2@huakey-demo.com',
  (SELECT id FROM sys_dept WHERE name = 'Demo演示部门' LIMIT 1),
  (SELECT id FROM sys_role WHERE LOWER(code) = 'sales' LIMIT 1),
  1, 0, NOW(), 1, NOW();

-- ------------------------------------------------------------
-- 验证输出
-- ------------------------------------------------------------
SELECT '=== demo_users 完成 ===' AS result;
SELECT id, username, real_name, is_demo FROM sys_user WHERE is_demo = 1;

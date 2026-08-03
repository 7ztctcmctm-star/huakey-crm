-- ============================================================
-- Demo 种子数据：角色 / 部门 / 货币（基线配置）
-- 幂等：所有 INSERT 用 INSERT IGNORE，重复执行不报错
-- 说明：补齐测试库缺失的角色/部门/货币，供 Demo 用户与业务数据引用
-- ============================================================

-- ------------------------------------------------------------
-- 1. 部门（Demo 演示部门，供 Demo 用户归属）
-- ------------------------------------------------------------
INSERT IGNORE INTO sys_dept (id, name, parent_id, sort, create_time)
VALUES (900, 'Demo演示部门', 0, 900, NOW());

-- 兜底：如果 id=900 已被占用但名称不同，按名称补一个
INSERT INTO sys_dept (name, parent_id, sort, create_time)
SELECT 'Demo演示部门', 0, 901, NOW()
WHERE NOT EXISTS (SELECT 1 FROM sys_dept WHERE name = 'Demo演示部门');

-- ------------------------------------------------------------
-- 2. 角色（补齐缺失角色，code 用小写与 backend/config/roles.js ROLE_CODES 一致）
-- 已存在的角色跳过（INSERT IGNORE on code UNIQUE）
-- ------------------------------------------------------------
INSERT IGNORE INTO sys_role (name, code, description, status, view_all, manage_all, create_time) VALUES
('老板',         'boss',     '老板（看全部，管理全部）',     1, 1, 1, NOW()),
('人力资源',     'hr',       '人力资源',                     1, 0, 0, NOW()),
('采购专员',     'purchase', '采购管理',                     1, 0, 0, NOW()),
('财务专员',     'finance',  '财务查看',                     1, 1, 0, NOW()),
('工程师',       'engineer', '技术支持',                     1, 0, 0, NOW());

-- ------------------------------------------------------------
-- 3. 货币（Demo 报价/合同引用）
-- ------------------------------------------------------------
INSERT IGNORE INTO crm_currency (code, name, symbol, exchange_rate, is_default, status, created_at, updated_at) VALUES
('CNY', '人民币', '¥', 1.0000, 1, 1, NOW(), NOW()),
('USD', '美元',   '$', 7.2000, 0, 1, NOW(), NOW());

-- ------------------------------------------------------------
-- 验证输出
-- ------------------------------------------------------------
SELECT '=== demo_roles 完成 ===' AS result;
SELECT COUNT(*) AS role_count FROM sys_role;
SELECT COUNT(*) AS dept_count FROM sys_dept;
SELECT COUNT(*) AS currency_count FROM crm_currency;

-- ============================================================
-- Supabase 种子数据（supabase db reset 时自动执行）
-- 来源: database/seeds/permission_data.sql
-- 注意: 迁移已创建表结构和部分 API 权限，本文件仅补充基础菜单/按钮权限
-- ============================================================

-- 1. 插入菜单权限（幂等：ON CONFLICT DO NOTHING）
INSERT INTO sys_permission (name, code, type, parent_id, path, icon, sort) VALUES
('首页', 'dashboard', 'menu', 0, '/dashboard', 'HomeFilled', 1),
('客户管理', 'customer', 'menu', 0, NULL, 'UserFilled', 2),
('客户列表', 'customer:list', 'menu', 2, '/customer/list', NULL, 1),
('客户池', 'customer:pool', 'menu', 2, '/customer/pool', NULL, 2),
('线索管理', 'leads', 'menu', 2, '/leads', NULL, 3),
('跟进日历', 'followup:calendar', 'menu', 2, '/followup/calendar', NULL, 4),
('商机管理', 'opportunity', 'menu', 0, '/opportunity', 'TrendCharts', 3),
('产品管理', 'product', 'menu', 0, '/product', 'Collection', 4),
('报价管理', 'quotation', 'menu', 0, '/quotation', 'Document', 5),
('合同管理', 'contract', 'menu', 0, '/contract', 'DocumentChecked', 6),
('供应商管理', 'supplier', 'menu', 0, '/supplier/list', 'OfficeBuilding', 7),
('采购管理', 'purchase', 'menu', 0, '/purchase/list', 'ShoppingCart', 8),
('售后服务', 'service', 'menu', 0, '/service', 'Service', 9),
('数据报表', 'report', 'menu', 0, '/report', 'TrendCharts', 10),
('销售目标', 'target', 'menu', 0, '/target', 'DataBoard', 11),
('系统管理', 'system', 'menu', 0, NULL, 'Setting', 12),
('用户管理', 'system:user', 'menu', 16, '/system/user', NULL, 1),
('角色管理', 'system:role', 'menu', 16, '/system/role', NULL, 2),
('部门管理', 'system:dept', 'menu', 16, '/system/dept', NULL, 3),
('操作日志', 'system:log', 'menu', 16, '/system/log', NULL, 4)
ON CONFLICT (code) DO NOTHING;

-- 2. 插入按钮权限
INSERT INTO sys_permission (name, code, type, parent_id, sort) VALUES
-- 客户管理按钮（parent_id=2 → sys_permission WHERE code='customer'）
('新增客户', 'customer:add', 'button', 2, 1),
('编辑客户', 'customer:edit', 'button', 2, 2),
('删除客户', 'customer:delete', 'button', 2, 3),
('分配客户', 'customer:assign', 'button', 2, 4),
('导入客户', 'customer:import', 'button', 2, 5),
('导出客户', 'customer:export', 'button', 2, 6),
-- 商机管理按钮（parent_id=7 → 'opportunity'）
('新增商机', 'opportunity:add', 'button', 7, 1),
('编辑商机', 'opportunity:edit', 'button', 7, 2),
('删除商机', 'opportunity:delete', 'button', 7, 3),
-- 合同管理按钮（parent_id=10 → 'contract'）
('新增合同', 'contract:add', 'button', 10, 1),
('编辑合同', 'contract:edit', 'button', 10, 2),
('删除合同', 'contract:delete', 'button', 10, 3),
-- 供应商管理按钮（parent_id=11 → 'supplier'）
('新增供应商', 'supplier:add', 'button', 11, 1),
('编辑供应商', 'supplier:edit', 'button', 11, 2),
('删除供应商', 'supplier:delete', 'button', 11, 3),
-- 报价管理按钮（parent_id=9 → 'quotation'）
('新增报价', 'quotation:add', 'button', 9, 1),
('编辑报价', 'quotation:edit', 'button', 9, 2),
('删除报价', 'quotation:delete', 'button', 9, 3),
-- 采购管理按钮（parent_id=12 → 'purchase'）
('新增采购', 'purchase:add', 'button', 12, 1),
('编辑采购', 'purchase:edit', 'button', 12, 2),
('删除采购', 'purchase:delete', 'button', 12, 3),
-- 产品管理按钮（parent_id=8 → 'product'）
('新增产品', 'product:add', 'button', 8, 1),
('编辑产品', 'product:edit', 'button', 8, 2),
('删除产品', 'product:delete', 'button', 8, 3),
-- 售后服务按钮（parent_id=13 → 'service'）
('新增工单', 'service:add', 'button', 13, 1),
('编辑工单', 'service:edit', 'button', 13, 2),
('删除工单', 'service:delete', 'button', 13, 3),
-- 系统管理按钮（parent_id=17 → 'system:user', parent_id=18 → 'system:role'）
('新增用户', 'system:user:add', 'button', 17, 1),
('编辑用户', 'system:user:edit', 'button', 17, 2),
('删除用户', 'system:user:delete', 'button', 17, 3),
('新增角色', 'system:role:add', 'button', 18, 1),
('编辑角色', 'system:role:edit', 'button', 18, 2),
('删除角色', 'system:role:delete', 'button', 18, 3),
('配置权限', 'system:role:permission', 'button', 18, 4)
ON CONFLICT (code) DO NOTHING;

-- 3. 为超级管理员角色(id=1)分配所有权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 1, id FROM sys_permission
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. 为管理员角色(id=2)分配大部分权限（除系统管理子权限外）
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 2, id FROM sys_permission
WHERE parent_id != 16 OR code IN ('system:user', 'system:role', 'system:dept', 'system:log')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. 初始化数据权限配置
INSERT INTO sys_data_permission (role_id, module, data_scope) VALUES
-- 超级管理员：所有数据
(1, 'customer', 'all'),
(1, 'opportunity', 'all'),
(1, 'contract', 'all'),
(1, 'supplier', 'all'),
(1, 'purchase', 'all'),
(1, 'quotation', 'all'),
(1, 'service', 'all'),
-- 管理员：所有数据
(2, 'customer', 'all'),
(2, 'opportunity', 'all'),
(2, 'contract', 'all'),
(2, 'supplier', 'all'),
(2, 'purchase', 'all'),
(2, 'quotation', 'all'),
(2, 'service', 'all'),
-- 销售经理(id=3)：部门数据
(3, 'customer', 'dept'),
(3, 'opportunity', 'dept'),
(3, 'contract', 'dept'),
(3, 'quotation', 'dept'),
-- 销售人员(id=4)：自己的数据
(4, 'customer', 'self'),
(4, 'opportunity', 'self'),
(4, 'contract', 'self'),
(4, 'quotation', 'self')
ON CONFLICT (role_id, module) DO NOTHING;

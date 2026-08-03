-- ============================================
-- 创建缺失的角色 + 修复角色名编码
-- ============================================
SET NAMES utf8mb4;
USE huakey_crm;

-- 1. 修复现有角色的乱码名称
UPDATE sys_role SET name = '老板', description = '企业老板，拥有全部数据权限' WHERE code = 'boss';
UPDATE sys_role SET name = '财务专员', description = '财务部门，查看财务相关数据' WHERE code = 'finance';
UPDATE sys_role SET name = '超级管理员', description = '系统超级管理员，绕过所有权限检查' WHERE code = 'super_admin';

-- 2. 创建缺失的5个角色
INSERT IGNORE INTO sys_role (name, code, description, status, view_all, manage_all) VALUES
  ('部门经理', 'manager', '部门经理，查看全部数据，管理本部门', 1, 1, 0),
  ('销售人员', 'sales', '销售人员，管理自己的客户和商机', 1, 0, 0),
  ('人力资源', 'hr', '人力资源，管理员工档案和考勤', 1, 0, 0),
  ('采购专员', 'purchaser', '采购专员，管理供应商和采购单', 1, 0, 0),
  ('工程师', 'engineer', '工程师，负责技术支持和售后服务', 1, 0, 0);

-- 3. 验证角色列表
SELECT '=== 角色列表 ===' AS info;
SELECT id, code, name, view_all, manage_all FROM sys_role ORDER BY id;

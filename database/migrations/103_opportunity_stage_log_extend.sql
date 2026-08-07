-- ============================================================
-- 103: 阶段日志扩展 + 商机查看权限码
-- ============================================================
-- 变更内容：
--   1. crm_opportunity_stage_log 新增 change_reason 字段（阶段变更原因）
--   2. sys_permission 新增 opportunity:view 权限码（查看商机）
--   3. sys_role_permission 为 sales/manager/boss 角色分配 opportunity:view
--
-- 背景：
--   Opportunity Center v1 MVP 范围。
--   现有列表/详情接口复用 menu 权限，不规范。新增 opportunity:view
--   用于列表/详情查询的权限检查。
--
-- 风险：🟢 低。纯新增列 + 新增权限码，零数据回填。
-- ============================================================

USE huakey_crm;

-- ============================================================
-- 第一步：crm_opportunity_stage_log 新增 change_reason
-- ============================================================

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'huakey_crm'
    AND TABLE_NAME = 'crm_opportunity_stage_log'
    AND COLUMN_NAME = 'change_reason'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE crm_opportunity_stage_log ADD COLUMN change_reason VARCHAR(500) DEFAULT NULL COMMENT ''阶段变更原因'' AFTER to_stage',
  'SELECT ''change_reason column already exists'' AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 第二步：新增 opportunity:view 权限码
-- ============================================================

-- 2.1 新增权限定义（幂等）
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '查看商机', 'opportunity:view', 'button',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'opportunity') AS p),
       0, 1
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'opportunity:view');

-- ============================================================
-- 第三步：为现有拥有 opportunity 权限的角色分配 opportunity:view
-- ============================================================

-- 3.1 找出所有已分配 opportunity 菜单权限的角色，为其补 opportunity:view
-- sys_role_permission 表结构: (role_id, permission_id) — 通过 permission_id 外键关联 sys_permission.id
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT r.role_id, (SELECT id FROM sys_permission WHERE code = 'opportunity:view')
FROM sys_role_permission r
WHERE r.permission_id = (SELECT id FROM sys_permission WHERE code = 'opportunity')
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission r2
    WHERE r2.role_id = r.role_id
      AND r2.permission_id = (SELECT id FROM sys_permission WHERE code = 'opportunity:view')
  );

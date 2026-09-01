-- ============================================================
-- 109: 清理死权限码（终审报告 §3.4 / P2-1）
-- ============================================================
-- 背景：
--   八维度终审审计确认以下权限码在 DB 中定义存在，但既无路由
--   checkPermission 使用、也无前端 v-permission / 路由 meta 引用，
--   仅在权限管理 UI 的可勾选列表中出现，无实际效果。
--
--   审计原列 12 个码，其中 `leads`(menu) 经复核【保留】：
--   - 它是 leads:view / leads:convert（/api/v1/leads 现行端点在用）
--     的父容器节点，删除会孤儿化 5 个子权限；
--   - frontend/src/views/system/role.vue 的 sales 快捷模板引用 'leads'。
--   故实际清理 11 个码。
--
-- 清理清单（11 个）：
--   按钮型：approval:view, notification:view, permission:view, scoring:view
--   API 型：customer:manage, pool:assign, leads:add, leads:claim, leads:release
--   菜单型：followup_template（旧码，现行码为 followup:template）,
--           reminder（前端无对应路由，点击无页面）
--
-- 变更：
--   1. 删除 sys_role_permission 中这些码的角色关联（部分码曾被
--      demo 种子授予，均为无效果授权）
--   2. 删除 sys_permission 中的码定义
--
-- 影响评估：
--   🟢 低风险。所有码经生产+测试库双重核对无任何功能性使用；
--   删除后权限管理 UI 的可勾选列表相应减少无效项；
--   拥有这些码的角色不受任何功能影响。
--
-- 关联变更：
--   backend/scripts/init_role_permissions.js 已同步移除
--   reminder / followup_template 两条种子，避免部署时复活死码。
--
-- 跨库兼容：不使用 USE 语句，依赖 migrate.js 连接的默认数据库。
-- ============================================================

-- 1. 删除角色关联
DELETE rp FROM sys_role_permission rp
JOIN sys_permission p ON rp.permission_id = p.id
WHERE p.code IN (
  'approval:view', 'customer:manage', 'followup_template',
  'leads:add', 'leads:claim', 'leads:release',
  'notification:view', 'permission:view', 'pool:assign',
  'reminder', 'scoring:view'
);

-- 2. 删除权限定义
DELETE FROM sys_permission
WHERE code IN (
  'approval:view', 'customer:manage', 'followup_template',
  'leads:add', 'leads:claim', 'leads:release',
  'notification:view', 'permission:view', 'pool:assign',
  'reminder', 'scoring:view'
);

-- 3. 验证：死码应已删除（应为 0 行）
SELECT '=== 109 验证：死码残留（应为 0）===' AS info;
SELECT code FROM sys_permission
WHERE code IN (
  'approval:view', 'customer:manage', 'followup_template',
  'leads:add', 'leads:claim', 'leads:release',
  'notification:view', 'permission:view', 'pool:assign',
  'reminder', 'scoring:view'
);

-- 4. 验证：leads 容器菜单及其活子节点应保留
SELECT '=== 109 验证：leads 菜单树应完整保留 ===' AS info;
SELECT p.code, p.name, p.type, p.is_visible
FROM sys_permission p
WHERE p.code = 'leads'
   OR p.parent_id = (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'leads') AS t)
ORDER BY p.id;

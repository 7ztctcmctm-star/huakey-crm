-- =============================================================================
-- 120_manager_full_permissions.sql
-- 2026-09-29 · Phase 20 权限矩阵验证修复
-- 2026-10-15 · 改按 roleCode 定位角色（原硬编码 role_id=1/2）
--   背景：本项目铁律「role_id 映射三方冲突，一律 roleCode」——本机测试库
--   boss=1/manager=2 恰好蒙对，但角色 id 跨环境并不可靠（如 finance 在测试库是 31、
--   生产库当年是 6，121 的硬编码就因此只在 production 生效）。改为按 sys_role.code 定位，
--   任何环境行为一致。生产库 2026-09-30 已按旧版执行过（manager=112），本改动不影响生产终态。
-- =============================================================================
-- 根因：manager 当前只有 20 条权限码，boss 有 111 条 — 差 92 条。
--       Phase 20 权限矩阵实测大量 manager 端点 403
-- 目标：让 manager 功能权限 = boss（全部权限码），数据权限保持 dept_and_sub
-- 设计：INSERT IGNORE 从 boss 复制到 manager — 幂等可重跑
-- =============================================================================

-- Step 1: 功能权限 — manager 继承 boss 全部权限码（INSERT IGNORE 保证幂等）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT mr.id, br_rp.permission_id
FROM sys_role_permission br_rp
JOIN sys_role br ON br.id = br_rp.role_id AND br.code = 'boss'
CROSS JOIN (SELECT id FROM sys_role WHERE code = 'manager') mr;

-- Step 2: 验证
SELECT COUNT(*) as manager_perms FROM sys_role_permission rp
JOIN sys_role r ON r.id = rp.role_id WHERE r.code = 'manager';

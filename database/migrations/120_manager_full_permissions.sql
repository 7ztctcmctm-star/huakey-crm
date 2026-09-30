-- =============================================================================
-- 120_manager_full_permissions.sql
-- 2026-09-29 · Phase 20 权限矩阵验证修复
-- =============================================================================
-- 根因：manager (role_id=2) 当前只有 20 条权限码，boss (role_id=1) 有 111 条
--       — 差 92 条。Phase 20 权限矩阵实测大量 manager 端点 403
-- 目标：让 manager 功能权限 = boss（全部权限码），数据权限保持 dept_and_sub
-- 设计：INSERT IGNORE 从 role_id=1 复制到 role_id=2 — 幂等可重跑
-- =============================================================================

-- Step 1: 功能权限 — manager 继承 boss 全部权限码（INSERT IGNORE 保证幂等）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT 2, rp.permission_id
FROM sys_role_permission rp
WHERE rp.role_id = 1;

-- Step 2: 验证
-- 执行后 role_id=2 应有 >= 111 条权限码（可能比 role_id=1 多因为之前已有 20 条）
SELECT COUNT(*) as manager_perms FROM sys_role_permission WHERE role_id=2;

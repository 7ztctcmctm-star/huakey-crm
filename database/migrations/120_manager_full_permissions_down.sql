-- =============================================================================
-- 120_manager_full_permissions_down.sql
-- 回滚：清空 manager 的权限码，恢复到迁移前状态
-- 2026-10-15 · 改按 roleCode 定位角色（原硬编码 role_id=2）
--   背景同 up：role_id 跨环境不可靠，按 sys_role.code='manager' 定位才任何环境一致。
-- ⚠️ 已知设计缺陷（2026-09-29 审计已记）：本 down 会连 manager 迁移前的自有权限
--    一起清空（不是「恢复到迁移前」）。若 manager 需要保留底座权限，应在回滚后
--    重跑 init_role_permissions.js（权限唯一年事实源）重建。
-- =============================================================================

DELETE rp FROM sys_role_permission rp
JOIN sys_role r ON r.id = rp.role_id
WHERE r.code = 'manager';

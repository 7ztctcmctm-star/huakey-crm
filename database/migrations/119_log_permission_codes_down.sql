-- ============================================================
-- 119_log_permission_codes_down.sql
-- 回滚：删除 119 新增的 log:export / log:delete 权限码与角色授权
-- ============================================================
-- 2026-10-15 补建（上线前审计 P0-4 收尾）：
-- 119 曾是唯一没有 down 脚本的迁移（KNOWN_MISSING_DOWN 白名单里的常客）。
-- 后果实测：深回滚（--rollback 002）时 119 被跳过 ⇒ 其记账行幸存 ⇒ 正向重放又因
-- 「已执行」不重跑；而早期 down 脚本（如 013）会清掉 sys_permission 表
-- ⇒ log:delete（权限脚本不种、只由 119 播种）在回滚后永久消失，
-- migrationGuard 的 119 断言红。补上本文件后链路完整：回滚删码、重放重建。
--
-- 注意：119_up 的授权语句还含 'system:log'（早于 119 存在的码），本 down **不**动它，
-- 只删 119 真正新增的 log:export / log:delete。
-- ============================================================

-- 1. 先删角色-权限关联
DELETE rp FROM sys_role_permission rp
JOIN sys_permission p ON p.id = rp.permission_id
WHERE p.code IN ('log:export', 'log:delete');

-- 2. 再删权限码本身
DELETE FROM sys_permission
WHERE code IN ('log:export', 'log:delete');

-- 3. 删除版本记账（119_up 自带记账 INSERT，此处对齐；run_migrations 也会删，双删无害）
DELETE FROM schema_migrations WHERE version = '119';

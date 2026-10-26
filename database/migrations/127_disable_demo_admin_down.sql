-- 127_disable_demo_admin_down.sql
-- 安全修复不可自动逆操作：重新启用 demo_admin 会恢复默认高权限账户风险。
-- 如确需恢复，必须由管理员在变更窗口内人工评估，并同时重置强密码后再启用：
--   UPDATE sys_user
--      SET status = 1, password_changed_at = NOW()
--    WHERE username = 'demo_admin' AND deleted_at IS NULL;
-- 此处仅保留占位，保证迁移链有对应回滚文件。
SELECT 1;

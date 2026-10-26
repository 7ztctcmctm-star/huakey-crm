-- 127_disable_demo_admin.sql
-- [P1-17 2026-10-23] 演示账号 demo_admin（local id=70）仍是 status=1 的 super_admin。
-- 该账号是演示/初始化遗留，口令强度与使用人未知，属于默认高权限账户风险。
--
-- 处理方式：禁用而非删除（保留审计与历史外键），并推进 password_changed_at，
-- 使该账号此前签发的 JWT 立即失效（auth 中间件按 password_changed_at 拒绝）。
-- 幂等：重复执行影响 0 行；不修改密码哈希，不删除任何业务数据。
--
-- 执行前只读核对：
--   SELECT id, username, status, role_id FROM sys_user WHERE username = 'demo_admin';

UPDATE sys_user
   SET status = 0,
       password_changed_at = NOW()
 WHERE username = 'demo_admin'
   AND deleted_at IS NULL
   AND status <> 0;

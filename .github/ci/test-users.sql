-- ============================================================
-- ⚠️  仅限 CI/E2E 测试环境  ⚠️
-- 禁止在生产环境执行此脚本！
-- 此脚本为 CI 流水线创建测试用户账号
-- 生产环境的管理员账号应通过 deploy/init-admin.sql 创建
-- ============================================================

-- E2E 测试用户: admin / huakey123 (supertest + Playwright 共用)
INSERT IGNORE INTO sys_role (name, code, description, status, view_all, manage_all)
VALUES ('超级管理员', 'super_admin', '系统超级管理员（仅限测试环境）', 1, 1, 1);

-- 使用 ON DUPLICATE KEY UPDATE 确保即使 init-complete.sql 已创建 admin 用户，
-- 也会更新密码和 role_id，避免 hash 不匹配或 role_id 指向错误角色
-- role_id 通过子查询动态获取 super_admin 的 id，避免硬编码
INSERT INTO sys_user (username, password, real_name, role_id, status, must_change_password)
VALUES (
  'admin',
  '$2b$10$nGCFy/w40K.sHEmvtLFEuum6FpwcFXdhEyH0o6asZ5z25sB/0qHhK',
  '管理员（测试）',
  (SELECT id FROM sys_role WHERE code = 'super_admin'),
  1,
  0
)
ON DUPLICATE KEY UPDATE
  password = VALUES(password),
  role_id = VALUES(role_id),
  status = 1,
  must_change_password = 0;

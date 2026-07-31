-- ============================================================
-- ⚠️  仅限 CI/E2E 测试环境  ⚠️
-- 禁止在生产环境执行此脚本！
-- 此脚本为 CI 流水线创建测试用户账号
-- 生产环境的管理员账号应通过 deploy/init-admin.sql 创建
-- ============================================================

-- E2E 测试用户: admin / huakey123 (supertest + Playwright 共用)
INSERT IGNORE INTO sys_role (name, code, description, status, view_all, manage_all)
VALUES ('超级管理员', 'super_admin', '系统超级管理员（仅限测试环境）', 1, 1, 1);
INSERT IGNORE INTO sys_user (username, password, real_name, role_id, status, must_change_password)
VALUES ('admin', '$2b$10$8RTmG9jYHzGjVU04QdVwEunqICJxJXtFIpC6Pqlch3LaDhf2GRUYe', '管理员（测试）', 1, 1, 0);

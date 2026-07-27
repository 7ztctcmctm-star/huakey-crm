-- ============================================================
-- 生产环境初始管理员账号
-- ============================================================
-- 说明：
-- 1. 本脚本在部署时执行一次，创建 super_admin 角色的初始管理员
-- 2. 默认账号 admin 的初始密码为：Huakey@Admin2026!
-- 3. 首次登录后系统会强制要求修改密码
-- 4. 部署后请立即登录并修改密码
-- ============================================================

-- 确保超级管理员角色存在
INSERT IGNORE INTO sys_role (name, code, description, status, view_all, manage_all)
VALUES ('超级管理员', 'super_admin', '系统超级管理员，仅用于平台级运维', 1, 1, 1);

-- 创建初始管理员账号（密码: Huakey@Admin2026!）
-- must_change_password=1 表示首次登录强制改密
INSERT INTO sys_user (username, password, real_name, role_id, status, must_change_password)
SELECT 'admin',
       '$2b$10$y7tfEhwQ.lYVTohwXwYLT.iDRe.ABt5EhwaXZsMdjOiLVMAyg8RW',
       '系统管理员',
       (SELECT id FROM sys_role WHERE code = 'super_admin' LIMIT 1),
       1,
       1
WHERE NOT EXISTS (SELECT 1 FROM sys_user WHERE username = 'admin');

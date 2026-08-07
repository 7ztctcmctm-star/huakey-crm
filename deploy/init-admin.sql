-- ============================================================
-- 生产环境初始管理员账号
-- ============================================================
-- 说明：
-- 1. 本脚本在部署时执行一次，创建 super_admin 角色的初始管理员
-- 2. 初始密码不再硬编码在 SQL 中，需通过环境变量 ADMIN_INITIAL_PASSWORD_HASH 注入
-- 3. 生成 bcrypt hash 命令（在 .env.secrets 中设置 ADMIN_INITIAL_PASSWORD 后执行）：
--      node -e "console.log(require('bcryptjs').hashSync(process.env.ADMIN_INITIAL_PASSWORD, 10))"
-- 4. 渲染并执行本脚本：
--      export ADMIN_INITIAL_PASSWORD_HASH=$(node -e "console.log(require('bcryptjs').hashSync(process.env.ADMIN_INITIAL_PASSWORD, 10))")
--      envsubst < deploy/init-admin.sql | mysql -u root -p huakey_crm
-- 5. 首次登录后系统会强制要求修改密码
-- 6. 部署后请立即登录并修改密码
-- ============================================================

-- 确保超级管理员角色存在
INSERT IGNORE INTO sys_role (name, code, description, status, view_all, manage_all)
VALUES ('超级管理员', 'super_admin', '系统超级管理员，仅用于平台级运维', 1, 1, 1);

-- 创建初始管理员账号（密码由环境变量 ADMIN_INITIAL_PASSWORD_HASH 注入）
-- must_change_password=1 表示首次登录强制改密
INSERT INTO sys_user (username, password, real_name, role_id, status, must_change_password)
SELECT 'admin',
       '${ADMIN_INITIAL_PASSWORD_HASH}',
       '系统管理员',
       (SELECT id FROM sys_role WHERE code = 'super_admin' LIMIT 1),
       1,
       1
WHERE NOT EXISTS (SELECT 1 FROM sys_user WHERE username = 'admin')
  AND '${ADMIN_INITIAL_PASSWORD_HASH}' != '';

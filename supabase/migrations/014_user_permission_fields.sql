-- ============================================================
-- 迁移: 用户权限字段
-- 日期: 2026-05-25
-- 说明: 为用户表添加权限相关字段，创建用户权限视图
-- ============================================================

-- 为用户表添加权限相关字段
ALTER TABLE sys_user
ADD COLUMN IF NOT EXISTS last_login_time TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(50);

COMMENT ON COLUMN sys_user.last_login_time IS '最后登录时间';
COMMENT ON COLUMN sys_user.last_login_ip IS '最后登录IP';

-- 创建用户权限视图（方便查询）
CREATE OR REPLACE VIEW v_user_permissions AS
SELECT
    u.id as user_id,
    u.username,
    u.real_name,
    u.role_id,
    r.name as role_name,
    p.code as permission_code,
    p.name as permission_name,
    p.type as permission_type
FROM sys_user u
LEFT JOIN sys_role r ON u.role_id = r.id
LEFT JOIN sys_role_permission rp ON r.id = rp.role_id
LEFT JOIN sys_permission p ON rp.permission_id = p.id
WHERE u.status = 1 AND p.id IS NOT NULL;

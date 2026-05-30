-- ============================================================
-- 迁移: 权限系统重构
-- 日期: 2026-05-25
-- 说明: 创建权限表、角色权限关联表、数据权限配置表
-- ============================================================

-- 1. 权限表
CREATE TABLE IF NOT EXISTS sys_permission (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(50) NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('menu', 'button', 'api')),
    parent_id INT DEFAULT 0,
    path VARCHAR(200) DEFAULT NULL,
    icon VARCHAR(50) DEFAULT NULL,
    sort INT DEFAULT 0,
    is_visible BOOLEAN DEFAULT TRUE,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uk_code UNIQUE (code)
);

COMMENT ON TABLE sys_permission IS '权限表';
COMMENT ON COLUMN sys_permission.id IS '权限ID';
COMMENT ON COLUMN sys_permission.name IS '权限名称';
COMMENT ON COLUMN sys_permission.code IS '权限编码';
COMMENT ON COLUMN sys_permission.type IS '权限类型';
COMMENT ON COLUMN sys_permission.parent_id IS '父权限ID';
COMMENT ON COLUMN sys_permission.path IS '权限路径（菜单路径或API路径）';
COMMENT ON COLUMN sys_permission.icon IS '图标';
COMMENT ON COLUMN sys_permission.sort IS '排序';
COMMENT ON COLUMN sys_permission.is_visible IS '是否可见';
COMMENT ON COLUMN sys_permission.create_time IS '创建时间';
COMMENT ON COLUMN sys_permission.update_time IS '更新时间';

CREATE INDEX IF NOT EXISTS idx_parent_id ON sys_permission(parent_id);
CREATE INDEX IF NOT EXISTS idx_type ON sys_permission(type);

CREATE TRIGGER trg_sys_permission_update_time
    BEFORE UPDATE ON sys_permission
    FOR EACH ROW EXECUTE FUNCTION update_update_time();

-- 2. 角色权限关联表
CREATE TABLE IF NOT EXISTS sys_role_permission (
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uk_role_permission UNIQUE (role_id, permission_id),
    CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES sys_role(id) ON DELETE CASCADE,
    CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES sys_permission(id) ON DELETE CASCADE
);

COMMENT ON TABLE sys_role_permission IS '角色权限关联表';
COMMENT ON COLUMN sys_role_permission.id IS '主键ID';
COMMENT ON COLUMN sys_role_permission.role_id IS '角色ID';
COMMENT ON COLUMN sys_role_permission.permission_id IS '权限ID';
COMMENT ON COLUMN sys_role_permission.create_time IS '创建时间';

CREATE INDEX IF NOT EXISTS idx_role_id ON sys_role_permission(role_id);
CREATE INDEX IF NOT EXISTS idx_permission_id ON sys_role_permission(permission_id);

-- 3. 数据权限配置表
CREATE TABLE IF NOT EXISTS sys_data_permission (
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL,
    module VARCHAR(50) NOT NULL,
    data_scope VARCHAR(20) DEFAULT 'self' CHECK (data_scope IN ('all', 'dept', 'dept_and_sub', 'self', 'custom')),
    custom_dept_ids VARCHAR(500) DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uk_role_module UNIQUE (role_id, module)
);

COMMENT ON TABLE sys_data_permission IS '数据权限配置表';
COMMENT ON COLUMN sys_data_permission.id IS '主键ID';
COMMENT ON COLUMN sys_data_permission.role_id IS '角色ID';
COMMENT ON COLUMN sys_data_permission.module IS '模块名称';
COMMENT ON COLUMN sys_data_permission.data_scope IS '数据范围';
COMMENT ON COLUMN sys_data_permission.custom_dept_ids IS '自定义部门ID列表';
COMMENT ON COLUMN sys_data_permission.create_time IS '创建时间';
COMMENT ON COLUMN sys_data_permission.update_time IS '更新时间';

CREATE INDEX IF NOT EXISTS idx_data_perm_role_id ON sys_data_permission(role_id);

CREATE TRIGGER trg_sys_data_permission_update_time
    BEFORE UPDATE ON sys_data_permission
    FOR EACH ROW EXECUTE FUNCTION update_update_time();

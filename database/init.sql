-- CRM系统数据库初始化脚本
-- 数据库: huakey_crm
-- 创建日期: 2026-05-14

-- 1. 创建数据库
CREATE DATABASE IF NOT EXISTS huakey_crm
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE huakey_crm;

-- 2. 创建用户并授权
CREATE USER IF NOT EXISTS 'crm_user'@'localhost' IDENTIFIED BY 'Huakey@2024';
CREATE USER IF NOT EXISTS 'crm_user'@'%' IDENTIFIED BY 'Huakey@2024';

GRANT ALL PRIVILEGES ON huakey_crm.* TO 'crm_user'@'localhost';
GRANT ALL PRIVILEGES ON huakey_crm.* TO 'crm_user'@'%';

FLUSH PRIVILEGES;

-- 3. 创建部门表
CREATE TABLE IF NOT EXISTS sys_dept (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '部门ID',
    name VARCHAR(50) NOT NULL COMMENT '部门名称',
    parent_id INT DEFAULT 0 COMMENT '上级部门ID',
    sort INT DEFAULT 0 COMMENT '排序',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_parent_id (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='部门表';

-- 4. 创建角色表
CREATE TABLE IF NOT EXISTS sys_role (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '角色ID',
    name VARCHAR(50) NOT NULL COMMENT '角色名称',
    code VARCHAR(50) NOT NULL COMMENT '角色编码',
    description VARCHAR(255) DEFAULT NULL COMMENT '描述',
    status TINYINT DEFAULT 1 COMMENT '状态(1正常0禁用)',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色表';

-- 5. 创建用户表
CREATE TABLE IF NOT EXISTS sys_user (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '用户ID',
    username VARCHAR(50) NOT NULL COMMENT '用户名',
    password VARCHAR(255) NOT NULL COMMENT '密码',
    real_name VARCHAR(50) DEFAULT NULL COMMENT '真实姓名',
    phone VARCHAR(20) DEFAULT NULL COMMENT '电话',
    email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
    dept_id INT DEFAULT NULL COMMENT '部门ID',
    role_id INT DEFAULT NULL COMMENT '角色ID',
    status TINYINT DEFAULT 1 COMMENT '状态(1正常0禁用)',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_username (username),
    KEY idx_dept_id (dept_id),
    KEY idx_role_id (role_id),
    CONSTRAINT fk_user_dept FOREIGN KEY (dept_id) REFERENCES sys_dept(id) ON DELETE SET NULL,
    CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES sys_role(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 6. 插入初始数据

-- 插入部门数据
INSERT INTO sys_dept (name, parent_id, sort) VALUES
('总公司', 0, 1),
('销售部', 1, 1),
('技术部', 1, 2),
('客服部', 1, 3),
('市场部', 1, 4);

-- 插入角色数据
INSERT INTO sys_role (name, code, description, status) VALUES
('超级管理员', 'super_admin', '系统超级管理员，拥有所有权限', 1),
('管理员', 'admin', '系统管理员', 1),
('销售经理', 'sales_manager', '销售部门经理', 1),
('销售人员', 'sales', '普通销售人员', 1),
('技术人员', 'tech', '技术人员', 1);

-- 插入默认管理员用户 (密码: admin123)
INSERT INTO sys_user (username, password, real_name, phone, email, dept_id, role_id, status) VALUES
('admin', '$2b$10$eY0sRG.fsdRu5RO/HHMDrOVBEuFwE.BbPfe66qnMi3DqP0BIbofry', '系统管理员', '13800138000', 'admin@huakey.com', 1, 1, 1);

-- 7. 验证数据
SELECT '数据库初始化完成' AS result;
SELECT COUNT(*) AS dept_count FROM sys_dept;
SELECT COUNT(*) AS role_count FROM sys_role;
SELECT COUNT(*) AS user_count FROM sys_user;

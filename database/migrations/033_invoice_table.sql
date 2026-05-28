-- 发票管理表
-- 日期: 2026-05-28

USE huakey_crm;

CREATE TABLE IF NOT EXISTS crm_invoice (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    invoice_no VARCHAR(50) NOT NULL COMMENT '发票编号',
    contract_id INT NOT NULL COMMENT '合同ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    type TINYINT DEFAULT 1 COMMENT '发票类型：1=增值税普票 2=增值税专票 3=电子发票',
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 COMMENT '发票金额',
    tax_rate DECIMAL(5, 2) DEFAULT NULL COMMENT '税率(%)',
    tax_amount DECIMAL(15, 2) DEFAULT NULL COMMENT '税额',
    invoice_date DATE DEFAULT NULL COMMENT '开票日期',
    status TINYINT DEFAULT 1 COMMENT '状态：1=待开票 2=已开票 3=已邮寄 4=已作废',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
    INDEX idx_invoice_no (invoice_no),
    INDEX idx_contract (contract_id),
    INDEX idx_customer (customer_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='发票表';

-- 插入发票菜单权限
INSERT INTO sys_permission (name, code, type, parent_id, path, icon, sort) VALUES
('发票管理', 'invoice', 'menu', 0, '/invoice', 'Document', 13);

SET @invoice_parent_id = LAST_INSERT_ID();

INSERT INTO sys_permission (name, code, type, parent_id, sort) VALUES
('新增发票', 'invoice:add', 'button', @invoice_parent_id, 1),
('编辑发票', 'invoice:edit', 'button', @invoice_parent_id, 2),
('删除发票', 'invoice:delete', 'button', @invoice_parent_id, 3),
('导出发票', 'invoice:export', 'button', @invoice_parent_id, 4);

-- 为超级管理员分配发票权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 1, id FROM sys_permission WHERE code IN ('invoice', 'invoice:add', 'invoice:edit', 'invoice:delete', 'invoice:export');

-- 为管理员分配发票权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 2, id FROM sys_permission WHERE code IN ('invoice', 'invoice:add', 'invoice:edit', 'invoice:delete', 'invoice:export');

SELECT '发票表创建完成' AS result;

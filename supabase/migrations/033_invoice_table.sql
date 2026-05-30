-- 发票管理表
-- 日期: 2026-05-28

CREATE TABLE IF NOT EXISTS crm_invoice (
    id SERIAL PRIMARY KEY,
    invoice_no VARCHAR(50) NOT NULL,
    contract_id INT NOT NULL,
    customer_id INT NOT NULL,
    type SMALLINT DEFAULT 1,
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    tax_rate DECIMAL(5, 2) DEFAULT NULL,
    tax_amount DECIMAL(15, 2) DEFAULT NULL,
    invoice_date DATE DEFAULT NULL,
    status SMALLINT DEFAULT 1,
    remark VARCHAR(500) DEFAULT NULL,
    create_by INT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW(),
    update_time TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP DEFAULT NULL
);

COMMENT ON TABLE crm_invoice IS '发票表';
COMMENT ON COLUMN crm_invoice.id IS '主键ID';
COMMENT ON COLUMN crm_invoice.invoice_no IS '发票编号';
COMMENT ON COLUMN crm_invoice.contract_id IS '合同ID';
COMMENT ON COLUMN crm_invoice.customer_id IS '客户ID';
COMMENT ON COLUMN crm_invoice.type IS '发票类型：1=增值税普票 2=增值税专票 3=电子发票';
COMMENT ON COLUMN crm_invoice.amount IS '发票金额';
COMMENT ON COLUMN crm_invoice.tax_rate IS '税率(%)';
COMMENT ON COLUMN crm_invoice.tax_amount IS '税额';
COMMENT ON COLUMN crm_invoice.invoice_date IS '开票日期';
COMMENT ON COLUMN crm_invoice.status IS '状态：1=待开票 2=已开票 3=已邮寄 4=已作废';
COMMENT ON COLUMN crm_invoice.remark IS '备注';
COMMENT ON COLUMN crm_invoice.create_by IS '创建人ID';
COMMENT ON COLUMN crm_invoice.create_time IS '创建时间';
COMMENT ON COLUMN crm_invoice.update_time IS '更新时间';
COMMENT ON COLUMN crm_invoice.deleted_at IS '软删除时间';

CREATE INDEX IF NOT EXISTS idx_invoice_no ON crm_invoice(invoice_no);
CREATE INDEX IF NOT EXISTS idx_invoice_contract ON crm_invoice(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoice_customer ON crm_invoice(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status ON crm_invoice(status);

CREATE TRIGGER trg_crm_invoice_update_time
    BEFORE UPDATE ON crm_invoice
    FOR EACH ROW EXECUTE FUNCTION update_update_time();

-- 插入发票菜单权限（LAST_INSERT_ID → 先 INSERT 获取 ID）
INSERT INTO sys_permission (name, code, type, parent_id, path, icon, sort)
SELECT '发票管理', 'invoice', 'menu', 0, '/invoice', 'Document', 13
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'invoice');

-- 子权限以父权限 code='invoice' 为 parent_id
INSERT INTO sys_permission (name, code, type, parent_id, sort)
SELECT '新增发票', 'invoice:add', 'button', p.id, 1
FROM sys_permission p WHERE p.code = 'invoice'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'invoice:add');

INSERT INTO sys_permission (name, code, type, parent_id, sort)
SELECT '编辑发票', 'invoice:edit', 'button', p.id, 2
FROM sys_permission p WHERE p.code = 'invoice'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'invoice:edit');

INSERT INTO sys_permission (name, code, type, parent_id, sort)
SELECT '删除发票', 'invoice:delete', 'button', p.id, 3
FROM sys_permission p WHERE p.code = 'invoice'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'invoice:delete');

INSERT INTO sys_permission (name, code, type, parent_id, sort)
SELECT '导出发票', 'invoice:export', 'button', p.id, 4
FROM sys_permission p WHERE p.code = 'invoice'
AND NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'invoice:export');

-- 为超级管理员分配发票权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 1, id FROM sys_permission WHERE code IN ('invoice', 'invoice:add', 'invoice:edit', 'invoice:delete', 'invoice:export')
ON CONFLICT DO NOTHING;

-- 为管理员分配发票权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 2, id FROM sys_permission WHERE code IN ('invoice', 'invoice:add', 'invoice:edit', 'invoice:delete', 'invoice:export')
ON CONFLICT DO NOTHING;

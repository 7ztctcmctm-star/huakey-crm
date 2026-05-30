-- 通用附件表（支持工单、跟进记录等）
CREATE TABLE IF NOT EXISTS crm_attachment (
    id SERIAL PRIMARY KEY,
    business_type VARCHAR(50) NOT NULL,
    business_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT DEFAULT 0,
    file_type VARCHAR(50) DEFAULT NULL,
    create_by INT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE crm_attachment IS '通用附件表';
COMMENT ON COLUMN crm_attachment.id IS '主键ID';
COMMENT ON COLUMN crm_attachment.business_type IS '关联业务类型: service_order, follow_up';
COMMENT ON COLUMN crm_attachment.business_id IS '关联业务ID';
COMMENT ON COLUMN crm_attachment.file_name IS '原始文件名';
COMMENT ON COLUMN crm_attachment.file_path IS '存储路径';
COMMENT ON COLUMN crm_attachment.file_size IS '文件大小(字节)';
COMMENT ON COLUMN crm_attachment.file_type IS '文件MIME类型';
COMMENT ON COLUMN crm_attachment.create_by IS '上传人';
COMMENT ON COLUMN crm_attachment.create_time IS '创建时间';

CREATE INDEX IF NOT EXISTS idx_business ON crm_attachment(business_type, business_id);

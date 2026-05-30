-- ============================================================
-- TASK-002: 数据保护机制完善
-- 日期: 2026-05-25
-- ============================================================

-- 1. 为缺失 deleted_at 的表添加字段
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_product' AND column_name = 'deleted_at') THEN
        ALTER TABLE crm_product ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;
        COMMENT ON COLUMN crm_product.deleted_at IS '删除时间';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_follow_up' AND column_name = 'deleted_at') THEN
        ALTER TABLE crm_follow_up ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;
        COMMENT ON COLUMN crm_follow_up.deleted_at IS '删除时间';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_pool_log' AND column_name = 'deleted_at') THEN
        ALTER TABLE crm_pool_log ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;
        COMMENT ON COLUMN crm_pool_log.deleted_at IS '删除时间';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sys_dept' AND column_name = 'deleted_at') THEN
        ALTER TABLE sys_dept ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;
        COMMENT ON COLUMN sys_dept.deleted_at IS '删除时间';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sys_role' AND column_name = 'deleted_at') THEN
        ALTER TABLE sys_role ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;
        COMMENT ON COLUMN sys_role.deleted_at IS '删除时间';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sys_user' AND column_name = 'deleted_at') THEN
        ALTER TABLE sys_user ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;
        COMMENT ON COLUMN sys_user.deleted_at IS '删除时间';
    END IF;
END $$;

-- 2. 为 deleted_at 字段添加索引
CREATE INDEX IF NOT EXISTS idx_deleted_at ON crm_product(deleted_at);

-- 3. 操作日志表
CREATE TABLE IF NOT EXISTS sys_operation_log (
    id BIGSERIAL PRIMARY KEY,
    user_id INT DEFAULT NULL,
    username VARCHAR(50) DEFAULT NULL,
    module VARCHAR(50) DEFAULT NULL,
    operation VARCHAR(100) DEFAULT NULL,
    method VARCHAR(200) DEFAULT NULL,
    params TEXT,
    result TEXT,
    ip VARCHAR(50) DEFAULT NULL,
    user_agent VARCHAR(500) DEFAULT NULL,
    execution_time INT DEFAULT NULL,
    status BOOLEAN DEFAULT TRUE,
    error_msg TEXT,
    create_time TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE sys_operation_log IS '详细操作日志表';
COMMENT ON COLUMN sys_operation_log.id IS '日志ID';
COMMENT ON COLUMN sys_operation_log.user_id IS '用户ID';
COMMENT ON COLUMN sys_operation_log.username IS '用户名';
COMMENT ON COLUMN sys_operation_log.module IS '模块名称';
COMMENT ON COLUMN sys_operation_log.operation IS '操作类型';
COMMENT ON COLUMN sys_operation_log.method IS '方法名';
COMMENT ON COLUMN sys_operation_log.params IS '请求参数';
COMMENT ON COLUMN sys_operation_log.result IS '返回结果摘要';
COMMENT ON COLUMN sys_operation_log.ip IS '操作IP';
COMMENT ON COLUMN sys_operation_log.user_agent IS '用户代理';
COMMENT ON COLUMN sys_operation_log.execution_time IS '执行时长(ms)';
COMMENT ON COLUMN sys_operation_log.status IS '状态：true成功 false失败';
COMMENT ON COLUMN sys_operation_log.error_msg IS '错误信息';
COMMENT ON COLUMN sys_operation_log.create_time IS '创建时间';

CREATE INDEX IF NOT EXISTS idx_opl_user_id ON sys_operation_log(user_id);
CREATE INDEX IF NOT EXISTS idx_opl_module ON sys_operation_log(module);
CREATE INDEX IF NOT EXISTS idx_opl_create_time ON sys_operation_log(create_time);
CREATE INDEX IF NOT EXISTS idx_opl_status ON sys_operation_log(status);

-- 4. 数据备份记录表
CREATE TABLE IF NOT EXISTS sys_backup_record (
    id SERIAL PRIMARY KEY,
    backup_type VARCHAR(20) DEFAULT 'full' CHECK (backup_type IN ('full', 'incremental')),
    file_name VARCHAR(200) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
    error_msg TEXT,
    create_by INT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE sys_backup_record IS '数据备份记录表';
COMMENT ON COLUMN sys_backup_record.id IS '备份ID';
COMMENT ON COLUMN sys_backup_record.backup_type IS '备份类型';
COMMENT ON COLUMN sys_backup_record.file_name IS '备份文件名';
COMMENT ON COLUMN sys_backup_record.file_path IS '备份文件路径';
COMMENT ON COLUMN sys_backup_record.file_size IS '文件大小(bytes)';
COMMENT ON COLUMN sys_backup_record.status IS '状态';
COMMENT ON COLUMN sys_backup_record.error_msg IS '错误信息';
COMMENT ON COLUMN sys_backup_record.create_by IS '创建人';
COMMENT ON COLUMN sys_backup_record.create_time IS '创建时间';

CREATE INDEX IF NOT EXISTS idx_backup_create_time ON sys_backup_record(create_time);
CREATE INDEX IF NOT EXISTS idx_backup_status ON sys_backup_record(status);

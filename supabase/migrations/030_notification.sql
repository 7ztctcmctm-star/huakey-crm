-- ============================================================
-- 迁移: 通用通知表（审批/催办/到期等）
-- 日期: 2026-05-26
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_notification (
    id SERIAL PRIMARY KEY,
    type VARCHAR(30) NOT NULL,
    title VARCHAR(200) NOT NULL,
    content VARCHAR(500) DEFAULT NULL,
    business_type VARCHAR(30) DEFAULT NULL,
    business_id INT DEFAULT NULL,
    from_user_id INT DEFAULT NULL,
    to_user_id INT DEFAULT NULL,
    to_role_id INT DEFAULT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    create_time TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE crm_notification IS '系统通知表';
COMMENT ON COLUMN crm_notification.id IS '主键ID';
COMMENT ON COLUMN crm_notification.type IS '通知类型: quote_approval, contract_approval, remind, ...';
COMMENT ON COLUMN crm_notification.title IS '通知标题';
COMMENT ON COLUMN crm_notification.content IS '通知内容';
COMMENT ON COLUMN crm_notification.business_type IS '业务类型: quote, contract, ...';
COMMENT ON COLUMN crm_notification.business_id IS '业务记录ID';
COMMENT ON COLUMN crm_notification.from_user_id IS '触发人ID';
COMMENT ON COLUMN crm_notification.to_user_id IS '接收人ID（NULL表示角色组广播）';
COMMENT ON COLUMN crm_notification.to_role_id IS '接收角色ID（当to_user_id为空时按角色广播）';
COMMENT ON COLUMN crm_notification.is_read IS '是否已读';
COMMENT ON COLUMN crm_notification.is_dismissed IS '是否已处理';
COMMENT ON COLUMN crm_notification.create_time IS '创建时间';

CREATE INDEX IF NOT EXISTS idx_to_user ON crm_notification(to_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_to_role ON crm_notification(to_role_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_business ON crm_notification(business_type, business_id);
CREATE INDEX IF NOT EXISTS idx_notif_type ON crm_notification(type);
CREATE INDEX IF NOT EXISTS idx_notif_create_time ON crm_notification(create_time);

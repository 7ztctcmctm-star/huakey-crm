-- ============================================================
-- 迁移: 通用通知表（审批/催办/到期等）
-- 日期: 2026-05-26
-- ============================================================

USE huakey_crm;

CREATE TABLE IF NOT EXISTS crm_notification (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    type VARCHAR(30) NOT NULL COMMENT '通知类型: quote_approval, contract_approval, remind, ...',
    title VARCHAR(200) NOT NULL COMMENT '通知标题',
    content VARCHAR(500) DEFAULT NULL COMMENT '通知内容',
    business_type VARCHAR(30) DEFAULT NULL COMMENT '业务类型: quote, contract, ...',
    business_id INT DEFAULT NULL COMMENT '业务记录ID',
    from_user_id INT DEFAULT NULL COMMENT '触发人ID',
    to_user_id INT DEFAULT NULL COMMENT '接收人ID（NULL表示角色组广播）',
    to_role_id INT DEFAULT NULL COMMENT '接收角色ID（当to_user_id为空时按角色广播）',
    is_read TINYINT DEFAULT 0 COMMENT '是否已读(0未读/1已读)',
    is_dismissed TINYINT DEFAULT 0 COMMENT '是否已处理(0未处理/1已处理)',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    INDEX idx_to_user (to_user_id, is_read),
    INDEX idx_to_role (to_role_id, is_read),
    INDEX idx_business (business_type, business_id),
    INDEX idx_type (type),
    INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统通知表';

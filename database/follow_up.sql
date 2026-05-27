-- 跟进记录表
-- 依赖: crm_customer, crm_contact, sys_user 表已存在

USE huakey_crm;

CREATE TABLE IF NOT EXISTS crm_follow_up (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    contact_id INT DEFAULT NULL COMMENT '联系人ID',
    follow_type VARCHAR(20) DEFAULT '电话' COMMENT '跟进方式（电话/拜访/微信/邮件/其他）',
    content TEXT COMMENT '跟进内容',
    next_time DATETIME DEFAULT NULL COMMENT '下次提醒时间',
    next_content VARCHAR(500) DEFAULT NULL COMMENT '下次计划',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    
    CONSTRAINT fk_follow_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_follow_contact FOREIGN KEY (contact_id) REFERENCES crm_contact(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_follow_user FOREIGN KEY (create_by) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_follow_type CHECK (follow_type IN ('电话','拜访','微信','邮件','其他'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='跟进记录表';

CREATE INDEX idx_follow_customer ON crm_follow_up(customer_id);
CREATE INDEX idx_follow_create_by ON crm_follow_up(create_by);
CREATE INDEX idx_follow_next_time ON crm_follow_up(next_time);
CREATE INDEX idx_follow_create_time ON crm_follow_up(create_time);

-- 示例数据
INSERT INTO crm_follow_up (customer_id, contact_id, follow_type, content, next_time, next_content, create_by) VALUES
(1, 1, '电话', '与张经理电话沟通项目需求，客户对方案很认可，需要下周提供详细报价', '2026-05-16 10:00:00', '发送详细报价方案和产品参数文档', 1),
(1, 2, '拜访', '到华为基地拜访李助理，了解了内部采购流程和决策链', '2026-05-18 14:00:00', '约张经理当面沟通具体项目细节', 1),
(3, 5, '微信', '王经理微信回复说正在内部评估，预计下周给反馈', '2026-05-17 09:00:00', '跟进评估进度，发送产品白皮书', 1),
(5, 7, '电话', '刘经理确认项目可以推进，需要签订保密协议', '2026-05-15 15:00:00', '发送保密协议，安排技术沟通会议', 1),
(2, 3, '邮件', '给李总监发了全年合作框架，对方已收到并标记为重要', '2026-05-20 11:00:00', '约李总监面谈，讨论年度框架协议细节', 1);

DESCRIBE crm_follow_up;

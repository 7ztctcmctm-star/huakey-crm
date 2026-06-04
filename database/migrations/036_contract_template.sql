-- ============================================================
-- 迁移 036: 合同模板
-- 日期: 2026-06-04
-- ============================================================

USE huakey_crm;

CREATE TABLE IF NOT EXISTS crm_contract_template (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT '模板名称',
    amount DECIMAL(15,2) DEFAULT 0.00 COMMENT '默认金额',
    payment_terms VARCHAR(500) DEFAULT NULL COMMENT '付款条款',
    delivery_days INT DEFAULT 30 COMMENT '默认交付天数',
    remark TEXT COMMENT '默认备注',
    sort INT DEFAULT 0 COMMENT '排序',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='合同模板表';

-- 默认模板
INSERT IGNORE INTO crm_contract_template (name, amount, payment_terms, delivery_days, remark, sort) VALUES
('标准供货合同', 0.00, '签订后付30%，货到付70%', 30, '标准供货合同模板', 1),
('年度框架合同', 0.00, '按季度结算', 90, '年度框架合作协议', 2),
('短期项目合同', 0.00, '签订后一次性付清', 15, '短期项目合同模板', 3);

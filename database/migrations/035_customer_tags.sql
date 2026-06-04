-- ============================================================
-- 迁移 035: 客户标签系统
-- 日期: 2026-06-04
-- 说明: 新增标签表和客户-标签关联表
-- ============================================================

USE huakey_crm;

-- 标签表
CREATE TABLE IF NOT EXISTS crm_tag (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(30) NOT NULL COMMENT '标签名称',
    color VARCHAR(7) DEFAULT '#1a56db' COMMENT '标签颜色(hex)',
    sort INT DEFAULT 0 COMMENT '排序',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户标签表';

-- 客户-标签关联表
CREATE TABLE IF NOT EXISTS crm_customer_tag (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    tag_id INT NOT NULL,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_customer_tag (customer_id, tag_id),
    INDEX idx_customer (customer_id),
    INDEX idx_tag (tag_id),
    CONSTRAINT fk_ct_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE,
    CONSTRAINT fk_ct_tag FOREIGN KEY (tag_id) REFERENCES crm_tag(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户标签关联表';

-- 默认标签
INSERT IGNORE INTO crm_tag (name, color, sort) VALUES
('VIP客户', '#dc2626', 1),
('重点客户', '#f97316', 2),
('潜在客户', '#6366f1', 3),
('风险客户', '#6b7280', 4),
('外贸客户', '#2563eb', 5),
('长期合作', '#16a34a', 6);

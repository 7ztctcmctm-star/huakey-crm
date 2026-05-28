-- crm_sales_target 建表（target.js 引用但无建表语句）
-- 日期: 2026-05-28

USE huakey_crm;

CREATE TABLE IF NOT EXISTS crm_sales_target (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    user_id INT NOT NULL COMMENT '销售用户ID',
    year INT NOT NULL COMMENT '目标年份',
    month INT NOT NULL COMMENT '目标月份',
    target_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 COMMENT '目标金额',
    create_by INT DEFAULT NULL COMMENT '创建人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
    UNIQUE KEY uk_user_period (user_id, year, month),
    INDEX idx_user (user_id),
    INDEX idx_period (year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='销售目标表';

SELECT 'crm_sales_target 建表完成' AS result;

USE huakey_crm;

CREATE TABLE IF NOT EXISTS crm_opportunity (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    name VARCHAR(200) NOT NULL COMMENT '商机名称',
    expected_amount DECIMAL(15,2) DEFAULT 0.00 COMMENT '预计金额',
    expected_date DATE DEFAULT NULL COMMENT '预计成交日期',
    stage TINYINT DEFAULT 1 COMMENT '阶段：1询盘 2需求确认 3方案报价 4谈判 5成交 6失败',
    win_rate TINYINT DEFAULT 10 COMMENT '赢单率',
    remark TEXT COMMENT '备注',
    owner_id INT DEFAULT NULL COMMENT '负责人ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',

    CONSTRAINT fk_opp_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_opp_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_opp_stage CHECK (stage BETWEEN 1 AND 6),
    CONSTRAINT chk_opp_win_rate CHECK (win_rate BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商机表';

CREATE INDEX idx_opp_customer ON crm_opportunity(customer_id);
CREATE INDEX idx_opp_owner ON crm_opportunity(owner_id);
CREATE INDEX idx_opp_stage ON crm_opportunity(stage);
CREATE INDEX idx_opp_expected_date ON crm_opportunity(expected_date);

-- 复合索引（高频列表查询）
CREATE INDEX idx_opp_owner_stage_ctime ON crm_opportunity(owner_id, stage, create_time);

INSERT INTO crm_opportunity (customer_id, name, expected_amount, expected_date, stage, win_rate, remark, owner_id) VALUES
(1, '华为5G基站电源采购项目', 5000000.00, '2026-08-15', 3, 60, '客户已完成需求确认，我方已提交方案报价，等待技术评审反馈', 1),
(1, '华为数据中心UPS改造二期', 3200000.00, '2026-09-30', 1, 30, '初步询盘阶段，客户在收集供应商信息，需要跟进技术参数匹配', 1),
(3, '比亚迪充电桩配套电源', 2800000.00, '2026-07-20', 4, 75, '谈判进入最后阶段，客户要求降价5%，需要内部评估利润空间', 1),
(5, '阿里云华北机房配电项目', 6500000.00, '2026-10-01', 2, 40, '需求确认中，下周二安排技术交流会', 1),
(2, '腾讯深圳总部电源升级', 1800000.00, '2026-06-30', 3, 50, '方案已提交，等待客户内部审批流程', 1),
(1, '华为海外基站电源供应', 8000000.00, '2026-12-31', 1, 20, '海外项目初步接触，需要了解出口资质和认证要求', 1),
(4, '京东方洁净车间UPS采购', 1500000.00, '2026-06-15', 5, 90, '合同条款已确认，等待客户盖章回传', 1),
(6, '中芯国际Fab厂配电改造', 4200000.00, '2026-08-01', 2, 50, '需求确认阶段，客户对技术指标要求严格', 1),
(3, '比亚迪储能电站配套', 3500000.00, '2026-11-15', 1, 25, '新业务方向初步沟通', 1),
(5, '阿里云新加坡机房项目', 5000000.00, '2027-03-01', 6, 0, '因价格原因竞标失败，竞争对手报价低15%', 1);

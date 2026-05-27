-- 客户管理数据库表
-- 数据库: huakey_crm

USE huakey_crm;

-- 1. 创建客户表
CREATE TABLE IF NOT EXISTS crm_customer (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    company_name VARCHAR(200) NOT NULL COMMENT '公司名称',
    contact_name VARCHAR(50) DEFAULT NULL COMMENT '联系人姓名',
    phone VARCHAR(20) DEFAULT NULL COMMENT '电话',
    email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
    address VARCHAR(500) DEFAULT NULL COMMENT '地址',
    industry VARCHAR(50) DEFAULT NULL COMMENT '所属行业',
    source VARCHAR(50) DEFAULT NULL COMMENT '客户来源（展会/Facebook/Instagram/LinkedIn/独立站/其他网络渠道/转介绍/电话/其他）',
    level VARCHAR(20) DEFAULT 'C' COMMENT '客户等级（A/B/C/D）',
    owner_id INT DEFAULT NULL COMMENT '负责销售ID',
    status TINYINT DEFAULT 1 COMMENT '状态（1潜在客户/2成交客户/3流失客户）',
    pool_status TINYINT DEFAULT 0 COMMENT '公海状态：0=归属销售 1=在公海',
    protect_until DATETIME DEFAULT NULL COMMENT '认领保护截止时间',
    last_follow_time DATETIME DEFAULT NULL COMMENT '最近跟进时间',
    remark TEXT COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    -- 外键约束
    CONSTRAINT fk_customer_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON DELETE SET NULL ON UPDATE CASCADE,
    
    -- 检查约束
    CONSTRAINT chk_customer_level CHECK (level IN ('A', 'B', 'C', 'D')),
    -- 注意: status 0=已删除, 1=潜在客户, 2=成交客户, 3=流失客户
    -- source CHECK 约束已移除，由应用层校验（来源值已细化为多级分类）
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户表';

-- 2. 创建联系人表
CREATE TABLE IF NOT EXISTS crm_contact (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    customer_id INT NOT NULL COMMENT '客户ID',
    name VARCHAR(50) NOT NULL COMMENT '姓名',
    position VARCHAR(50) DEFAULT NULL COMMENT '职位',
    phone VARCHAR(20) DEFAULT NULL COMMENT '电话',
    email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
    wechat VARCHAR(50) DEFAULT NULL COMMENT '微信',
    is_decision TINYINT DEFAULT 0 COMMENT '是否决策人（1是0否）',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    -- 外键约束
    CONSTRAINT fk_contact_customer FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE CASCADE ON UPDATE CASCADE,
    
    -- 检查约束
    CONSTRAINT chk_contact_is_decision CHECK (is_decision IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='联系人表';

-- 3. 添加索引优化

-- 客户表索引
CREATE INDEX idx_customer_company_name ON crm_customer(company_name);
CREATE INDEX idx_customer_phone ON crm_customer(phone);
CREATE INDEX idx_customer_industry ON crm_customer(industry);
CREATE INDEX idx_customer_source ON crm_customer(source);
CREATE INDEX idx_customer_level ON crm_customer(level);
CREATE INDEX idx_customer_owner_id ON crm_customer(owner_id);
CREATE INDEX idx_customer_status ON crm_customer(status);
CREATE INDEX idx_customer_create_time ON crm_customer(create_time);
CREATE INDEX idx_customer_pool_status ON crm_customer(pool_status);
CREATE INDEX idx_customer_protect_until ON crm_customer(protect_until);
CREATE INDEX idx_customer_last_follow ON crm_customer(last_follow_time);

-- 联系人表索引
CREATE INDEX idx_contact_customer_id ON crm_contact(customer_id);
CREATE INDEX idx_contact_name ON crm_contact(name);
CREATE INDEX idx_contact_phone ON crm_contact(phone);
CREATE INDEX idx_contact_is_decision ON crm_contact(is_decision);

-- 4. 插入示例数据

-- 插入客户数据
INSERT INTO crm_customer (company_name, contact_name, phone, email, address, industry, source, level, owner_id, status, remark) VALUES
('华为技术有限公司', '张经理', '13800138001', 'zhang@huawei.com', '深圳市龙岗区坂田华为基地', '通信设备', '展会', 'A', 1, 2, '重要客户，年采购额500万以上'),
('腾讯科技有限公司', '李总监', '13800138002', 'li@tencent.com', '深圳市南山区科技园', '互联网', 'LinkedIn', 'A', 1, 2, '战略合作伙伴'),
('阿里巴巴网络技术有限公司', '王经理', '13800138003', 'wang@alibaba.com', '杭州市余杭区文一西路', '电子商务', '转介绍', 'A', 2, 2, '电商行业龙头'),
('深圳市大疆创新科技有限公司', '陈总', '13800138004', 'chen@dji.com', '深圳市南山区西丽街道', '无人机', '展会', 'B', 2, 1, '对无人机产品感兴趣'),
('比亚迪股份有限公司', '刘经理', '13800138005', 'liu@byd.com', '深圳市坪山区比亚迪路', '汽车制造', '电话', 'A', 1, 2, '新能源汽车领域合作'),
('小米科技有限公司', '赵总监', '13800138006', 'zhao@xiaomi.com', '北京市海淀区清河中街', '智能硬件', 'Facebook', 'B', 1, 1, '智能家居项目合作'),
('美团点评科技有限公司', '孙经理', '13800138007', 'sun@meituan.com', '北京市朝阳区望京东路', '生活服务', '其他', 'C', 2, 1, '本地生活服务合作'),
('京东集团股份有限公司', '周总监', '13800138008', 'zhou@jd.com', '北京市大兴区亦庄', '电子商务', '转介绍', 'A', 1, 2, '物流仓储合作'),
('网易公司', '吴经理', '13800138009', 'wu@163.com', '广州市天河区科韵路', '互联网', '独立站', 'B', 2, 1, '游戏业务合作'),
('百度在线网络技术有限公司', '郑总监', '13800138010', 'zheng@baidu.com', '北京市海淀区上地', '互联网', '电话', 'A', 1, 2, 'AI技术合作');

-- 插入联系人数据
INSERT INTO crm_contact (customer_id, name, position, phone, email, wechat, is_decision, remark) VALUES
(1, '张经理', '采购经理', '13800138001', 'zhang@huawei.com', 'zhang_manager', 1, '主要决策人'),
(1, '李助理', '采购助理', '13800138011', 'li_assistant@huawei.com', 'li_assistant', 0, '负责日常对接'),
(2, '李总监', '技术总监', '13800138002', 'li@tencent.com', 'li_director', 1, '技术决策人'),
(2, '王工程师', '高级工程师', '13800138012', 'wang_eng@tencent.com', 'wang_eng', 0, '技术对接人'),
(3, '王经理', '运营经理', '13800138003', 'wang@alibaba.com', 'wang_manager', 1, '业务决策人'),
(4, '陈总', '总经理', '13800138004', 'chen@dji.com', 'chen_ceo', 1, '公司创始人'),
(5, '刘经理', '采购经理', '13800138005', 'liu@byd.com', 'liu_manager', 1, '采购决策人'),
(6, '赵总监', '产品总监', '13800138006', 'zhao@xiaomi.com', 'zhao_director', 1, '产品决策人'),
(7, '孙经理', '市场经理', '13800138007', 'sun@meituan.com', 'sun_manager', 0, '市场对接人'),
(8, '周总监', '供应链总监', '13800138008', 'zhou@jd.com', 'zhou_director', 1, '供应链决策人'),
(9, '吴经理', '游戏运营经理', '13800138009', 'wu@163.com', 'wu_manager', 0, '游戏业务对接'),
(10, '郑总监', 'AI实验室主任', '13800138010', 'zheng@baidu.com', 'zheng_director', 1, 'AI技术决策人');

-- 5. 查看表结构
DESCRIBE crm_customer;
DESCRIBE crm_contact;

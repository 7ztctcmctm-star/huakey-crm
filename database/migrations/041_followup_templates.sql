-- 041_followup_templates.sql
-- 跟进模板表

CREATE TABLE IF NOT EXISTS crm_followup_template (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL COMMENT '模板名称',
  type VARCHAR(20) DEFAULT 'general' COMMENT '类型：first首次/quote报价/deal成交/general通用',
  content TEXT NOT NULL COMMENT '模板内容',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_ft_type (type),
  KEY idx_ft_creator (create_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='跟进模板';

-- 预置通用模板
INSERT INTO crm_followup_template (name, type, content) VALUES
('首次电话拜访', 'first', '您好，我是铧旗的{联系人}，今天主要想了解贵司的{需求方向}。请问您目前有在使用类似产品吗？主要关注哪些方面？'),
('报价跟进', 'quote', '您好，上次给您发的报价方案（报价单号：{报价单号}）您看了吗？有什么疑问或需要调整的地方吗？我们可以约个时间详细沟通。'),
('成交感谢', 'deal', '感谢贵司的信任与支持！合同已签署，我们会尽快安排{交付内容}。后续有任何问题随时联系我。'),
('日常回访', 'general', '您好，距离上次沟通已有一段时间，想了解一下贵司目前的{业务方向}进展如何？有什么我们可以协助的吗？');

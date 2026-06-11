-- 044_knowledge_base.sql
-- 知识库模块：产品知识、销售话术、FAQ、文档模板

-- 产品知识库表
CREATE TABLE IF NOT EXISTS crm_knowledge_product (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '产品名称',
  category VARCHAR(50) DEFAULT NULL COMMENT '产品分类',
  model VARCHAR(100) DEFAULT NULL COMMENT '产品型号',
  description TEXT COMMENT '产品描述',
  specs TEXT COMMENT '产品参数(JSON)',
  price DECIMAL(12,2) DEFAULT NULL COMMENT '参考价格',
  images TEXT COMMENT '产品图片(JSON数组)',
  status TINYINT(1) DEFAULT 1 COMMENT '状态：1启用 0停用',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_kp_category (category),
  KEY idx_kp_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品知识库';

-- 销售话术表
CREATE TABLE IF NOT EXISTS crm_knowledge_script (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(100) NOT NULL COMMENT '话术标题',
  scene VARCHAR(50) DEFAULT NULL COMMENT '适用场景',
  content TEXT NOT NULL COMMENT '话术内容',
  sort_order INT DEFAULT 0 COMMENT '排序',
  usage_count INT DEFAULT 0 COMMENT '使用次数',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_ks_scene (scene)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='销售话术';

-- FAQ表
CREATE TABLE IF NOT EXISTS crm_knowledge_faq (
  id INT PRIMARY KEY AUTO_INCREMENT,
  question VARCHAR(200) NOT NULL COMMENT '问题',
  answer TEXT NOT NULL COMMENT '答案',
  category VARCHAR(50) DEFAULT NULL COMMENT '分类',
  view_count INT DEFAULT 0 COMMENT '查看次数',
  sort_order INT DEFAULT 0 COMMENT '排序',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_kf_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='FAQ';

-- 文档模板表
CREATE TABLE IF NOT EXISTS crm_knowledge_document (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '文档名称',
  type VARCHAR(30) NOT NULL COMMENT '文档类型：contract/quote/general',
  description VARCHAR(200) DEFAULT NULL COMMENT '文档说明',
  file_path VARCHAR(500) DEFAULT NULL COMMENT '文件路径',
  file_size INT DEFAULT NULL COMMENT '文件大小(字节)',
  file_type VARCHAR(20) DEFAULT NULL COMMENT '文件类型',
  download_count INT DEFAULT 0 COMMENT '下载次数',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_kd_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文档模板';

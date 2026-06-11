-- ============================================================
-- 迁移 055: 邮件集成
-- 日期: 2026-06-11
-- ============================================================

USE huakey_crm;

-- ============================================================
-- 1. 邮件账号配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_email_account (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '关联用户',
  email VARCHAR(100) NOT NULL COMMENT '邮箱地址',
  display_name VARCHAR(50) COMMENT '发件人显示名称',
  imap_host VARCHAR(100) COMMENT 'IMAP服务器',
  imap_port INT DEFAULT 993 COMMENT 'IMAP端口',
  smtp_host VARCHAR(100) COMMENT 'SMTP服务器',
  smtp_port INT DEFAULT 587 COMMENT 'SMTP端口',
  password_encrypted VARCHAR(200) COMMENT '加密存储的密码/授权码',
  use_ssl TINYINT(1) DEFAULT 1,
  sync_status VARCHAR(20) DEFAULT 'pending' COMMENT '同步状态：pending/syncing/active/error',
  last_sync_at TIMESTAMP NULL COMMENT '上次同步时间',
  status TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ea_user (user_id),
  FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='邮件账号配置表';

-- ============================================================
-- 2. 邮件记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_email (
  id INT PRIMARY KEY AUTO_INCREMENT,
  account_id INT NOT NULL COMMENT '邮件账号ID',
  message_id VARCHAR(200) COMMENT '邮件Message-ID（用于去重）',
  direction VARCHAR(10) NOT NULL COMMENT '方向：in收件/out发件',
  from_address VARCHAR(200) COMMENT '发件人',
  to_addresses TEXT COMMENT '收件人（JSON数组）',
  cc_addresses TEXT COMMENT '抄送（JSON数组）',
  subject VARCHAR(500) COMMENT '邮件主题',
  body_text TEXT COMMENT '纯文本内容',
  body_html TEXT COMMENT 'HTML内容',
  has_attachments TINYINT(1) DEFAULT 0 COMMENT '有附件',
  attachment_count INT DEFAULT 0,
  customer_id INT COMMENT '关联客户',
  contact_id INT COMMENT '关联联系人',
  is_read TINYINT(1) DEFAULT 0 COMMENT '是否已读',
  is_starred TINYINT(1) DEFAULT 0 COMMENT '星标',
  folder VARCHAR(20) DEFAULT 'inbox' COMMENT '文件夹：inbox/sent/draft/trash',
  sent_at TIMESTAMP NULL COMMENT '发送时间',
  received_at TIMESTAMP NULL COMMENT '接收时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_account (account_id),
  INDEX idx_email_customer (customer_id),
  INDEX idx_email_contact (contact_id),
  INDEX idx_email_folder (folder),
  INDEX idx_email_message_id (message_id),
  INDEX idx_email_direction (direction),
  FOREIGN KEY (account_id) REFERENCES crm_email_account(id),
  FOREIGN KEY (customer_id) REFERENCES crm_customer(id),
  FOREIGN KEY (contact_id) REFERENCES crm_contact(id),
  UNIQUE KEY uk_message_id (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='邮件记录表';

-- ============================================================
-- 3. 邮件附件表
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_email_attachment (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email_id INT NOT NULL,
  filename VARCHAR(200) NOT NULL COMMENT '文件名',
  file_path VARCHAR(500) COMMENT '存储路径',
  file_size INT COMMENT '文件大小（字节）',
  mime_type VARCHAR(100) COMMENT 'MIME类型',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ea_email (email_id),
  FOREIGN KEY (email_id) REFERENCES crm_email(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='邮件附件表';

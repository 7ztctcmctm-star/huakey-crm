-- Token黑名单表：登出后将token hash写入此表，防止已登出token继续使用
CREATE TABLE IF NOT EXISTS `sys_token_blacklist` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `token_hash` VARCHAR(64) NOT NULL,
  `user_id` INT DEFAULT NULL,
  `expire_at` DATETIME NOT NULL,
  `reason` VARCHAR(50) DEFAULT 'logout',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_token_hash` (`token_hash`),
  INDEX `idx_expire` (`expire_at`),
  INDEX `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

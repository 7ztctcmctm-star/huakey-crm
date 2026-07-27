-- ============================================================
-- 添加用户首次登录强制改密标记
-- ============================================================

SET @db_name = DATABASE();

-- Step 1: 添加 must_change_password 字段
SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'must_change_password'
    ),
    'SELECT 1',
    'ALTER TABLE sys_user ADD COLUMN must_change_password TINYINT NOT NULL DEFAULT 0 COMMENT "首次登录/重置密码后必须改密(1是0否)"'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: 添加 password_changed_at 字段，记录最近一次改密时间
SET @sql2 = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'password_changed_at'
    ),
    'SELECT 1',
    'ALTER TABLE sys_user ADD COLUMN password_changed_at DATETIME DEFAULT NULL COMMENT "密码最后修改时间"'
  )
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- Step 3: 为已有账号设置 password_changed_at 为当前时间（避免历史账号被误判为首次登录）
UPDATE sys_user SET password_changed_at = NOW() WHERE password_changed_at IS NULL;

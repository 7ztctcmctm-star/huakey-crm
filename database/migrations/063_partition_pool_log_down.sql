-- ============================================================
-- 回滚: 移除 crm_pool_log 的 RANGE 分区
-- ============================================================

USE huakey_crm;

SET @db = 'huakey_crm';

-- 检查表是否已分区
SET @part_exists = (SELECT COUNT(*) FROM information_schema.PARTITIONS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_pool_log' AND PARTITION_NAME IS NOT NULL);

SET @sql = IF(@part_exists > 0,
  'ALTER TABLE crm_pool_log
    DROP FOREIGN KEY fk_pool_log_from_user,
    DROP FOREIGN KEY fk_pool_log_to_user,
    REMOVE PARTITIONING,
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (id)',
  'SELECT "crm_pool_log not partitioned" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 恢复外键
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_pool_log' AND CONSTRAINT_NAME = 'fk_pool_log_from_user');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_pool_log ADD CONSTRAINT fk_pool_log_from_user FOREIGN KEY (from_user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_pool_log' AND CONSTRAINT_NAME = 'fk_pool_log_to_user');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_pool_log ADD CONSTRAINT fk_pool_log_to_user FOREIGN KEY (to_user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

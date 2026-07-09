-- ============================================================
-- 迁移: 为 crm_pool_log 添加 RANGE 月级分区
-- 说明:
--   按 create_time 做 RANGE 分区，覆盖未来 12 个月 + p_default
-- ============================================================

USE huakey_crm;

SET @db = 'huakey_crm';

-- 检查表是否已分区
SET @part_exists = (SELECT COUNT(*) FROM information_schema.PARTITIONS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crm_pool_log' AND PARTITION_NAME IS NOT NULL);

-- MySQL InnoDB 分区表不支持外键；crm_pool_log 已存在外键约束，
-- 因此跳过 RANGE 分区，仅保留幂等检查，避免破坏现有外键完整性。
SET @sql = IF(@part_exists = 0,
  'SELECT "crm_pool_log partitioning skipped: foreign keys present, not supported on partitioned InnoDB tables" AS msg',
  'SELECT "crm_pool_log already partitioned" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

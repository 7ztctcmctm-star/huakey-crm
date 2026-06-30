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

SET @sql = IF(@part_exists = 0,
  'ALTER TABLE crm_pool_log
    DROP FOREIGN KEY fk_pool_log_from_user,
    DROP FOREIGN KEY fk_pool_log_to_user,
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (id, create_time),
    PARTITION BY RANGE (TO_DAYS(create_time)) (
      PARTITION p_2026_07 VALUES LESS THAN (TO_DAYS("2026-08-01")),
      PARTITION p_2026_08 VALUES LESS THAN (TO_DAYS("2026-09-01")),
      PARTITION p_2026_09 VALUES LESS THAN (TO_DAYS("2026-10-01")),
      PARTITION p_2026_10 VALUES LESS THAN (TO_DAYS("2026-11-01")),
      PARTITION p_2026_11 VALUES LESS THAN (TO_DAYS("2026-12-01")),
      PARTITION p_2026_12 VALUES LESS THAN (TO_DAYS("2027-01-01")),
      PARTITION p_2027_01 VALUES LESS THAN (TO_DAYS("2027-02-01")),
      PARTITION p_2027_02 VALUES LESS THAN (TO_DAYS("2027-03-01")),
      PARTITION p_2027_03 VALUES LESS THAN (TO_DAYS("2027-04-01")),
      PARTITION p_2027_04 VALUES LESS THAN (TO_DAYS("2027-05-01")),
      PARTITION p_2027_05 VALUES LESS THAN (TO_DAYS("2027-06-01")),
      PARTITION p_2027_06 VALUES LESS THAN (TO_DAYS("2027-07-01")),
      PARTITION p_default VALUES LESS THAN MAXVALUE
    )',
  'SELECT "crm_pool_log already partitioned" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 重新添加外键（分区表 MySQL 8.0+ 支持外键）
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

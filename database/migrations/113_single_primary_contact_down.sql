-- ============================================================
-- 113 回滚：联系人「单一主联系人」不变量
-- ============================================================
-- 顺序：① 删唯一索引（否则恢复重复主联系人会被拒绝）
--       ② 从备份表把 is_primary 精确恢复为迁移前的值
--       ③ 删除备份表（数据已还原，保留会产生误导）
-- 幂等：索引/备份表不存在时跳过对应步骤。
-- 注意：回滚会**重新引入**每个客户多条主联系人，即恢复迁移前的列表重复行现象——
--       这是回滚的预期结果；如需再次修复，重新执行 113 即可。
-- ============================================================

-- ---------- ① 删除唯一索引 ----------
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact'
    AND INDEX_NAME = 'uk_contact_primary_per_customer');
SET @drop_idx_sql = IF(@idx_exists = 1,
  'ALTER TABLE crm_contact DROP INDEX uk_contact_primary_per_customer',
  'SELECT "索引不存在，跳过" AS msg');
PREPARE drop_idx_stmt FROM @drop_idx_sql;
EXECUTE drop_idx_stmt;
DEALLOCATE PREPARE drop_idx_stmt;

-- ---------- ② 从备份表恢复 is_primary ----------
SET @bak_exists = (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact_primary_backup_113');
SET @restore_sql = IF(@bak_exists = 1,
  'UPDATE crm_contact ct JOIN crm_contact_primary_backup_113 b ON b.contact_id = ct.id SET ct.is_primary = b.is_primary',
  'SELECT "备份表不存在，跳过恢复" AS msg');
PREPARE restore_stmt FROM @restore_sql;
EXECUTE restore_stmt;
DEALLOCATE PREPARE restore_stmt;

-- ---------- ③ 删除备份表 ----------
SET @drop_bak_sql = IF(@bak_exists = 1,
  'DROP TABLE crm_contact_primary_backup_113',
  'SELECT "备份表不存在，跳过删除" AS msg');
PREPARE drop_bak_stmt FROM @drop_bak_sql;
EXECUTE drop_bak_stmt;
DEALLOCATE PREPARE drop_bak_stmt;

SELECT '=== 113 回滚完成 ===' AS info;

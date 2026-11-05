-- 131_normalize_customer_pool_status_down.sql
--
-- 数据归一化迁移不可逆：修改前的 pool_status 错位值无法从现有数据推断或还原。
-- 若确需回滚该列，必须使用迁移前备份（deploy/backup 的 mysqldump）恢复
-- crm_customer.pool_status。此处保留显式说明与空操作，保证回滚链可执行。
SELECT '131 normalize_customer_pool_status: data migration not reversible; restore pool_status from backup if needed' AS rollback_note;

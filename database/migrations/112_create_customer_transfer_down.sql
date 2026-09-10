-- ============================================================
-- 112 (回滚): 删除客户转移申请表与 customer:transfer 权限码
-- ============================================================
-- 回滚顺序与正向相反：
--   1. 撤销 customer:transfer 的角色授权
--   2. 删除 customer:transfer 权限码
--   3. 删除 crm_customer_transfer 表
--
-- ⚠️ 风险提示：删除 crm_customer_transfer 会【永久丢失全部转移申请记录】。
--    该表承载「双方同意制」的流转凭证，回滚前请确认无需留存审计数据。
--    如需保留，请先导出：
--      mysqldump --no-create-info <db> crm_customer_transfer > transfer_backup.sql
--
-- 跨库兼容：不使用 USE 语句，依赖 DATABASE()。
-- ============================================================

-- ============================================================
-- 第一步：撤销角色授权
-- ============================================================
DELETE FROM sys_role_permission
WHERE permission_id = (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'customer:transfer') AS p);

-- ============================================================
-- 第二步：删除权限码
-- ============================================================
DELETE FROM sys_permission WHERE code = 'customer:transfer';

-- ============================================================
-- 第三步：删除表（先删外键，避免残留约束阻塞）
-- ============================================================
DROP TABLE IF EXISTS crm_customer_transfer;

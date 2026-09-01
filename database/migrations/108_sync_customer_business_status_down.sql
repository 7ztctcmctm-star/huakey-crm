-- ============================================================
-- 108_down: 回滚 status / business_status 对账
-- ============================================================
-- 说明：
--   - 本迁移为纯数据修正（无 DDL），回滚不恢复旧值——旧值本身就是
--     漂移错误状态，恢复它没有业务意义；
--   - 本文件保留以满足迁移对（xxx.sql / xxx_down.sql）惯例，
--     仅输出当前分布供复核；
--   - 若确需回退，请从 02:00 MySQL 备份恢复对应行。
--
-- 跨库兼容：不使用 USE 语句，依赖 DATABASE()。
-- ============================================================

-- 复核：当前 status × business_status 分布
SELECT '=== 108_down 复核：status × business_status 分布（无数据回滚）===' AS info;
SELECT status, business_status, COUNT(*) AS cnt
FROM crm_customer
WHERE deleted_at IS NULL
GROUP BY status, business_status
ORDER BY status, business_status;

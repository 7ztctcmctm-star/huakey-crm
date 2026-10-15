-- ============================================================
-- 迁移 122 回滚: 删除幂等键记录表
-- 注意：DROP TABLE IF EXISTS 在 MySQL 8.0 受支持
--       （不受支持的是 DROP COLUMN/INDEX IF EXISTS 这类 MariaDB 语法）
-- 数据影响：仅删除幂等键缓存记录，不影响任何业务表数据
-- ============================================================

USE huakey_crm;

DROP TABLE IF EXISTS crm_idempotency;

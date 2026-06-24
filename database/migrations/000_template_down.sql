-- ============================================================
-- 迁移回滚模板
-- 文件命名规则: NNN_描述_down.sql
-- 与对应的 NNN_描述.sql (正向迁移) 配套使用
-- ============================================================
-- 使用方法:
--   node run_migrations.js --rollback        # 回滚最近一次迁移
--   node run_migrations.js --rollback 061    # 回滚到指定版本（含）
-- ============================================================

-- 示例：回滚 000_template 的改动
-- 按照正向迁移的相反顺序执行

-- 1. 删除索引（如果正向迁移创建了索引）
-- DROP INDEX IF EXISTS idx_xxx ON table_name;

-- 2. 删除字段（如果正向迁移添加了字段）
-- ALTER TABLE table_name DROP COLUMN IF EXISTS column_name;

-- 3. 删除表（如果正向迁移创建了表）
-- DROP TABLE IF EXISTS table_name;

-- 4. 还原数据（如果正向迁移修改了数据）
-- UPDATE table_name SET column_name = 'old_value' WHERE condition;

-- 注意事项:
-- 1. 每个 _down.sql 必须可重复执行（使用 IF EXISTS / IF NOT EXISTS）
-- 2. 回滚操作必须是正向迁移的精确逆操作
-- 3. 不能丢失数据 — 如果无法安全回滚，在注释中说明
-- 4. 回滚 SQL 中禁止使用 DELETE/TRUNCATE（除非有 WHERE 精确条件）

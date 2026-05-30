-- ============================================================
-- 迁移: 基线标记 — 创建迁移追踪表
-- 日期: 2026-05-22
-- 说明: 初始建表脚本（init.sql / business_tables.sql 等）在本迁移之前已执行
--       本迁移仅创建 schema_migrations 追踪表
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    executed_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uk_version UNIQUE (version)
);

COMMENT ON TABLE schema_migrations IS '数据库迁移追踪表';
COMMENT ON COLUMN schema_migrations.id IS '主键ID';
COMMENT ON COLUMN schema_migrations.version IS '迁移版本号，如 001';
COMMENT ON COLUMN schema_migrations.name IS '迁移名称';
COMMENT ON COLUMN schema_migrations.executed_at IS '执行时间';

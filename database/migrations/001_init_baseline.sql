-- ============================================================
-- 迁移: 基线标记 — 创建迁移追踪表
-- 日期: 2026-05-22
-- 说明: 初始建表脚本（init.sql / business_tables.sql 等）在本迁移之前已执行
--       本迁移仅创建 schema_migrations 追踪表
-- ============================================================

USE huakey_crm;

CREATE TABLE IF NOT EXISTS schema_migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    version VARCHAR(50) NOT NULL COMMENT '迁移版本号，如 001',
    name VARCHAR(200) NOT NULL COMMENT '迁移名称',
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '执行时间',
    UNIQUE KEY uk_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据库迁移追踪表';

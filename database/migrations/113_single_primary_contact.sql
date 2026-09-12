-- ============================================================
-- 113: 联系人「每个客户最多一个主联系人」不变量
-- ============================================================
-- 背景（实测 2026-09-11）：
--   历史迁移（deploy/ci-remaining-migrations.sql 中把 crm_customer.contact_name
--   迁成联系人的那段）为每个客户插入一条 is_primary = 1 的联系人，却未先降级既有主联系人，
--   导致 428 个未删客户中 417 个（97%）各有 2 条主联系人（实测客户 11 → 联系人 14 与 529）。
--   而全仓 10 个服务、20 处查询写的是：
--     LEFT JOIN crm_contact pc ON pc.customer_id = c.id AND pc.is_primary = 1 AND pc.deleted_at IS NULL
--   一对多即扇出 → 列表返回重复行：POST /customers/list pageSize=200 实测返回 200 行、
--   去重后仅 103 条，而 total 用 COUNT(DISTINCT c.id)=428 → 行数与总数口径不一致。
--   受影响的不止客户列表：合同 / 收款 / 财务 / 公海 / 审批 / 服务单 / 分析 / 客户详情 同样扇出。
--
-- 处理三步：
--   1) 备份将被降级的行（供 down 脚本精确回滚）
--   2) 每客户保留 id 最小的一条为主联系人，其余降级
--   3) 加唯一索引固化不变量（MySQL 8.0.13+ 函数式索引；NULL 不参与唯一性判断）
--
-- 影响评估：
--   🟡 中。仅 UPDATE 联系人标记 + 一条 DDL；无删数据、无列变更、不改表结构语义。
--   去重后前端「主联系人」显示为该客户最早创建的那条联系人（确定性规则，取 MIN(id)）。
--
-- 回滚：113_single_primary_contact_down.sql（删索引 → 从备份表恢复 is_primary → 删备份表）。
-- 跨库兼容：不使用 USE 语句，依赖 run_migrations.js 连接的默认数据库（DATABASE()）。
-- 幂等：重复执行时第 2 步无匹配行；第 3 步有 information_schema 判断。
-- ============================================================

-- ---------- 第 1 步：备份将被降级的行 ----------
CREATE TABLE IF NOT EXISTS crm_contact_primary_backup_113 (
  contact_id INT NOT NULL,
  customer_id INT NOT NULL,
  is_primary TINYINT(1) NOT NULL,
  backed_up_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='113 迁移前的 is_primary 快照（回滚用）';

INSERT IGNORE INTO crm_contact_primary_backup_113 (contact_id, customer_id, is_primary)
SELECT ct.id, ct.customer_id, ct.is_primary
FROM crm_contact ct
JOIN (
  SELECT customer_id, MIN(id) AS keep_id
  FROM crm_contact
  WHERE is_primary = 1 AND deleted_at IS NULL
  GROUP BY customer_id
  HAVING COUNT(*) > 1
) dup ON dup.customer_id = ct.customer_id AND ct.id <> dup.keep_id
WHERE ct.is_primary = 1 AND ct.deleted_at IS NULL;

-- ---------- 第 2 步：每客户只保留 id 最小的主联系人 ----------
UPDATE crm_contact ct
JOIN (
  SELECT customer_id, MIN(id) AS keep_id
  FROM crm_contact
  WHERE is_primary = 1 AND deleted_at IS NULL
  GROUP BY customer_id
  HAVING COUNT(*) > 1
) dup ON dup.customer_id = ct.customer_id AND ct.id <> dup.keep_id
SET ct.is_primary = 0
WHERE ct.is_primary = 1 AND ct.deleted_at IS NULL;

-- ---------- 第 3 步：唯一索引固化不变量 ----------
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact'
    AND INDEX_NAME = 'uk_contact_primary_per_customer');
SET @add_idx_sql = IF(@idx_exists = 0,
  'ALTER TABLE crm_contact ADD UNIQUE KEY uk_contact_primary_per_customer ((IF(is_primary = 1 AND deleted_at IS NULL, customer_id, NULL)))',
  'SELECT "uk_contact_primary_per_customer 已存在，跳过" AS msg');
PREPARE add_idx_stmt FROM @add_idx_sql;
EXECUTE add_idx_stmt;
DEALLOCATE PREPARE add_idx_stmt;

-- ---------- 验证 ----------
SELECT '=== 113 之后：仍有多主联系人的客户数（应为 0）===' AS info;
SELECT COUNT(*) AS remaining_multi_primary FROM (
  SELECT customer_id FROM crm_contact
  WHERE is_primary = 1 AND deleted_at IS NULL
  GROUP BY customer_id HAVING COUNT(*) > 1
) t;

SELECT '=== 113 之后：唯一索引是否存在（应为 1）===' AS info;
SELECT COUNT(*) AS uk_exists FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact'
  AND INDEX_NAME = 'uk_contact_primary_per_customer';

SELECT '=== 113 备份行数（供回滚，供人工核对）===' AS info;
SELECT COUNT(*) AS backed_up_rows FROM crm_contact_primary_backup_113;

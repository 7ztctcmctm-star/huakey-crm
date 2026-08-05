-- ============================================================
-- 097: 客户中心重构 - 新增 business_status + pool_status 枚举化
-- ============================================================
-- 变更内容：
--   1. 新增 business_status VARCHAR(32) 业务生命周期字段
--      枚举: lead / following / quoted / negotiating / signed / lost
--   2. 修改 pool_status 从 TINYINT(0/1) 改为 VARCHAR(8) 枚举
--      枚举: private(私有) / sea(公海)
--   3. 历史数据迁移：
--      business_status 根据现有 status 派生
--      pool_status: 0→'private', 1→'sea'
--   4. 不删除 status/customer_type/lifecycle_status 等旧字段（兼容）
--
-- 业务语义（重要）：
--   线索池与公海池是两个独立业务概念，不可混淆：
--     线索 = 未分配的潜客（business_status='lead'），pool_status='private'
--     公海 = 曾被跟进后被释放的客户（business_status != 'lead' 且 owner_id IS NULL），pool_status='sea'
--   lead 客户即使 owner_id IS NULL，pool_status 仍为 'private'（不属于公海）
--
-- 安全措施：
--   - 使用 PREPARE/EXECUTE 模式做条件性 DDL（幂等执行）
--   - 数据迁移前先备份关键字段
--   - 迁移后输出统计信息供验证
-- ============================================================

-- ============================================================
-- 步骤 1：备份关键字段到临时表（用于回滚）
-- ============================================================
CREATE TABLE IF NOT EXISTS _migration_097_backup AS
SELECT id, status, customer_type, lifecycle_status, pool_status AS pool_status_old, owner_id
FROM crm_customer
WHERE deleted_at IS NULL;

-- ============================================================
-- 步骤 2：新增 business_status 字段
-- ============================================================
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'business_status');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_customer ADD COLUMN business_status VARCHAR(32) NOT NULL DEFAULT ''lead'' COMMENT ''业务生命周期: lead/following/quoted/negotiating/signed/lost''',
  'SELECT 1 AS business_status_already_exists');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 步骤 3：修改 pool_status 类型 TINYINT → VARCHAR(8)
-- ============================================================
-- 先检查当前类型
SET @is_tinyint = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'pool_status' AND DATA_TYPE = 'tinyint');

-- 如果是 TINYINT，修改为 VARCHAR(8)
-- MySQL 会自动转换数据: 0→'0', 1→'1'
SET @sql = IF(@is_tinyint > 0,
  'ALTER TABLE crm_customer MODIFY COLUMN pool_status VARCHAR(8) NOT NULL DEFAULT ''private'' COMMENT ''资源归属: private=私有 sea=公海''',
  'SELECT 1 AS pool_status_already_varchar');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 步骤 4：数据迁移 - business_status 派生（必须在 pool_status 修复前执行）
-- ============================================================
-- 规则：
--   status='lead' → business_status='lead'
--   status='sea' → business_status='following'（公海客户业务上属于跟进阶段）
--   status='following' → business_status='following'
--   status='quoted' → business_status='quoted'
--   status='negotiating' → business_status='negotiating'
--   status='signed' → business_status='signed'
--   status='lost' → business_status='lost'
--   status='paused' → business_status='following'（暂停跟进归入跟进阶段）
--   其他/NULL → business_status='lead'（默认）

UPDATE crm_customer SET business_status = 'lead' WHERE status = 'lead' AND deleted_at IS NULL;
UPDATE crm_customer SET business_status = 'following' WHERE status IN ('sea', 'following', 'paused') AND deleted_at IS NULL;
UPDATE crm_customer SET business_status = 'quoted' WHERE status = 'quoted' AND deleted_at IS NULL;
UPDATE crm_customer SET business_status = 'negotiating' WHERE status = 'negotiating' AND deleted_at IS NULL;
UPDATE crm_customer SET business_status = 'signed' WHERE status = 'signed' AND deleted_at IS NULL;
UPDATE crm_customer SET business_status = 'lost' WHERE status = 'lost' AND deleted_at IS NULL;

-- 兜底：未匹配的设为 lead
UPDATE crm_customer SET business_status = 'lead'
WHERE business_status NOT IN ('lead', 'following', 'quoted', 'negotiating', 'signed', 'lost') AND deleted_at IS NULL;

-- ============================================================
-- 步骤 5：数据迁移 - pool_status: '0'→'private', '1'→'sea'
-- ============================================================
-- 业务语义：
--   lead 客户（线索）→ pool_status='private'（属于线索池，不属于公海）
--   非 lead 客户 owner_id IS NULL → pool_status='sea'（被释放到公海）
--   非 lead 客户 owner_id IS NOT NULL → pool_status='private'（私有跟进中）
UPDATE crm_customer SET pool_status = 'private' WHERE pool_status = '0' AND deleted_at IS NULL;
UPDATE crm_customer SET pool_status = 'sea' WHERE pool_status = '1' AND deleted_at IS NULL;

-- 修复非 lead 客户的不一致：owner_id IS NULL 但 pool_status='private' 应为 'sea'
-- （仅限非 lead 客户，lead 客户即使 owner_id IS NULL 也保留 'private'）
UPDATE crm_customer SET pool_status = 'sea'
WHERE owner_id IS NULL AND pool_status = 'private'
  AND business_status != 'lead' AND deleted_at IS NULL;

-- 修复反向不一致：owner_id IS NOT NULL 但 pool_status='sea' 的客户应为 'private'
UPDATE crm_customer SET pool_status = 'private'
WHERE owner_id IS NOT NULL AND pool_status = 'sea' AND deleted_at IS NULL;

-- ============================================================
-- 步骤 6：添加索引（加速新字段查询）
-- ============================================================
-- business_status 索引
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_customer_business_status');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_customer_business_status ON crm_customer(business_status, deleted_at)',
  'SELECT 1 AS idx_business_status_exists');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- business_status + pool_status 联合索引（支撑三页面查询）
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND INDEX_NAME = 'idx_customer_biz_pool');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_customer_biz_pool ON crm_customer(business_status, pool_status, owner_id, deleted_at)',
  'SELECT 1 AS idx_biz_pool_exists');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 步骤 7：迁移后数据统计（供验证）
-- ============================================================
SELECT '=== 迁移后 business_status 分布 ===' AS info;
SELECT business_status, COUNT(*) AS cnt FROM crm_customer WHERE deleted_at IS NULL GROUP BY business_status ORDER BY business_status;

SELECT '=== 迁移后 pool_status 分布 ===' AS info;
SELECT pool_status, COUNT(*) AS cnt FROM crm_customer WHERE deleted_at IS NULL GROUP BY pool_status ORDER BY pool_status;

SELECT '=== 迁移后一致性检查 ===' AS info;
SELECT
  SUM(CASE WHEN business_status = 'lead' AND owner_id IS NULL AND pool_status = 'private' THEN 1 ELSE 0 END) AS lead_no_owner_private_ok,
  SUM(CASE WHEN business_status = 'lead' AND owner_id IS NOT NULL AND pool_status = 'private' THEN 1 ELSE 0 END) AS lead_with_owner_private_ok,
  SUM(CASE WHEN business_status != 'lead' AND owner_id IS NULL AND pool_status = 'sea' THEN 1 ELSE 0 END) AS non_lead_no_owner_sea_ok,
  SUM(CASE WHEN business_status != 'lead' AND owner_id IS NOT NULL AND pool_status = 'private' THEN 1 ELSE 0 END) AS non_lead_with_owner_private_ok,
  SUM(CASE WHEN business_status != 'lead' AND owner_id IS NULL AND pool_status = 'private' THEN 1 ELSE 0 END) AS non_lead_no_owner_private_bad,
  SUM(CASE WHEN owner_id IS NOT NULL AND pool_status = 'sea' THEN 1 ELSE 0 END) AS owner_but_sea_bad
FROM crm_customer WHERE deleted_at IS NULL;

SELECT '=== business_status × pool_status 交叉分布 ===' AS info;
SELECT business_status, pool_status, COUNT(*) AS cnt
FROM crm_customer WHERE deleted_at IS NULL
GROUP BY business_status, pool_status ORDER BY business_status, pool_status;

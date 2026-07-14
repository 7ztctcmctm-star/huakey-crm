-- ============================================================
-- 迁移 073: 统一公海池语义
-- 说明:
--   以 owner_id IS NULL 作为公海/待分配唯一标准
--   pool_status 降级为只读缓存标记
-- ============================================================

USE huakey_crm;

-- 1. 修复 owner_id=0 的脏数据，统一视为 NULL
UPDATE crm_customer
SET owner_id = NULL
WHERE owner_id = 0 AND deleted_at IS NULL;

-- 2. 修复 owner_id 不为空但 pool_status=1 的不一致数据
UPDATE crm_customer
SET pool_status = 0
WHERE owner_id IS NOT NULL AND pool_status = 1 AND deleted_at IS NULL;

-- 3. 修复 owner_id 为空但 pool_status=0 的不一致数据
UPDATE crm_customer
SET pool_status = 1
WHERE owner_id IS NULL AND pool_status = 0 AND deleted_at IS NULL;

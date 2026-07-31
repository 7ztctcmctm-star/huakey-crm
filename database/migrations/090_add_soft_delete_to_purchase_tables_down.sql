-- ============================================
-- 回滚: 采购申请表 + 采购比价表删除软删除列
-- 编号: 090_down
-- 说明: 移除 090 正向迁移添加的 deleted_at 列
-- ============================================

-- 1. crm_purchase_request 移除 deleted_at
ALTER TABLE crm_purchase_request DROP COLUMN IF EXISTS deleted_at;

-- 2. crm_purchase_comparison 移除 deleted_at
ALTER TABLE crm_purchase_comparison DROP COLUMN IF EXISTS deleted_at;

-- 3. crm_purchase_comparison_item 移除 deleted_at
ALTER TABLE crm_purchase_comparison_item DROP COLUMN IF EXISTS deleted_at;

-- 售后工单软删除
ALTER TABLE crm_service_order ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

COMMENT ON COLUMN crm_service_order.deleted_at IS '删除时间';

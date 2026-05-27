-- 售后工单软删除
ALTER TABLE crm_service_order ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT '删除时间' AFTER update_time;

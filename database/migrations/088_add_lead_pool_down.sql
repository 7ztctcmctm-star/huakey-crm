-- 088_down: 线索池回滚
-- 将 status='lead' 的客户恢复为 'sea'（公海）
SET @db = DATABASE();
UPDATE crm_customer SET status = 'sea' WHERE status = 'lead' AND deleted_at IS NULL;

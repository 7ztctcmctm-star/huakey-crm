-- 126_backfill_customer_business_status_down.sql
-- 数据回填不可安全逆操作：执行后无法区分「原本就是 lead 的合法行」与「被修正的行」。
-- 如需回退，必须基于执行前备份或审计记录逐条确认，禁止把 business_status 盲目改回 lead
-- （那会把正式客户重新踢回线索池）。此处仅保留占位，保证迁移链有对应回滚文件。
SELECT 1;

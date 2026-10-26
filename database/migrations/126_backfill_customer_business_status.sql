-- 126_backfill_customer_business_status.sql
-- [P0-12 2026-10-23] 存量数据回填：新建/导入客户曾只写 status、不写 business_status，
-- 表默认 'lead' 导致已是正式客户的记录继续落在线索池。
--
-- 只修正「status 明确是正式状态、business_status 仍是 lead」的矛盾行；
-- sea/paused 不在此列（business_status 枚举不含它们，且公海线索可能合法为 lead）。
-- 幂等：重复执行影响 0 行。执行前建议先用同条件 SELECT COUNT(*) 只读核对。

UPDATE crm_customer
   SET business_status = status
 WHERE deleted_at IS NULL
   AND business_status = 'lead'
   AND status IN ('following', 'quoted', 'negotiating', 'signed');

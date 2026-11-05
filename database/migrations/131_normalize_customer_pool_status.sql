-- 131_normalize_customer_pool_status.sql
--
-- [P2-07 2026-10-26] pool_status 与 owner_id 双标准收尾（数据侧）
--
-- 业务事实源已收敛为 owner_id（见 backend/constants/poolStatus.js）：
--   · 线索池   = business_status = 'lead'
--   · 公海池   = owner_id IS NULL 且 business_status != 'lead'
--   · 正式客户 = business_status IN (following/quoted/negotiating/signed) 且 owner_id IS NOT NULL
--
-- pool_status 仅作为兼容列保留。历史行存在错位（本机 423 条无主线索被标 private 是正确的；
-- 但离职交接曾把线索写成 sea、也有非 lead 无主行未写 sea），本迁移按上述语义
-- 把活跃行的兼容列归一，避免仍按 pool_status 读取的旧报表/外部脚本得到相反结论。
--
-- 边界：
--   · 仅处理 deleted_at IS NULL 的活跃行；软删除行不再参与业务判断。
--   · business_status IS NULL 的历史行语义未知，不做推断（保持原值）。
--   · 纯 DML，迁移执行器已用事务包裹；重复执行无副作用（WHERE 已排除目标值）。
--   · 本机验收：执行前后逐行比对（见 fix-ledger P2-07）。

UPDATE crm_customer
   SET pool_status = CASE
         WHEN owner_id IS NOT NULL OR business_status = 'lead' THEN 'private'
         ELSE 'sea'
       END
 WHERE deleted_at IS NULL
   AND business_status IS NOT NULL
   AND (pool_status IS NULL
        OR pool_status <> CASE
             WHEN owner_id IS NOT NULL OR business_status = 'lead' THEN 'private'
             ELSE 'sea'
           END);

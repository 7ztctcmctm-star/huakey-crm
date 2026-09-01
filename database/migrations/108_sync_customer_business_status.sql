-- ============================================================
-- 108: crm_customer.status / business_status 存量对账（NI-3 终局修复）
-- ============================================================
-- 背景：
--   NI-3（docs/crm-v1-known-issues.md）：历史上部分写路径更新 status
--   未同步 business_status，导致两个字段漂移：
--     - legacy 认领（poolService.claimCustomer）：status='following' 但
--       business_status 残留 'lead'，客户卡在线索池、不进正式客户列表
--     - 工作流 update_field 动作改 status 不同步 business_status
--   代码侧同步已随本版本修复（transitionStatus / claim / automation），
--   本迁移修正存量漂移行。
--
-- 对账规则（与 097 派生规则、mapStatusToBusinessStatus 一致）：
--   1. status 为业务阶段（lead/following/quoted/negotiating/signed/lost）
--      → business_status 镜像 status（status 为权威：所有同步写点均
--        同时写两字段，漂移方向必然是 status 前进、business_status 落后）
--   2. status='sea'/'paused' 且 business_status='lead' → 'following'
--      （sea/paused 客户不应停留在线索池；其余 sea/paused 行保留
--        business_status 原值——公海释放保留业务阶段是现行设计行为）
--
-- 影响评估：
--   🟢 低风险。
--   - 仅 UPDATE 数据，无 DDL、无结构变更；
--   - 幂等：修正后 WHERE 条件不再命中，可重复执行；
--   - 不触碰 deleted_at IS NOT NULL 的已删除行。
--
-- 跨库兼容：
--   不使用 USE 语句，依赖 migrate.js 连接的默认数据库（DATABASE()）。
--
-- 验证：
--   迁移后执行文末 SELECT：remaining_drift 应为 0。
-- ============================================================

-- 修正一：status 为业务阶段时，business_status 镜像 status
UPDATE crm_customer
SET business_status = status
WHERE status IN ('lead', 'following', 'quoted', 'negotiating', 'signed', 'lost')
  AND business_status <> status
  AND deleted_at IS NULL;

-- 修正二：status='sea'/'paused' 但 business_status='lead'（sea/paused 客户不应停留在线索池）
UPDATE crm_customer
SET business_status = 'following'
WHERE status IN ('sea', 'paused')
  AND business_status = 'lead'
  AND deleted_at IS NULL;

-- 验证一：剩余不一致行数（应为 0）
SELECT '=== 108 对账后剩余漂移行数（应为 0）===' AS info;
SELECT COUNT(*) AS remaining_drift
FROM crm_customer
WHERE deleted_at IS NULL
  AND (
    (status IN ('lead', 'following', 'quoted', 'negotiating', 'signed', 'lost') AND business_status <> status)
    OR (status IN ('sea', 'paused') AND business_status = 'lead')
  );

-- 验证二：status × business_status 交叉分布（供人工复核）
SELECT '=== 108 对账后 status × business_status 分布 ===' AS info;
SELECT status, business_status, COUNT(*) AS cnt
FROM crm_customer
WHERE deleted_at IS NULL
GROUP BY status, business_status
ORDER BY status, business_status;

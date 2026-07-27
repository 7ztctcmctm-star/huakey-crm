-- 088: 新增线索池 (Lead Pool)
-- 将"线索"从公海中独立出来，两者职责不同：
--   lead (线索池): 新导入/录入、从未被人跟进过的潜在客户，所有人可见，认领无保护期
--   sea  (公海):   被放弃回收的客户，认领有 7 天保护期
-- 修复日期: 2026-07-21

USE huakey_crm;

-- 1. 在状态配置表中加入 lead
INSERT IGNORE INTO sys_customer_status (code, name, sort_order, is_default, is_end, color)
VALUES ('lead', '线索', 0, 0, 0, '#909399');

-- 2. 添加状态流转规则: lead → following (线索被认领)
INSERT IGNORE INTO sys_customer_status_transition (from_code, to_code, require_permission, require_reason)
VALUES ('lead', 'following', 0, 0);

-- 3. 添加流转规则: lead → sea (线索直接释放到公海，跳过跟进)
INSERT IGNORE INTO sys_customer_status_transition (from_code, to_code, require_permission, require_reason)
VALUES ('lead', 'sea', 0, 0);

-- 4. 现有未分配客户(sea + owner_id IS NULL) 归入线索池
--    保留真正在公海的客户（有保护期的、有释放记录的）
UPDATE crm_customer
SET status = 'lead',
    customer_type = 'prospect',
    lifecycle_status = 'new',
    pool_status = 0
WHERE status = 'sea'
  AND owner_id IS NULL
  AND protect_until IS NULL
  AND pool_status = 1;

-- 5. 验证
SELECT '=== 线索池迁移结果 ===' AS step;
SELECT status, COUNT(*) AS count FROM crm_customer GROUP BY status ORDER BY status;

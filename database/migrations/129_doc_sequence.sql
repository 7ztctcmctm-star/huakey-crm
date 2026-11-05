-- ============================================================
-- 迁移 129: 单据编号原子序列（P2-04 合同号并发 1062）
-- 日期: 2026-10-26
-- 风险等级: P2（新增独立序列表；不改任何业务表结构与数据）
--
-- 背景（docs/audit-report-2026-10-23.md P2-04）：
--   contractService.createContract 用 `SELECT COUNT(*)+1` 生成 CON-YYMMDD-NNN，
--   且 `SELECT COUNT(*) ... FOR UPDATE` 对聚合结果不加行锁。并发创建时两个事务
--   读到同一计数 → 后插入者撞 `contract_no` 唯一索引直接 1062，建合同失败。
--
-- 修复：新增 crm_doc_sequence，按「业务:日期」维护单行原子自增。
--   `INSERT ... ON DUPLICATE KEY UPDATE current_value = LAST_INSERT_ID(current_value+1)`
--   在序列行上串行化，并发事务各自拿到不同序号；唯一索引仍作为最终防线。
--   本次仅合同编号接入，发票/对账单等仍沿用旧逻辑，后续可复用本表。
--
-- 初始化：按存量合同最大序号回填各日期序列，避免上线后首个新合同撞历史号。
--   仅识别 `CON-YYMMDD-NNN` 格式；不符合格式的历史编号不参与回填（仍由唯一索引兜底）。
--
-- 执行前只读核对（可选）：
--   SELECT contract_no FROM crm_contract
--    WHERE contract_no NOT REGEXP '^CON-[0-9]{6}-[0-9]+$' LIMIT 20;
-- ============================================================

USE huakey_crm;

CREATE TABLE IF NOT EXISTS `crm_doc_sequence` (
  `seq_key` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '序列键：业务:日期（如 contract:261026）',
  `current_value` int NOT NULL DEFAULT 0 COMMENT '已分配的最大序号',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后分配时间',
  PRIMARY KEY (`seq_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='单据编号原子序列';

-- 按存量合同回填（幂等：已存在则取较大值，绝不回退）
INSERT INTO crm_doc_sequence (seq_key, current_value)
SELECT CONCAT('contract:', SUBSTRING(contract_no, 5, 6)) AS seq_key,
       MAX(CAST(SUBSTRING_INDEX(contract_no, '-', -1) AS UNSIGNED)) AS current_value
  FROM crm_contract
 WHERE contract_no REGEXP '^CON-[0-9]{6}-[0-9]+$'
 GROUP BY CONCAT('contract:', SUBSTRING(contract_no, 5, 6))
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

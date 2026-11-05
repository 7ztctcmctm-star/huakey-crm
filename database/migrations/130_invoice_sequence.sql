-- ============================================================
-- 迁移 130: 发票编号原子序列（P2-06 不再依赖迁移 123 的唯一索引）
-- 日期: 2026-10-26
-- 风险等级: P2（仅向 crm_doc_sequence 写水位；不改业务表）
-- 前置: 必须先执行 129_doc_sequence.sql（本迁移复用该表）
--
-- 背景（docs/audit-report-2026-10-23.md P2-06）：
--   invoiceService.insertInvoiceWithRetry 依赖 crm_invoice.invoice_no 唯一索引
--   把并发/历史空洞冲突暴露成 ER_DUP_ENTRY 再重试；但迁移 123 在生产尚未执行，
--   唯一索引不存在时重试永不触发，而编号仍由「当日最大号 + 1」推算。
--
-- 修复：发票编号改为 crm_doc_sequence 原子自增（key = invoice:YYMMDD），
--   并发事务在序列行上串行取得不同序号，编号正确性不再依赖唯一索引；
--   ER_DUP_ENTRY 重试保留，作为唯一索引存在时的最终防线。
--
-- 初始化：按存量发票最大序号回填各日期水位，避免上线后首个新发票撞历史号。
--   仅识别 `INV-YYMMDD-NNN` 格式；不符合格式的历史编号不参与回填。
-- ============================================================

USE huakey_crm;

-- 幂等：已存在则取较大值，绝不回退
INSERT INTO crm_doc_sequence (seq_key, current_value)
SELECT CONCAT('invoice:', SUBSTRING(invoice_no, 5, 6)) AS seq_key,
       MAX(CAST(SUBSTRING_INDEX(invoice_no, '-', -1) AS UNSIGNED)) AS current_value
  FROM crm_invoice
 WHERE invoice_no REGEXP '^INV-[0-9]{6}-[0-9]+$'
 GROUP BY CONCAT('invoice:', SUBSTRING(invoice_no, 5, 6))
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

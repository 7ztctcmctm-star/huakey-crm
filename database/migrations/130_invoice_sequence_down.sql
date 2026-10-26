-- ============================================================
-- 回滚 130: 删除发票编号水位
--
-- ⚠️ 回滚前必须同步回滚 invoiceService.nextInvoiceNo，否则新发票会因
--    `invoice:YYMMDD` 序列缺失而重新从 001 开始（可能撞号）。
-- 仅删除 invoice: 前缀的水位；contract: 水位由迁移 129 管理，不受影响。
-- ============================================================

USE huakey_crm;

DELETE FROM crm_doc_sequence WHERE seq_key LIKE 'invoice:%';

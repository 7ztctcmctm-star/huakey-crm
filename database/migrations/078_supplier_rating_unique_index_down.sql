-- 078 回滚：删除供应商评分唯一索引

USE huakey_crm;

DROP INDEX IF EXISTS uq_supplier_rating_period ON crm_supplier_rating;

-- 078 回滚：删除供应商评分唯一索引

USE huakey_crm;

-- 兼容不支持 IF EXISTS 的 MySQL 版本，使用条件判断
SET @idx078 = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_supplier_rating' AND INDEX_NAME = 'uq_supplier_rating_period');
SET @sql078 = IF(@idx078 > 0, 'DROP INDEX uq_supplier_rating_period ON crm_supplier_rating', 'SELECT 1');
PREPARE stmt078 FROM @sql078; EXECUTE stmt078; DEALLOCATE PREPARE stmt078;

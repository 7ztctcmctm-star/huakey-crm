-- 检查 crm_customer_score_log 的外键详情
SELECT '=== fk_csl_rule 详情 ===' AS info;
SELECT
  kcu.CONSTRAINT_NAME,
  kcu.TABLE_NAME,
  kcu.COLUMN_NAME,
  kcu.REFERENCED_TABLE_NAME,
  kcu.REFERENCED_COLUMN_NAME,
  rc.DELETE_RULE
FROM information_schema.KEY_COLUMN_USAGE kcu
JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
  ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
  AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
WHERE kcu.TABLE_SCHEMA = 'huakey_crm'
AND kcu.TABLE_NAME = 'crm_customer_score_log';

-- 检查所有引用 crm_customer 的 CASCADE 外键
SELECT '=== 所有引用 crm_customer 的 CASCADE 外键 ===' AS info;
SELECT
  kcu.CONSTRAINT_NAME,
  kcu.TABLE_NAME,
  kcu.COLUMN_NAME,
  rc.DELETE_RULE
FROM information_schema.KEY_COLUMN_USAGE kcu
JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
  ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
  AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
WHERE kcu.TABLE_SCHEMA = 'huakey_crm'
AND kcu.REFERENCED_TABLE_NAME = 'crm_customer'
AND rc.DELETE_RULE = 'CASCADE';

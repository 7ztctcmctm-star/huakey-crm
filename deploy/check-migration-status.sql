-- 检查排序规则和外键状态
-- 1. sys_role.code 排序规则
SELECT '=== sys_role.code ===' AS info;
SELECT COLUMN_NAME, COLLATION_NAME FROM information_schema.columns
WHERE table_schema = 'huakey_crm' AND table_name = 'sys_role' AND column_name = 'code';

-- 2. sys_permission.code 排序规则
SELECT '=== sys_permission.code ===' AS info;
SELECT COLUMN_NAME, COLLATION_NAME FROM information_schema.columns
WHERE table_schema = 'huakey_crm' AND table_name = 'sys_permission' AND column_name = 'code';

-- 3. 数据库默认排序规则
SELECT '=== DB collation ===' AS info;
SELECT DEFAULT_COLLATION_NAME FROM information_schema.schemata WHERE schema_name = 'huakey_crm';

-- 4. crm_customer_score_log.customer_id 是否可为 NULL
SELECT '=== score_log customer_id ===' AS info;
SELECT COLUMN_NAME, IS_NULLABLE, DATA_TYPE FROM information_schema.columns
WHERE table_schema = 'huakey_crm' AND table_name = 'crm_customer_score_log' AND column_name = 'customer_id';

-- 5. 四张表现有的外键
SELECT '=== existing FKs ===' AS info;
SELECT CONSTRAINT_NAME, TABLE_NAME FROM information_schema.table_constraints
WHERE table_schema = 'huakey_crm'
AND table_name IN ('crm_assign_log','crm_follow_up_reminder','crm_customer_tag','crm_customer_score_log')
AND constraint_type = 'FOREIGN KEY';

-- 6. 检查各表 customer_id 是否可为 NULL
SELECT '=== customer_id nullability ===' AS info;
SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE
FROM information_schema.columns
WHERE table_schema = 'huakey_crm'
AND column_name = 'customer_id'
AND table_name IN ('crm_assign_log','crm_follow_up_reminder','crm_customer_tag','crm_customer_score_log');

-- ============================================================
-- 迁移: 回款计划状态完善
-- 日期: 2026-05-25
-- 说明: crm_payment_plan 增加 status/paid_amount/overdue_days + 数据回填
-- ============================================================

USE huakey_crm;

-- 1. 添加 status 列
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'huakey_crm'
  AND TABLE_NAME = 'crm_payment_plan'
  AND COLUMN_NAME = 'status';

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE crm_payment_plan ADD COLUMN status ENUM(''pending'', ''partial'', ''completed'', ''overdue'') DEFAULT ''pending'' COMMENT ''回款状态'' AFTER remark',
  'SELECT ''crm_payment_plan.status already exists'' AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 添加 paid_amount 列
SELECT COUNT(*) INTO @col_exists2
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'huakey_crm'
  AND TABLE_NAME = 'crm_payment_plan'
  AND COLUMN_NAME = 'paid_amount';

SET @sql2 = IF(@col_exists2 = 0,
  'ALTER TABLE crm_payment_plan ADD COLUMN paid_amount DECIMAL(15,2) DEFAULT 0.00 COMMENT ''已回金额'' AFTER status',
  'SELECT ''crm_payment_plan.paid_amount already exists'' AS msg');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 3. 添加 overdue_days 列
SELECT COUNT(*) INTO @col_exists3
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'huakey_crm'
  AND TABLE_NAME = 'crm_payment_plan'
  AND COLUMN_NAME = 'overdue_days';

SET @sql3 = IF(@col_exists3 = 0,
  'ALTER TABLE crm_payment_plan ADD COLUMN overdue_days INT DEFAULT 0 COMMENT ''逾期天数'' AFTER paid_amount',
  'SELECT ''crm_payment_plan.overdue_days already exists'' AS msg');
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- 4. 回填 paid_amount（根据已有回款记录计算）
UPDATE crm_payment_plan pp
SET pp.paid_amount = (
  SELECT COALESCE(SUM(p.pay_amount), 0)
  FROM crm_payment p
  WHERE p.plan_id = pp.id AND p.deleted_at IS NULL
)
WHERE pp.paid_amount = 0;

-- 5. 回填 status
UPDATE crm_payment_plan pp
SET pp.status = CASE
  WHEN pp.paid_amount >= pp.plan_amount THEN 'completed'
  WHEN pp.paid_amount > 0 THEN 'partial'
  WHEN pp.plan_date < CURDATE() THEN 'overdue'
  ELSE 'pending'
END;

-- 6. 回填 overdue_days
UPDATE crm_payment_plan pp
SET pp.overdue_days = CASE
  WHEN pp.status IN ('pending', 'partial') AND pp.plan_date < CURDATE()
  THEN DATEDIFF(CURDATE(), pp.plan_date)
  ELSE 0
END;

-- 7. 迁移版本由 run_migrations.js 统一以文件名注册（内嵌中文自注册破坏 rollback 的 down 文件定位）

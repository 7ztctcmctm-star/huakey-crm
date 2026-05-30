-- ============================================================
-- 迁移: 回款计划状态完善
-- 日期: 2026-05-25
-- 说明: crm_payment_plan 增加 status/paid_amount/overdue_days + 数据回填
-- ============================================================

-- 1. 添加 status 列
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_payment_plan' AND column_name = 'status') THEN
        ALTER TABLE crm_payment_plan ADD COLUMN status VARCHAR(20) DEFAULT 'pending'
            CHECK (status IN ('pending', 'partial', 'completed', 'overdue'));
        COMMENT ON COLUMN crm_payment_plan.status IS '回款状态';
    END IF;
END $$;

-- 2. 添加 paid_amount 列
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_payment_plan' AND column_name = 'paid_amount') THEN
        ALTER TABLE crm_payment_plan ADD COLUMN paid_amount DECIMAL(15,2) DEFAULT 0.00;
        COMMENT ON COLUMN crm_payment_plan.paid_amount IS '已回金额';
    END IF;
END $$;

-- 3. 添加 overdue_days 列
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_payment_plan' AND column_name = 'overdue_days') THEN
        ALTER TABLE crm_payment_plan ADD COLUMN overdue_days INT DEFAULT 0;
        COMMENT ON COLUMN crm_payment_plan.overdue_days IS '逾期天数';
    END IF;
END $$;

-- 4. 回填 paid_amount（根据已有回款记录计算）
UPDATE crm_payment_plan pp
SET paid_amount = (
  SELECT COALESCE(SUM(p.pay_amount), 0)
  FROM crm_payment p
  WHERE p.plan_id = pp.id AND p.deleted_at IS NULL
)
WHERE pp.paid_amount = 0;

-- 5. 回填 status（CURDATE→CURRENT_DATE）
UPDATE crm_payment_plan pp
SET status = CASE
  WHEN pp.paid_amount >= pp.plan_amount THEN 'completed'
  WHEN pp.paid_amount > 0 THEN 'partial'
  WHEN pp.plan_date < CURRENT_DATE THEN 'overdue'
  ELSE 'pending'
END;

-- 6. 回填 overdue_days（DATEDIFF→直接相减）
UPDATE crm_payment_plan pp
SET overdue_days = CASE
  WHEN pp.status IN ('pending', 'partial') AND pp.plan_date < CURRENT_DATE
  THEN (CURRENT_DATE - pp.plan_date)
  ELSE 0
END;

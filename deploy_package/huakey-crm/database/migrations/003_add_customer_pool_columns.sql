-- ============================================================
-- 迁移: 为 crm_customer 补充公海相关字段
-- 说明:
--   pool_status: 0=归属销售 1=在公海
--   protect_until: 认领后的保护截止时间（7天）
--   last_follow_time: 最近跟进时间（用于掉公海判断）
-- ============================================================

USE huakey_crm;

-- 添加公海状态字段
ALTER TABLE crm_customer
  ADD COLUMN IF NOT EXISTS pool_status TINYINT DEFAULT 0 COMMENT '公海状态：0=归属销售 1=在公海',
  ADD COLUMN IF NOT EXISTS protect_until DATETIME DEFAULT NULL COMMENT '认领保护截止时间',
  ADD COLUMN IF NOT EXISTS last_follow_time DATETIME DEFAULT NULL COMMENT '最近跟进时间';

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_customer_pool_status ON crm_customer(pool_status);
CREATE INDEX IF NOT EXISTS idx_customer_protect_until ON crm_customer(protect_until);
CREATE INDEX IF NOT EXISTS idx_customer_last_follow ON crm_customer(last_follow_time);

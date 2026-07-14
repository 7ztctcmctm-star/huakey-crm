-- ============================================
-- 回滚: 统一客户状态机
-- 说明: 将 status 恢复为 tinyint，并删除状态配置表
-- ============================================

-- 1. 恢复 status 字段类型
ALTER TABLE crm_customer MODIFY COLUMN status TINYINT NULL DEFAULT 1;

-- 2. 恢复旧状态值
UPDATE crm_customer SET status = old_status_int WHERE old_status_int IS NOT NULL;

-- 3. 删除备份字段
ALTER TABLE crm_customer DROP COLUMN IF EXISTS old_status_int;

-- 4. 删除状态流转规则表
DROP TABLE IF EXISTS sys_customer_status_transition;

-- 5. 删除客户状态配置表
DROP TABLE IF EXISTS sys_customer_status;

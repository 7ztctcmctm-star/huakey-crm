-- ============================================================
-- 迁移 123 回滚: 撤销「发票号唯一约束 + 关键外键补齐」
-- 日期: 2026-10-19
-- 对应: 123_integrity_constraints.sql
--
-- 约定：MySQL 8.0 **不支持** `DROP INDEX / DROP FOREIGN KEY ... IF EXISTS`
--   （仅 DROP TABLE / DROP DATABASE 等少数语句支持 IF EXISTS），
--   故本文件统一采用「information_schema 判存在 + PREPARE/EXECUTE 条件化 DDL」，
--   命中则 ALTER、未命中则执行空语句 DO 0，保证对未执行/半执行过的库都能幂等回滚。
--
-- 回滚后结构回到 123 之前：
--   · crm_invoice: 唯一键 uk_invoice_no → 普通索引 idx_invoice_no
--   · crm_payment_plan: 去掉 uk_plan_contract_date
--   · 6 条外键全部删除（数据不动，仅撤约束）
-- ============================================================

USE huakey_crm;

SET @db_name = DATABASE();

-- ========== 1. 撤销 6 条外键 ==========

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_up'
    AND CONSTRAINT_NAME = 'fk_followup_opportunity' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE crm_follow_up DROP FOREIGN KEY fk_followup_opportunity', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_opportunity'
    AND CONSTRAINT_NAME = 'fk_opp_source' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE crm_opportunity DROP FOREIGN KEY fk_opp_source', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_payment_reminder'
    AND CONSTRAINT_NAME = 'fk_payremind_contract' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE crm_payment_reminder DROP FOREIGN KEY fk_payremind_contract', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_payment_reminder'
    AND CONSTRAINT_NAME = 'fk_payremind_plan' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE crm_payment_reminder DROP FOREIGN KEY fk_payremind_plan', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- plan_id 原本无索引，ADD CONSTRAINT 时由 InnoDB 自动建同名索引；
-- DROP FOREIGN KEY 不会带走它，需显式撤销，否则 down→up 往返会残留多余索引。
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_payment_reminder' AND INDEX_NAME = 'fk_payremind_plan');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE crm_payment_reminder DROP INDEX fk_payremind_plan', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_invoice'
    AND CONSTRAINT_NAME = 'fk_invoice_contract' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE crm_invoice DROP FOREIGN KEY fk_invoice_contract', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_up_reminder'
    AND CONSTRAINT_NAME = 'fk_reminder_follow_plan' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists > 0, 'ALTER TABLE crm_follow_up_reminder DROP FOREIGN KEY fk_reminder_follow_plan', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== 2. 撤销 crm_payment_plan 唯一键 ==========

SET @uk_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_payment_plan' AND INDEX_NAME = 'uk_plan_contract_date');
SET @sql = IF(@uk_exists > 0, 'ALTER TABLE crm_payment_plan DROP INDEX uk_plan_contract_date', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== 3. 撤销 crm_invoice 唯一键，还原普通索引 idx_invoice_no ==========

SET @uk_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_invoice' AND INDEX_NAME = 'uk_invoice_no');
SET @sql = IF(@uk_exists > 0, 'ALTER TABLE crm_invoice DROP INDEX uk_invoice_no', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @old_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_invoice' AND INDEX_NAME = 'idx_invoice_no');
SET @sql = IF(@old_idx = 0, 'ALTER TABLE crm_invoice ADD KEY idx_invoice_no (invoice_no)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== 4. 清理预检残骸 ==========
-- 若 123_up 曾因「发现重复/孤儿」而中断，诊断表与抛错存储过程会遗留，这里一并收走。
DROP TABLE IF EXISTS crm_integrity_violation;
DROP PROCEDURE IF EXISTS sp_123_fail;

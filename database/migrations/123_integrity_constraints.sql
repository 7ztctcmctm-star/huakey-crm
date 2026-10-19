-- ============================================================
-- 迁移 123: 发票号唯一约束 + 关键外键补齐（P0 数据完整性）
-- 日期: 2026-10-19
-- 风险等级: P0（约束类迁移，会拒绝不合法的新数据；对存量数据只读、不改）
--
-- 背景（2026-10-19 交付前自检实测）
--   ① crm_invoice.invoice_no 只有普通索引 idx_invoice_no，无唯一约束。
--      invoiceService.createInvoice 以 `SELECT COUNT(*)+1` 生成 INV-YYMMDD-NNN，
--      并发/重复提交/网络重试下会产出**重号发票**（财务对账事故）。
--   ② 以下 6 条业务外键缺失，孤儿行无人拦截：
--        crm_follow_up.opportunity_id        → crm_opportunity.id
--        crm_opportunity.source_id           → crm_opportunity_source.id
--        crm_payment_reminder.contract_id    → crm_contract.id
--        crm_payment_reminder.plan_id        → crm_payment_plan.id
--        crm_invoice.contract_id             → crm_contract.id
--        crm_follow_up_reminder.follow_plan_id → crm_follow_plan.id
--   ③ crm_payment_plan(contract_id, plan_date) 无唯一约束，同一合同可建两条同日回款计划。
--
-- 策略：**先体检、后加固**。
--   up 先做 8 项预检（2 项查重 + 6 项查孤儿），任一不通过 ⇒ 迁移失败（SIGNAL），
--   违规明细落入 crm_integrity_violation 表待人工处理，**绝不静默改数据**
--   （不删行、不置空、不改值、不重建编号）。全部通过后才落 DDL。
--
-- 幂等：DDL 全部先查 information_schema，已存在则跳过；诊断表每次运行前清理本版本旧记录。
--
-- 失败后的处理步骤（写给值班同学）：
--   1) SELECT * FROM crm_integrity_violation WHERE migration='123';   -- 看清单
--   2) 人工修数：重复项合并/改号；孤儿行补父记录或置空外键；
--   3) 重跑本迁移 —— 预检通过后会自动 DROP 诊断表（该表仅在预检失败时保留）。
--
-- 权限前置：需 CREATE ROUTINE —— MySQL 8 **不支持 `PREPARE ... FROM 'SIGNAL ...'`
--   （实测 8.0.46 报 ER_PARSE_ERROR / "not supported in the prepared statement protocol"），
--   而顶层 SIGNAL 又无法写 IF 分支，故条件化失败只能借存储过程抛（见下方 sp_123_fail）。
-- ============================================================

USE huakey_crm;

SET @db_name = DATABASE();

-- ========== 0. 预检失败时的「抛错器」 ==========
-- 单语句存储过程：把条件判断留在 SQL 层（IF(...)+PREPARE 拼 CALL / DO 0）。
DROP PROCEDURE IF EXISTS sp_123_fail;
CREATE PROCEDURE sp_123_fail(IN m VARCHAR(128))
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = m;

-- ========== 1. 诊断表：违规清单落库（仅诊断用，非业务数据） ==========
-- 放在最前：CREATE TABLE 属 DDL，会隐式提交 run_migrations.js 开启的外层事务，
-- 因此后续 INSERT 的清单在 SIGNAL 中断 + ROLLBACK 之后仍能留存（本机实测确认）。
CREATE TABLE IF NOT EXISTS crm_integrity_violation (
  id int NOT NULL AUTO_INCREMENT COMMENT '主键',
  migration varchar(16) NOT NULL COMMENT '来源迁移版本',
  check_code varchar(64) NOT NULL COMMENT '检查项编码: DUP_* = 重复, ORPHAN_* = 孤儿',
  object_name varchar(128) NOT NULL COMMENT '被检查对象（表.列 或 外键）',
  row_id int DEFAULT NULL COMMENT '违规行主键',
  row_value varchar(255) DEFAULT NULL COMMENT '违规值（重复键 / 孤儿外键值）',
  detail varchar(500) DEFAULT NULL COMMENT '可读说明（含重复次数与全部 id）',
  found_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发现时间',
  PRIMARY KEY (id),
  KEY idx_iv_migration (migration),
  KEY idx_iv_check (check_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='迁移完整性预检违规清单（诊断用）';

-- 重跑时清掉本版本上一次的旧清单，避免与本次结果混淆
DELETE FROM crm_integrity_violation WHERE migration = '123';

-- ========== 2. 预检 ①：crm_invoice.invoice_no 重复 ==========
INSERT INTO crm_integrity_violation (migration, check_code, object_name, row_id, row_value, detail)
SELECT '123', 'DUP_INVOICE_NO', 'crm_invoice.invoice_no', MIN(id), invoice_no,
       CONCAT('重复 ', COUNT(*), ' 次; id=', GROUP_CONCAT(id ORDER BY id))
  FROM crm_invoice
 GROUP BY invoice_no
 HAVING COUNT(*) > 1;

-- ========== 3. 预检 ②：crm_payment_plan(contract_id, plan_date) 重复 ==========
INSERT INTO crm_integrity_violation (migration, check_code, object_name, row_id, row_value, detail)
SELECT '123', 'DUP_PAYMENT_PLAN', 'crm_payment_plan(contract_id,plan_date)', MIN(id),
       CONCAT('contract_id=', contract_id, ', plan_date=', plan_date),
       CONCAT('重复 ', COUNT(*), ' 次; id=', GROUP_CONCAT(id ORDER BY id))
  FROM crm_payment_plan
 GROUP BY contract_id, plan_date
 HAVING COUNT(*) > 1;

-- ========== 4. 预检 ③~⑧：外键孤儿行（LEFT JOIN 查无父行） ==========

-- ③ crm_follow_up.opportunity_id → crm_opportunity.id
INSERT INTO crm_integrity_violation (migration, check_code, object_name, row_id, row_value, detail)
SELECT '123', 'ORPHAN_FOLLOWUP_OPP', 'crm_follow_up.opportunity_id->crm_opportunity.id',
       f.id, CAST(f.opportunity_id AS CHAR), '跟进记录指向不存在的商机'
  FROM crm_follow_up f
  LEFT JOIN crm_opportunity o ON f.opportunity_id = o.id
 WHERE f.opportunity_id IS NOT NULL AND o.id IS NULL;

-- ④ crm_opportunity.source_id → crm_opportunity_source.id
INSERT INTO crm_integrity_violation (migration, check_code, object_name, row_id, row_value, detail)
SELECT '123', 'ORPHAN_OPP_SOURCE', 'crm_opportunity.source_id->crm_opportunity_source.id',
       o.id, CAST(o.source_id AS CHAR), '商机指向不存在的来源字典'
  FROM crm_opportunity o
  LEFT JOIN crm_opportunity_source s ON o.source_id = s.id
 WHERE o.source_id IS NOT NULL AND s.id IS NULL;

-- ⑤ crm_payment_reminder.contract_id → crm_contract.id
INSERT INTO crm_integrity_violation (migration, check_code, object_name, row_id, row_value, detail)
SELECT '123', 'ORPHAN_PAYREMIND_CONTRACT', 'crm_payment_reminder.contract_id->crm_contract.id',
       r.id, CAST(r.contract_id AS CHAR), '回款提醒指向不存在的合同'
  FROM crm_payment_reminder r
  LEFT JOIN crm_contract c ON r.contract_id = c.id
 WHERE r.contract_id IS NOT NULL AND c.id IS NULL;

-- ⑥ crm_payment_reminder.plan_id → crm_payment_plan.id
INSERT INTO crm_integrity_violation (migration, check_code, object_name, row_id, row_value, detail)
SELECT '123', 'ORPHAN_PAYREMIND_PLAN', 'crm_payment_reminder.plan_id->crm_payment_plan.id',
       r.id, CAST(r.plan_id AS CHAR), '回款提醒指向不存在的回款计划'
  FROM crm_payment_reminder r
  LEFT JOIN crm_payment_plan p ON r.plan_id = p.id
 WHERE r.plan_id IS NOT NULL AND p.id IS NULL;

-- ⑦ crm_invoice.contract_id → crm_contract.id
INSERT INTO crm_integrity_violation (migration, check_code, object_name, row_id, row_value, detail)
SELECT '123', 'ORPHAN_INVOICE_CONTRACT', 'crm_invoice.contract_id->crm_contract.id',
       i.id, CAST(i.contract_id AS CHAR), '发票指向不存在的合同'
  FROM crm_invoice i
  LEFT JOIN crm_contract c ON i.contract_id = c.id
 WHERE i.contract_id IS NOT NULL AND c.id IS NULL;

-- ⑧ crm_follow_up_reminder.follow_plan_id → crm_follow_plan.id
--   参照依据：reminderService.js:25 `LEFT JOIN crm_follow_plan fp ON r.follow_plan_id = fp.id`
INSERT INTO crm_integrity_violation (migration, check_code, object_name, row_id, row_value, detail)
SELECT '123', 'ORPHAN_REMINDER_PLAN', 'crm_follow_up_reminder.follow_plan_id->crm_follow_plan.id',
       r.id, CAST(r.follow_plan_id AS CHAR), '跟进提醒指向不存在的跟进计划'
  FROM crm_follow_up_reminder r
  LEFT JOIN crm_follow_plan p ON r.follow_plan_id = p.id
 WHERE r.follow_plan_id IS NOT NULL AND p.id IS NULL;

-- ========== 5. 判定：有违规即失败（输出清单位置，明细查表） ==========
SET @v_total = (SELECT COUNT(*) FROM crm_integrity_violation WHERE migration = '123');
SET @v_dup = (SELECT COUNT(*) FROM crm_integrity_violation WHERE migration = '123' AND check_code LIKE 'DUP\_%');
SET @v_orphan = (SELECT COUNT(*) FROM crm_integrity_violation WHERE migration = '123' AND check_code LIKE 'ORPHAN\_%');
SET @v_msg = CONCAT('[123] 预检失败: 共 ', @v_total, ' 组违规(重复 ', @v_dup, '/孤儿 ', @v_orphan, ')，明细见 crm_integrity_violation');
SET @sql = IF(@v_total > 0, CONCAT('CALL sp_123_fail(', QUOTE(@v_msg), ')'), 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== 6. 体检通过 ⇒ 落 DDL：唯一约束 ==========

-- ① crm_invoice.invoice_no 唯一（先卸掉普通索引 idx_invoice_no，避免同列冗余索引）
SET @old_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_invoice' AND INDEX_NAME = 'idx_invoice_no');
SET @sql = IF(@old_idx > 0, 'ALTER TABLE crm_invoice DROP INDEX idx_invoice_no', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @uk_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_invoice' AND INDEX_NAME = 'uk_invoice_no');
SET @sql = IF(@uk_exists = 0, 'ALTER TABLE crm_invoice ADD UNIQUE KEY uk_invoice_no (invoice_no)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ② crm_payment_plan(contract_id, plan_date) 唯一
--    注：两表均为软删除（deleted_at），本唯一键**含软删行**——
--    即已软删的发票号/计划不可被复用。这是刻意选择：MySQL 无部分索引，
--    若把 deleted_at 放进唯一键，多行 NULL 在唯一索引中互不冲突 ⇒ 约束形同虚设。
SET @uk_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_payment_plan' AND INDEX_NAME = 'uk_plan_contract_date');
SET @sql = IF(@uk_exists = 0,
  'ALTER TABLE crm_payment_plan ADD UNIQUE KEY uk_plan_contract_date (contract_id, plan_date)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== 7. 体检通过 ⇒ 落 DDL：6 条外键 ==========
-- 删除语义：业务主表（合同/商机）硬删时级联或置空，均为 int 列、父表主键已索引。

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_up'
    AND CONSTRAINT_NAME = 'fk_followup_opportunity' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_follow_up ADD CONSTRAINT fk_followup_opportunity FOREIGN KEY (opportunity_id) REFERENCES crm_opportunity(id) ON DELETE SET NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_opportunity'
    AND CONSTRAINT_NAME = 'fk_opp_source' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_opportunity ADD CONSTRAINT fk_opp_source FOREIGN KEY (source_id) REFERENCES crm_opportunity_source(id) ON DELETE SET NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_payment_reminder'
    AND CONSTRAINT_NAME = 'fk_payremind_contract' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_payment_reminder ADD CONSTRAINT fk_payremind_contract FOREIGN KEY (contract_id) REFERENCES crm_contract(id) ON DELETE CASCADE',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_payment_reminder'
    AND CONSTRAINT_NAME = 'fk_payremind_plan' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_payment_reminder ADD CONSTRAINT fk_payremind_plan FOREIGN KEY (plan_id) REFERENCES crm_payment_plan(id) ON DELETE SET NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_invoice'
    AND CONSTRAINT_NAME = 'fk_invoice_contract' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_invoice ADD CONSTRAINT fk_invoice_contract FOREIGN KEY (contract_id) REFERENCES crm_contract(id) ON DELETE CASCADE',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_follow_up_reminder'
    AND CONSTRAINT_NAME = 'fk_reminder_follow_plan' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE crm_follow_up_reminder ADD CONSTRAINT fk_reminder_follow_plan FOREIGN KEY (follow_plan_id) REFERENCES crm_follow_plan(id) ON DELETE SET NULL',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== 8. 收尾：拆抛错器 + 清诊断表 ==========
-- 预检通过即无清单可看，诊断表不留残骸（下次预检失败时会按需重建）。
DROP PROCEDURE IF EXISTS sp_123_fail;
DROP TABLE IF EXISTS crm_integrity_violation;

-- ============================================================
-- 回滚: 统一客户状态机
-- 说明: 将 status 恢复为 tinyint，并删除状态配置表
-- ============================================================

-- ⚠️⚠️ 2026-10-15 修复（2026-10-14 上线前审计实测发现）：
-- 旧脚本顺序颠倒 —— 先 `ALTER ... MODIFY COLUMN status TINYINT` 再恢复旧值。
-- 070 up 已把 status 改成 VARCHAR(32) 并存 'sea'/'following' 等枚举串，
-- ALTER 时 MySQL 严格模式直接报 `Incorrect integer value: 'sea' for column 'status'`
-- ⇒ run_migrations exit 1 ⇒ 回滚链中断在 070。
-- 该缺陷长期不可见的原因：① 070 的记账行 name 无 .sql 后缀，旧查找逻辑根本找不到
-- 本文件（version 前缀匹配修复后才暴露）；② CI 的基线库无业务数据，ALTER 不撞值。
-- 本库（demo 种子 400+ 客户）一滚即炸。
--
-- 另修覆盖缺口：070 up 的 old_status_int 只备份「当时未删除」的行，
-- 之后新建/软删的行没有备份值，旧脚本对它们毫无兜底 ⇒ 必须按枚举语义反推旧整数编码
-- （070 up 正向映射：1/5→following、2→signed、3→lost、pool_status=1→sea；
--  反推：signed→2、lost→3、其余（含 sea/following/quoted/negotiating/paused）→1）。

-- 1. 先把字符串状态全部转回整数（必须在 ALTER 之前！）
-- 1a. 有备份列的库：恢复备份值
SET @has_old_status = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_customer' AND COLUMN_NAME = 'old_status_int');
SET @restore_sql = IF(@has_old_status > 0,
  'UPDATE crm_customer SET status = old_status_int WHERE old_status_int IS NOT NULL',
  'SELECT 1');
PREPARE restore_stmt FROM @restore_sql; EXECUTE restore_stmt; DEALLOCATE PREPARE restore_stmt;

-- 1b. 无备份值的行（070 之后新建/软删）：按枚举语义反推旧整数编码
SET @map_back_sql = IF(@has_old_status > 0,
  'UPDATE crm_customer SET status = CASE status WHEN ''signed'' THEN 2 WHEN ''lost'' THEN 3 ELSE 1 END WHERE old_status_int IS NULL AND (status IS NULL OR status NOT REGEXP ''^[0-9]+$'')',
  'UPDATE crm_customer SET status = CASE status WHEN ''signed'' THEN 2 WHEN ''lost'' THEN 3 ELSE 1 END WHERE status IS NULL OR status NOT REGEXP ''^[0-9]+$''');
PREPARE map_back_stmt FROM @map_back_sql; EXECUTE map_back_stmt; DEALLOCATE PREPARE map_back_stmt;

-- 2. 恢复 status 字段类型（此时所有值已是整数或数字串，严格模式可安全转换）
ALTER TABLE crm_customer MODIFY COLUMN status TINYINT NULL DEFAULT 1;

-- 3. 删除备份字段（兼容不支持 IF EXISTS 的 MySQL 版本）
SET @drop_sql = IF(@has_old_status > 0,
  'ALTER TABLE crm_customer DROP COLUMN old_status_int',
  'SELECT 1');
PREPARE drop_stmt FROM @drop_sql; EXECUTE drop_stmt; DEALLOCATE PREPARE drop_stmt;

-- 4. 删除状态流转规则表
DROP TABLE IF EXISTS sys_customer_status_transition;

-- 5. 删除客户状态配置表
DROP TABLE IF EXISTS sys_customer_status;

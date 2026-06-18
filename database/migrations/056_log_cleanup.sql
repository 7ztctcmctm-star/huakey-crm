-- 056: sys_log 归档清理
-- 保留最近30天日志，归档更早的到 sys_log_archive
-- 创建定时事件每月自动执行

-- 1. 创建归档表（结构与 sys_log 相同）
CREATE TABLE IF NOT EXISTS sys_log_archive LIKE sys_log;

-- 2. 归档30天前的日志
INSERT INTO sys_log_archive
SELECT * FROM sys_log WHERE create_time < DATE_SUB(NOW(), INTERVAL 30 DAY);

-- 3. 删除已归档的日志
DELETE FROM sys_log WHERE create_time < DATE_SUB(NOW(), INTERVAL 30 DAY);

-- 4. 添加定时清理事件（每月1日凌晨3点执行）
DROP EVENT IF EXISTS evt_archive_sys_log;
CREATE EVENT evt_archive_sys_log
ON SCHEDULE EVERY 1 MONTH
STARTS CURRENT_TIMESTAMP + INTERVAL 1 MONTH
DO
BEGIN
  INSERT INTO sys_log_archive SELECT * FROM sys_log WHERE create_time < DATE_SUB(NOW(), INTERVAL 30 DAY);
  DELETE FROM sys_log WHERE create_time < DATE_SUB(NOW(), INTERVAL 30 DAY);
END;

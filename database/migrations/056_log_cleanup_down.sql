-- Down script for 056_log_cleanup.sql
USE huakey_crm;

-- 删除定时归档事件
DROP EVENT IF EXISTS evt_archive_sys_log;

-- 删除归档表
DROP TABLE IF EXISTS sys_log_archive;
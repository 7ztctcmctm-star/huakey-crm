-- 082: 清理测试账号 (验收测试 DB-003)
-- 删除测试用途的用户账号

USE huakey_crm;

-- 查找并删除测试账号
DELETE FROM sys_user WHERE username LIKE '%test%' OR username LIKE '%demo%';

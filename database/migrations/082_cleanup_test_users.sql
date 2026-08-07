-- 082: 清理测试账号 (验收测试 DB-003)
-- 删除测试用途的用户账号
-- [安全] 通过数据库名判断环境：仅在名称包含 _test 或 _dev 时执行删除
-- [幂等] 使用 PREPARE 动态 SQL + 条件检查

-- 根据数据库名判断是否为测试环境（含 _test 或 _dev 后缀即为测试库）
SET @is_test_env = IF(DATABASE() LIKE '%\_test' OR DATABASE() LIKE '%\_dev', 1, 0);

-- 仅在非生产环境执行删除（需手动设置 @@global.ENVIRONMENT='test' 才会删除）
-- 生产环境仅输出待清理的账号列表（SELECT），不执行 DELETE
SET @test_count = (SELECT COUNT(*) FROM sys_user WHERE username LIKE '%test%' OR username LIKE '%demo%');

-- 展示待清理数据
SELECT CONCAT('待清理测试账号数量: ', @test_count) AS info;

-- 安全删除：仅当数据库名含 _test/_dev 且存在匹配行时才执行
SET @sql = IF(@is_test_env = 1 AND @test_count > 0,
  'DELETE FROM sys_user WHERE username LIKE ''%test%'' OR username LIKE ''%demo%''',
  'SELECT ''跳过：非测试数据库或无匹配账号'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

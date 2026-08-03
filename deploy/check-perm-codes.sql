-- 检查权限码格式
SET NAMES utf8mb4;
USE huakey_crm;

-- 检查 dashboard 权限码的实际格式
SELECT '=== dashboard 相关权限 ===' AS info;
SELECT id, code, name, type FROM sys_permission WHERE code LIKE '%dashboard%';

-- 检查 reminder 权限码
SELECT '=== reminder 相关权限 ===' AS info;
SELECT id, code, name, type FROM sys_permission WHERE code LIKE '%reminder%';

-- 检查 tag 权限码
SELECT '=== tag 相关权限 ===' AS info;
SELECT id, code, name, type FROM sys_permission WHERE code LIKE '%tag%' AND code NOT LIKE '%target%';

-- 检查 leads 权限码
SELECT '=== leads 相关权限 ===' AS info;
SELECT id, code, name, type FROM sys_permission WHERE code LIKE '%leads%';

-- 检查 search 权限码
SELECT '=== search 相关权限 ===' AS info;
SELECT id, code, name, type FROM sys_permission WHERE code LIKE '%search%';

-- 统计权限码前缀分布
SELECT '=== 权限码前缀分布 ===' AS info;
SELECT
  CASE
    WHEN code LIKE 'menu:%' THEN 'menu: prefix'
    WHEN code LIKE 'button:%' THEN 'button: prefix'
    ELSE 'no prefix'
  END AS prefix_type,
  COUNT(*) AS cnt
FROM sys_permission
GROUP BY prefix_type;

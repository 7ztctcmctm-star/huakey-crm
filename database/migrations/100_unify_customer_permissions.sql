-- ============================================================
-- 100: 客户中心权限码统一 - 删除旧码 customer:pool
-- ============================================================
-- 变更内容：
--   1. 删除旧权限码 customer:pool（098 已映射到 pool:view + pool:claim）
--   2. 清理 sys_role_permission 中 customer:pool 的关联记录
--   3. 清理 sys_permission 中 customer:pool 的定义记录
--
-- 背景：
--   098 引入了新权限码 pool:view / pool:claim / customer:release
--   并做了 customer:pool → pool:view + pool:claim 的兼容映射
--   本次迁移彻底删除旧码，完成权限码统一
--
-- 安全措施：
--   - 删除前再次保险映射（幂等），确保拥有 customer:pool 的角色已获得新码
--   - 使用 DELETE 而非 DROP，仅清理数据
-- ============================================================

USE huakey_crm;

-- ============================================================
-- 第一步：保险映射 - 确保拥有 customer:pool 的角色已获得新权限码
-- ============================================================
-- 098 已做过此映射，此处为幂等兜底，防止遗漏

INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'customer:pool'
JOIN sys_permission p_dst ON p_dst.code IN ('pool:view', 'pool:claim', 'customer:release')
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);

-- ============================================================
-- 第二步：删除 sys_role_permission 中 customer:pool 的关联
-- ============================================================

DELETE rp FROM sys_role_permission rp
JOIN sys_permission p ON rp.permission_id = p.id
WHERE p.code = 'customer:pool';

-- ============================================================
-- 第三步：删除 sys_permission 中 customer:pool 定义
-- ============================================================

DELETE FROM sys_permission WHERE code = 'customer:pool';

-- ============================================================
-- 第四步：验证
-- ============================================================

SELECT '=== 验证：customer:pool 应已删除 ===' AS info;
SELECT COUNT(*) AS remaining_customer_pool FROM sys_permission WHERE code = 'customer:pool';

SELECT '=== 验证：新权限码存在 ===' AS info;
SELECT code, name FROM sys_permission
WHERE code IN ('pool:view', 'pool:claim', 'customer:release')
ORDER BY code;

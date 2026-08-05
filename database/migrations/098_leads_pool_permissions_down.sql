-- ============================================================
-- 098 回滚: 移除 leads/pool 独立权限码 + 角色权限分配
-- ============================================================
-- 注意：
--   1. 仅移除 098 新增的权限码和角色权限分配
--   2. 不移除兼容映射产生的关系（customer:list → leads:view 等），
--      因为这些关系依赖的 leads:view 等权限码会被本回滚删除，
--      sys_role_permission 的外键 ON DELETE CASCADE 会自动清理
--   3. 旧权限码 customer:list / customer:pool / customer:view 保留不受影响
-- ============================================================

USE huakey_crm;

-- ============================================================
-- 第一步：移除角色权限分配（098 第六/七步新增的）
-- ============================================================
-- 由于 sys_role_permission.permission_id 有 ON DELETE CASCADE 外键，
-- 删除 sys_permission 记录会自动清理 sys_role_permission 中的关联，
-- 但为清晰起见，显式删除一遍。

DELETE rp FROM sys_role_permission rp
JOIN sys_permission p ON rp.permission_id = p.id
WHERE p.code IN (
  'leads:view', 'leads:create', 'leads:claim', 'leads:convert', 'leads:release',
  'pool', 'pool:view', 'pool:claim', 'pool:assign',
  'customer:release', 'customer:assign', 'customer:manage'
);

-- ============================================================
-- 第二步：移除 098 新增的权限码
-- ============================================================
-- 注意：不删除 'leads' 菜单父级（086 迁移已存在，098 只是兜底确保）
-- 仅删除 098 新创建的权限码

DELETE FROM sys_permission
WHERE code IN (
  -- leads 子权限（098 新增）
  'leads:view', 'leads:create', 'leads:claim', 'leads:convert', 'leads:release',
  -- pool 菜单父级 + 子权限（098 新增）
  'pool', 'pool:view', 'pool:claim', 'pool:assign',
  -- customer 操作权限（098 新增）
  'customer:release', 'customer:assign', 'customer:manage'
);

-- ============================================================
-- 第三步：验证回滚结果
-- ============================================================

SELECT '=== 回滚后权限码检查（应为空）===' AS info;
SELECT code, name FROM sys_permission
WHERE code IN (
  'leads:view', 'leads:create', 'leads:claim', 'leads:convert', 'leads:release',
  'pool', 'pool:view', 'pool:claim', 'pool:assign',
  'customer:release', 'customer:assign', 'customer:manage'
);

SELECT '=== 回滚后旧权限码检查（应保留）===' AS info;
SELECT code, name FROM sys_permission
WHERE code IN ('customer:list', 'customer:pool', 'customer:view', 'leads')
ORDER BY code;

-- ============================================================
-- 098: 客户中心 Phase 4 - 新增 leads/pool 独立权限码 + 三角色权限分配
-- ============================================================
-- 变更内容：
--   1. 新增 leads 模块子权限码（leads:view/create/claim/convert/release）
--   2. 新增 pool 模块菜单父级 + 子权限码（pool:view/claim/assign）
--   3. 新增 customer 模块操作权限码（customer:release/assign/manage）
--   4. 为 sales(销售) 分配：线索录入/认领/转化 + 客户查看/编辑 + 公海查看/认领
--   5. 为 manager(主管) 分配：全部 leads/pool/customer 权限（含释放/分配/高级管理）
--   6. boss(管理员) 因 manage_all=1 自动绕过权限检查，无需显式分配
--
-- 权限矩阵：
--   | 权限码            | 销售 | 主管 | 管理员(自动) |
--   |-------------------|------|------|--------------|
--   | leads:view        |  ✓   |  ✓   |      ✓       |
--   | leads:create      |  ✓   |  ✓   |      ✓       |
--   | leads:claim       |  ✓   |  ✓   |      ✓       |
--   | leads:convert     |  ✓   |  ✓   |      ✓       |
--   | leads:release     |  ✗   |  ✓   |      ✓       |
--   | customer:view     |  ✓   |  ✓   |      ✓       |
--   | customer:add      |  ✓   |  ✓   |      ✓       |
--   | customer:edit     |  ✓   |  ✓   |      ✓       |
--   | customer:release  |  ✗   |  ✓   |      ✓       |
--   | customer:assign   |  ✗   |  ✓   |      ✓       |
--   | customer:manage   |  ✗   |  ✓   |      ✓       |
--   | pool:view         |  ✓   |  ✓   |      ✓       |
--   | pool:claim        |  ✓   |  ✓   |      ✓       |
--   | pool:assign       |  ✗   |  ✓   |      ✓       |
--
-- 兼容策略：
--   - 保留旧权限码 customer:list / customer:pool（不删除，避免破坏现有路由）
--   - 新权限码与旧码并存，前端逐步切换到新码
--   - 拥有旧码 customer:list 的角色自动获得 leads:view + customer:view
--   - 拥有旧码 customer:pool 的角色自动获得 pool:view + pool:claim
--
-- 安全措施：
--   - 全部使用 INSERT ... WHERE NOT EXISTS 模式（幂等执行）
--   - 角色权限分配基于 role.code 动态查询（不硬编码 role_id）
-- ============================================================

USE huakey_crm;

-- ============================================================
-- 第一步：确保 leads / pool 菜单父级权限存在
-- ============================================================

-- 1a. leads 菜单父级（086 已分配给 sales，应已存在，此处兜底）
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '潜客池', 'leads', 'menu', 0, 11, 1
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'leads');

-- 1b. pool 菜单父级（新增）
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '公海池', 'pool', 'menu', 0, 12, 1
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'pool');


-- ============================================================
-- 第二步：新增 leads 模块子权限码
-- ============================================================

-- leads:view - 查看线索列表
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '查看线索', 'leads:view', 'api',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'leads') AS p),
       1, 0
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'leads:view');

-- leads:create - 录入线索
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '录入线索', 'leads:create', 'api',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'leads') AS p),
       2, 0
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'leads:create');

-- leads:claim - 认领线索（lead → following）
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '认领线索', 'leads:claim', 'api',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'leads') AS p),
       3, 0
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'leads:claim');

-- leads:convert - 转化为客户（lead → following + customer_type=customer）
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '转化为客户', 'leads:convert', 'api',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'leads') AS p),
       4, 0
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'leads:convert');

-- leads:release - 释放线索到公海（lead → sea）
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '释放线索', 'leads:release', 'api',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'leads') AS p),
       5, 0
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'leads:release');


-- ============================================================
-- 第三步：新增 pool 模块子权限码
-- ============================================================

-- pool:view - 查看公海列表
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '查看公海', 'pool:view', 'api',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'pool') AS p),
       1, 0
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'pool:view');

-- pool:claim - 认领公海客户（sea → following，7天保护期）
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '认领公海客户', 'pool:claim', 'api',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'pool') AS p),
       2, 0
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'pool:claim');

-- pool:assign - 管理员分配公海客户
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '分配公海客户', 'pool:assign', 'api',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'pool') AS p),
       3, 0
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'pool:assign');


-- ============================================================
-- 第四步：新增 customer 模块操作权限码
-- ============================================================

-- customer:release - 释放客户到公海（following → sea）
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '释放到公海', 'customer:release', 'api',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'customer') AS p),
       8, 0
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'customer:release');

-- customer:assign - 分配负责人
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '分配负责人', 'customer:assign', 'api',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'customer') AS p),
       9, 0
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'customer:assign');

-- customer:manage - 高级管理（激活流失客户/退回签约客户）
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '高级管理', 'customer:manage', 'api',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'customer') AS p),
       10, 0
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'customer:manage');


-- ============================================================
-- 第五步：兼容映射 - 旧权限码 → 新权限码
-- ============================================================
-- 拥有 customer:list 的角色自动获得 leads:view + customer:view
-- 拥有 customer:pool 的角色自动获得 pool:view + pool:claim

-- 5a. customer:list → leads:view + customer:view
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'customer:list'
JOIN sys_permission p_dst ON p_dst.code IN ('leads:view', 'customer:view')
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);

-- 5b. customer:pool → pool:view + pool:claim
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_dst.id
FROM sys_role_permission rp
JOIN sys_permission p_src ON rp.permission_id = p_src.id AND p_src.code = 'customer:pool'
JOIN sys_permission p_dst ON p_dst.code IN ('pool:view', 'pool:claim')
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role_permission rp2
  WHERE rp2.role_id = rp.role_id AND rp2.permission_id = p_dst.id
);


-- ============================================================
-- 第六步：sales(销售) 角色权限分配
-- ============================================================
-- 销售：可录入/认领线索、查看编辑自己客户、认领公海
--   不可：释放客户、分配客户、高级管理、分配公海

INSERT INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
CROSS JOIN sys_permission p
WHERE r.code = 'sales'
  AND p.code IN (
    -- 线索模块（录入/认领/转化，不含释放）
    'leads', 'leads:view', 'leads:create', 'leads:claim', 'leads:convert',
    -- 公海模块（查看/认领，不含分配）
    'pool', 'pool:view', 'pool:claim'
  )
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );


-- ============================================================
-- 第七步：manager(主管) 角色权限分配
-- ============================================================
-- 主管：全部 leads/pool/customer 权限（含释放/分配/高级管理）

INSERT INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
CROSS JOIN sys_permission p
WHERE r.code = 'manager'
  AND p.code IN (
    -- 线索模块（全部，含释放）
    'leads', 'leads:view', 'leads:create', 'leads:claim', 'leads:convert', 'leads:release',
    -- 客户操作权限（释放/分配/高级管理）
    'customer:release', 'customer:assign', 'customer:manage',
    -- 公海模块（全部，含分配）
    'pool', 'pool:view', 'pool:claim', 'pool:assign'
  )
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );


-- ============================================================
-- 第八步：验证结果
-- ============================================================

SELECT '=== 新增权限码清单 ===' AS info;
SELECT code, name, type FROM sys_permission
WHERE code IN (
  'leads', 'leads:view', 'leads:create', 'leads:claim', 'leads:convert', 'leads:release',
  'pool', 'pool:view', 'pool:claim', 'pool:assign',
  'customer:release', 'customer:assign', 'customer:manage'
)
ORDER BY code;

SELECT '=== sales 角色权限 ===' AS info;
SELECT p.code AS permission_code, p.name
FROM sys_role_permission rp
JOIN sys_role r ON rp.role_id = r.id
JOIN sys_permission p ON rp.permission_id = p.id
WHERE r.code = 'sales'
  AND p.code IN (
    'leads', 'leads:view', 'leads:create', 'leads:claim', 'leads:convert', 'leads:release',
    'pool', 'pool:view', 'pool:claim', 'pool:assign',
    'customer:view', 'customer:add', 'customer:edit',
    'customer:release', 'customer:assign', 'customer:manage'
  )
ORDER BY p.code;

SELECT '=== manager 角色权限 ===' AS info;
SELECT p.code AS permission_code, p.name
FROM sys_role_permission rp
JOIN sys_role r ON rp.role_id = r.id
JOIN sys_permission p ON rp.permission_id = p.id
WHERE r.code = 'manager'
  AND p.code IN (
    'leads', 'leads:view', 'leads:create', 'leads:claim', 'leads:convert', 'leads:release',
    'pool', 'pool:view', 'pool:claim', 'pool:assign',
    'customer:view', 'customer:add', 'customer:edit',
    'customer:release', 'customer:assign', 'customer:manage'
  )
ORDER BY p.code;

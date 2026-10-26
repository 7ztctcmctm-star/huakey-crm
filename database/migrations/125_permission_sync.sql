-- =============================================================================
-- 125_permission_sync.sql
-- 2026-10-23 · 审计 P0-02 / P0-04 修复：权限真源落库 + 经理越权回收
-- =============================================================================
-- 背景：
--   1. 路由在用、但 sys_permission 中完全不存在的 12 个权限码：
--      file, file:upload, invoice:view, payment:edit, quotation:view,
--      quotation:approve, purchase:request, purchase:comparison, email:send,
--      recycle_bin:view, data:restore, system:cron
--      ⇒ 除 boss/manageAll 外，经理/财务/销售/采购调用相关端点全部 403。
--   2. 旧版 120 把 boss 全部权限复制给 manager，导致经理获得
--      system:user* / system:role* / system:backup / settings 等系统管理权限。
--
-- 原则：
--   · 只增不删业务权限；仅删除明确的系统管理/灾备/审计越权项。
--   · 角色按 code 定位，不硬编码 role_id（跨环境一致）。
--   · 全量 INSERT IGNORE / DELETE 幂等，可重复执行。
--   · 不修改任何业务数据，只改权限字典与角色关联。
--
-- 回滚：见 125_permission_sync_down.sql（仅撤销本迁移新增的码与关联；
--       旧版 120 已造成的经理管理权限删除不可自动恢复，需人工按审计结论恢复）。
-- =============================================================================

USE huakey_crm;

-- -----------------------------------------------------------------------------
-- 1. 补齐 12 个缺失权限码
-- -----------------------------------------------------------------------------
-- 1.1 菜单父级 file（其余父级 invoice/payment/quotation/purchase/email/system 已存在）
INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort, is_visible)
VALUES ('附件管理', 'file', 'menu', 0, 36, 1);

-- 1.2 按钮权限（父级按 code 定位）
INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '文件上传', 'file:upload', 'button', p.id, 0, 1
FROM sys_permission p WHERE p.code = 'file';

INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '查看发票', 'invoice:view', 'button', p.id, 0, 1
FROM sys_permission p WHERE p.code = 'invoice';

INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '登记回款', 'payment:edit', 'button', p.id, 0, 1
FROM sys_permission p WHERE p.code = 'payment';

INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '查看报价', 'quotation:view', 'button', p.id, 0, 1
FROM sys_permission p WHERE p.code = 'quotation';

INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '报价审批', 'quotation:approve', 'button', p.id, 0, 1
FROM sys_permission p WHERE p.code = 'quotation';

INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '采购申请', 'purchase:request', 'button', p.id, 0, 1
FROM sys_permission p WHERE p.code = 'purchase';

INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '采购比价', 'purchase:comparison', 'button', p.id, 0, 1
FROM sys_permission p WHERE p.code = 'purchase';

INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '发送邮件', 'email:send', 'button', p.id, 0, 1
FROM sys_permission p WHERE p.code = 'email';

INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '查看回收站', 'recycle_bin:view', 'button', p.id, 0, 1
FROM sys_permission p WHERE p.code = 'system';

INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '数据恢复', 'data:restore', 'button', p.id, 0, 1
FROM sys_permission p WHERE p.code = 'system';

INSERT IGNORE INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '定时任务触发', 'system:cron', 'button', p.id, 0, 1
FROM sys_permission p WHERE p.code = 'system';

-- -----------------------------------------------------------------------------
-- 2. 按岗位授予缺失权限（只增不删）
-- -----------------------------------------------------------------------------
-- 2.1 附件：所有业务角色（财务/工程/HR/采购都需要上传合同、工单、资料）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
JOIN sys_permission p ON p.code IN ('file', 'file:upload')
WHERE r.code IN ('boss', 'manager', 'sales', 'hr', 'purchase', 'finance', 'engineer');

-- 2.2 发票查看：凡已持有发票菜单/开票权限的角色，必须能看详情
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT r.id, p_view.id
FROM sys_role r
JOIN sys_role_permission rp ON rp.role_id = r.id
JOIN sys_permission p_existing ON p_existing.id = rp.permission_id
JOIN sys_permission p_view ON p_view.code = 'invoice:view'
WHERE p_existing.code IN ('invoice', 'invoice:add', 'invoice:edit', 'invoice:delete', 'invoice:export');
-- 兜底：财务/经理/老板即使当前没有发票开票权限，也应能查看发票
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
JOIN sys_permission p ON p.code = 'invoice:view'
WHERE r.code IN ('boss', 'manager', 'finance');

-- 2.3 回款登记：老板/经理/财务（销售不得直接改回款，A3 拆分原则）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
JOIN sys_permission p ON p.code = 'payment:edit'
WHERE r.code IN ('boss', 'manager', 'finance');

-- 2.4 报价查看：凡持有报价菜单/增删改权限的角色
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT r.id, p_view.id
FROM sys_role r
JOIN sys_role_permission rp ON rp.role_id = r.id
JOIN sys_permission p_existing ON p_existing.id = rp.permission_id
JOIN sys_permission p_view ON p_view.code = 'quotation:view'
WHERE p_existing.code IN ('quotation', 'quotation:add', 'quotation:edit', 'quotation:delete');
-- 兜底：财务经 121 获得 quotation 后需要能看详情
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
JOIN sys_permission p ON p.code = 'quotation:view'
WHERE r.code IN ('boss', 'manager', 'finance');

-- 2.5 报价审批：仅老板/经理（销售不得审批自己的报价）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
JOIN sys_permission p ON p.code = 'quotation:approve'
WHERE r.code IN ('boss', 'manager');

-- 2.6 采购申请/比价：老板/经理/采购
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
JOIN sys_permission p ON p.code IN ('purchase:request', 'purchase:comparison')
WHERE r.code IN ('boss', 'manager', 'purchase');

-- 2.7 邮件发送：凡持有邮件菜单的角色
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT DISTINCT r.id, p_send.id
FROM sys_role r
JOIN sys_role_permission rp ON rp.role_id = r.id
JOIN sys_permission p_existing ON p_existing.id = rp.permission_id
JOIN sys_permission p_send ON p_send.code = 'email:send'
WHERE p_existing.code = 'email';

-- 2.8 回收站/数据恢复：仅老板（super_admin 由 ADMIN_ROLE_CODES 绕过）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
JOIN sys_permission p ON p.code IN ('recycle_bin:view', 'data:restore')
WHERE r.code = 'boss';

-- 2.9 定时任务手动触发：老板/经理（路由仍有 requireAdmin，经理实际仍进不来；
--     保留授权是为了与 permission-definitions 的经理矩阵一致，避免两处漂移）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
JOIN sys_permission p ON p.code = 'system:cron'
WHERE r.code IN ('boss', 'manager');

-- -----------------------------------------------------------------------------
-- 3. 回收旧版 120 造成的经理系统管理越权
-- -----------------------------------------------------------------------------
-- 只删除系统管理 / 灾备 / 审计类权限；业务权限（报价、合同、采购、发票等）不动。
-- 若旧版 120 从未执行，本 DELETE 影响 0 行，幂等。
DELETE rp
FROM sys_role_permission rp
JOIN sys_role r ON r.id = rp.role_id
JOIN sys_permission p ON p.id = rp.permission_id
WHERE r.code = 'manager'
  AND p.code IN (
    'system',
    'system:user', 'system:user:add', 'system:user:edit', 'system:user:delete',
    'system:role', 'system:role:add', 'system:role:edit', 'system:role:delete', 'system:role:permission',
    'system:dept',
    'system:tag',
    'system:permission',
    'system:integration',
    'system:currency',
    'system:backup', 'backup:add', 'backup:restore',
    'settings',
    'system:log', 'log:export', 'log:delete',
    'recycle_bin:view', 'data:restore',
    'finance'
  );

-- -----------------------------------------------------------------------------
-- 4. 对账输出（迁移日志可读；不改变数据）
-- -----------------------------------------------------------------------------
SELECT '125 permission sync' AS check_name,
       (SELECT COUNT(*) FROM sys_permission WHERE code IN (
          'file','file:upload','invoice:view','payment:edit','quotation:view',
          'quotation:approve','purchase:request','purchase:comparison','email:send',
          'recycle_bin:view','data:restore','system:cron')) AS new_codes_present;

SELECT r.code AS role_code, COUNT(*) AS perm_count
FROM sys_role r
LEFT JOIN sys_role_permission rp ON rp.role_id = r.id
WHERE r.code IN ('boss', 'manager', 'sales', 'hr', 'purchase', 'finance', 'engineer')
GROUP BY r.code
ORDER BY r.code;

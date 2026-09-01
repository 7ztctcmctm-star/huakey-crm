-- ============================================================
-- 109_down: 回滚死权限码清理
-- ============================================================
-- 说明：
--   - 本迁移删除的 11 个权限码均无功能性使用，回滚无业务意义；
--   - 若确需恢复（如审计要求），可执行下方 INSERT 重建码定义；
--     角色关联（sys_role_permission）不恢复（原本即无效果授权）；
--   - 同时需回滚 backend/scripts/init_role_permissions.js 中
--     reminder / followup_template 两条种子的移除。
--
-- 跨库兼容：不使用 USE 语句，依赖 DATABASE()。
-- ============================================================

-- 恢复码定义（幂等：不存在才插入；父节点不存在时 parent 置 0 挂根）
INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '查看审批', 'approval:view', 'button', 0, 0, 1
FROM dual WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'approval:view');

INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '高级管理', 'customer:manage', 'api', 0, 0, 0
FROM dual WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'customer:manage');

INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '跟进模板（旧）', 'followup_template', 'menu', 0, 34, 1
FROM dual WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'followup_template');

INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '录入线索', 'leads:add', 'api', 0, 0, 0
FROM dual WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'leads:add');

INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '认领线索', 'leads:claim', 'api', 0, 0, 0
FROM dual WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'leads:claim');

INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '释放线索', 'leads:release', 'api', 0, 0, 0
FROM dual WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'leads:release');

INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '查看通知', 'notification:view', 'button', 0, 0, 1
FROM dual WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'notification:view');

INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '查看权限', 'permission:view', 'button', 0, 0, 1
FROM dual WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'permission:view');

INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '分配公海客户', 'pool:assign', 'api', 0, 0, 0
FROM dual WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'pool:assign');

INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '提醒中心', 'reminder', 'menu', 0, 30, 1
FROM dual WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'reminder');

INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '查看评分', 'scoring:view', 'button', 0, 0, 1
FROM dual WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'scoring:view');

-- 复核
SELECT '=== 109_down 复核：已恢复的死码定义 ===' AS info;
SELECT code, name, type FROM sys_permission
WHERE code IN (
  'approval:view', 'customer:manage', 'followup_template',
  'leads:add', 'leads:claim', 'leads:release',
  'notification:view', 'permission:view', 'pool:assign',
  'reminder', 'scoring:view'
) ORDER BY code;

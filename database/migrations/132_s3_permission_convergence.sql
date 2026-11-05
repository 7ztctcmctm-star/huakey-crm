-- =============================================================
-- 132 · S3 权限收敛 + 术语显示名统一（2026-11-03 业务定稿）
-- 依据：docs/assignment-redesign-2026-11-03.md V5.3 S3 / V5.4 C1·C3 / B-05
-- 全部写操作幂等（DELETE JOIN / UPDATE WHERE / INSERT IGNORE），可重复执行
-- 注意：不动表结构、不动权限码本身（D5）；历史迁移（098/020/070）不改（D2），
--       显示名与授予关系的收敛全部经由本迁移落地。
-- =============================================================

-- ① manager 收回 customer:assign —— 分配权只属 boss / super_admin（B-04/B-05）
--    代码层（S1，d1e422b）已在 requireAdmin 上强制；本步收敛数据层，
--    使权限管理页不再显示"经理持有分配权"，读端点（assign-log/sales-users 等）
--    随 customer:assign 码收回自然收敛为 403。
DELETE rp FROM sys_role_permission rp
JOIN sys_role r ON r.id = rp.role_id AND r.code = 'manager'
JOIN sys_permission p ON p.id = rp.permission_id AND p.code = 'customer:assign';

-- ② sales 收回 pool:claim / pool:view —— 待分配（sea）客户仅双 boss 可见可分配（V5.1），
--    销售不可见不可抢（B-03：回收后原销售不可见，前端隐藏不算数）。
DELETE rp FROM sys_role_permission rp
JOIN sys_role r ON r.id = rp.role_id AND r.code = 'sales'
JOIN sys_permission p ON p.id = rp.permission_id AND p.code IN ('pool:claim', 'pool:view');

-- ③ 资源库可见范围补齐（V5.3 S3 验收③）：hr / finance 授予只读查看
--    （仅 leads 菜单 + leads:view，无任何写码 ⇒ 前端无操作按钮）。
--    purchase / engineer 现库已持有 leads:view，不在此重复授予。
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM sys_role r
JOIN sys_permission p ON p.code IN ('leads', 'leads:view')
WHERE r.code IN ('hr', 'finance');

-- ④ 权限显示名统一（V5.4 C1）：对外口径「客户资源库 / 转为客户 / 待分配」，
--    码不动（D5）。api:customer:claim / api:leads:claim 两行已在历史链中移除，
--    以下两条 UPDATE 为幂等兜底（对象不存在时命中 0 行，不报错）。
UPDATE sys_permission SET name = '客户资源库'          WHERE code = 'leads';
UPDATE sys_permission SET name = '客户总览'            WHERE code = 'pool';
UPDATE sys_permission SET name = '查看客户资源库'       WHERE code = 'leads:view';
UPDATE sys_permission SET name = '转为客户'             WHERE code = 'leads:convert';
UPDATE sys_permission SET name = '查看待分配'           WHERE code = 'pool:view';
UPDATE sys_permission SET name = '分配待分配客户至本人' WHERE code = 'pool:claim';
UPDATE sys_permission SET name = '收回到待分配'         WHERE code = 'customer:release';
UPDATE sys_permission SET name = '客户分配至本人接口'   WHERE code = 'api:customer:claim';
UPDATE sys_permission SET name = '线索转为客户接口'     WHERE code = 'api:leads:claim';

-- ⑤ 状态字典统一（V5.4 C3）：sea 的显示名「公海客户」→「待分配」
UPDATE sys_customer_status SET name = '待分配' WHERE code = 'sea';

-- ⑥ 经理角色描述纠偏（S3 任务第 2 条）：原描述「可看全部客户」与 view_all=0 矛盾，
--    按 B-05 口径（只读 + 仅看本部门及下属团队）改写。
UPDATE sys_role SET description = '各销售部门经理，只读查看本部门及下属团队数据'
WHERE code = 'manager';

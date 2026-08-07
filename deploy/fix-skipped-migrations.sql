-- ============================================
-- 修复两个跳过的迁移: 086 和 091
-- ============================================

-- ============================================
-- 修复 086: 为所有非管理员角色补充缺失的权限
-- 原始问题: FIND_IN_SET 排序规则冲突
-- 修复方式: 用 IN 替代 FIND_IN_SET
-- ============================================

USE huakey_crm;

-- 1a. customer:view 权限码
INSERT IGNORE INTO sys_permission (code, name, type, parent_id, path, sort, is_visible, create_time, update_time)
SELECT 'customer:view', '查看客户', 'button',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'customer') AS p), NULL, 7, 1, NOW(), NOW()
FROM dual
WHERE EXISTS (SELECT 1 FROM sys_permission WHERE code = 'customer');

-- 1b. competitor 权限码
INSERT IGNORE INTO sys_permission (code, name, type, parent_id, sort, is_visible, create_time, update_time)
SELECT code, name, 'button',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'competitor') AS c),
       sort, 1, NOW(), NOW()
FROM (
  SELECT 'competitor:view' AS code, '查看竞争对手' AS name, 1 AS sort
  UNION ALL SELECT 'competitor:add', '新增竞争对手', 2
  UNION ALL SELECT 'competitor:edit', '编辑竞争对手', 3
  UNION ALL SELECT 'competitor:delete', '删除竞争对手', 4
) t
WHERE EXISTS (SELECT 1 FROM sys_permission WHERE code = 'competitor');

-- 1c. user:create 权限码
INSERT IGNORE INTO sys_permission (code, name, type, parent_id, sort, is_visible, create_time, update_time)
SELECT 'user:create', '创建用户', 'button',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'system:user') AS u),
       5, 1, NOW(), NOW()
FROM dual
WHERE EXISTS (SELECT 1 FROM sys_permission WHERE code = 'system:user');

-- 2. 公共权限 (用 IN 替代 FIND_IN_SET 避免排序规则冲突)
-- 2a. dashboard
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code IN ('sales','hr','purchase','finance','engineer') AND p.code = 'dashboard';

-- 2b. reminder
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code IN ('sales','hr','purchase','finance','engineer') AND p.code = 'reminder';

-- 2c. ai
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code IN ('sales','hr','purchase','finance','engineer') AND p.code = 'ai';

-- 2d. tag
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code IN ('sales','hr','purchase','finance','engineer') AND p.code = 'tag';

-- 3. sales 角色专项权限
-- 3a. 客户管理
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN (
  'customer', 'customer:list', 'customer:view', 'customer:add', 'customer:edit',
  'customer:pool', 'customer:import', 'customer:export'
);

-- 3b. 线索管理
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'leads';

-- 3c. 商机管理
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('opportunity', 'opportunity:add', 'opportunity:edit');

-- 3d. 报价管理
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('quotation', 'quotation:add', 'quotation:edit');

-- 3e. 合同管理
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('contract', 'contract:add', 'contract:edit');

-- 3f. 产品/供应商（查看）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('product', 'supplier');

-- 3g. 售后服务
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('service', 'service:add', 'service:edit');

-- 3h. 跟进日历
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'followup:calendar';

-- 3i. 数据报表
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'report';

-- 3j. 日程管理
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'calendar';

-- 3k. 知识库
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'knowledge';

-- 3l. 全局搜索
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'search';

-- 3m. 客户评分
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'scoring';

-- 3n. 销售目标
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'target';

-- 3o. 邮件
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('email', 'email:send');

-- 3p. 审批
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code = 'approval';

-- 3q. 发票
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('invoice', 'invoice:add', 'invoice:edit');

-- 3r. 竞争对手（查看）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('competitor', 'competitor:view');

-- 3s. 模板（查看）
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'sales' AND p.code IN ('followup_template', 'contract_template');

-- 4. purchase/hr/finance/engineer 公共部分
-- 4a. purchase
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code IN ('purchase','hr','finance','engineer') AND p.code = 'purchase';

-- 4b. supplier
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code IN ('purchase','hr','finance','engineer') AND p.code = 'supplier';

-- 4c. product
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code IN ('purchase','hr','finance','engineer') AND p.code = 'product';

-- 4d. service
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code IN ('purchase','hr','finance','engineer') AND p.code = 'service';

-- 4e. report
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code IN ('purchase','hr','finance','engineer') AND p.code = 'report';

-- 5. purchase 专项
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'purchase' AND p.code IN (
  'purchase:add', 'purchase:edit',
  'supplier:add', 'supplier:edit',
  'calendar'
);

-- 6. hr 专项
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'hr' AND p.code IN ('hr', 'calendar');

-- 7. finance 专项
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'finance' AND p.code IN (
  'finance', 'invoice', 'invoice:add', 'invoice:edit', 'invoice:export',
  'calendar', 'report'
);

-- 8. engineer 专项
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'engineer' AND p.code IN ('calendar', 'service:add', 'service:edit');

-- 9. manager 补充
INSERT IGNORE INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'manager' AND p.code IN (
  'customer:view', 'reminder', 'ai', 'tag', 'team', 'calendar', 'search', 'scoring'
);

-- ============================================
-- 修复 091: crm_customer_score_log CASCADE → SET NULL
-- 原始问题: 缺少 MODIFY COLUMN customer_id INT NULL
-- 修复方式: 先 MODIFY COLUMN 再 ADD CONSTRAINT
-- ============================================

-- 先将 customer_id 改为可空
ALTER TABLE crm_customer_score_log MODIFY COLUMN customer_id INT NULL;

-- 删除可能残留的旧外键（如果存在）
SET @db_name = DATABASE();
SET @old_fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'crm_customer_score_log'
  AND CONSTRAINT_NAME = 'fk_score_log_customer' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @drop_old = IF(@old_fk_exists > 0,
  'ALTER TABLE crm_customer_score_log DROP FOREIGN KEY fk_score_log_customer',
  'SELECT 1');
PREPARE stmt FROM @drop_old; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加 SET NULL 外键
ALTER TABLE crm_customer_score_log
  ADD CONSTRAINT fk_score_log_customer
  FOREIGN KEY (customer_id) REFERENCES crm_customer(id) ON DELETE SET NULL;

-- ============================================
-- 验证结果
-- ============================================
SELECT '=== 086 验证: 各角色权限数量 ===' AS info;
SELECT r.code AS role_code, COUNT(rp.permission_id) AS perm_count
FROM sys_role r
LEFT JOIN sys_role_permission rp ON r.id = rp.role_id
GROUP BY r.id, r.code
ORDER BY r.id;

SELECT '=== 091 验证: crm_customer_score_log 外键 ===' AS info;
SELECT
  kcu.CONSTRAINT_NAME,
  kcu.COLUMN_NAME,
  rc.DELETE_RULE
FROM information_schema.KEY_COLUMN_USAGE kcu
JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
  ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
  AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
WHERE kcu.TABLE_SCHEMA = 'huakey_crm'
AND kcu.TABLE_NAME = 'crm_customer_score_log'
AND kcu.REFERENCED_TABLE_NAME = 'crm_customer';

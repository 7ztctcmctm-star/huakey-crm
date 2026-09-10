-- ============================================================
-- 112: 客户转移申请表 + customer:transfer 权限码
-- ============================================================
-- 变更内容：
--   1. 新建 crm_customer_transfer（客户转移申请）
--   2. 新增权限码 customer:transfer
--
-- 背景（产品改造：公海池 → 客户总览）：
--   委托人确认的流转规则：
--     · 销售可发起转移给其他销售，但【必须接收人同意】才生效
--     · 转移申请【不可撤回】
--     · 超过 3 天未处理【自动回流】（置 expired，客户仍归原负责人）
--     · 老板/管理员【直接分配】，不经过同意流程，但需填交接备注
--   故本表状态机只需 pending / accepted / rejected / expired 四态，
--   没有 cancelled（不可撤回）—— 这是刻意的设计，勿擅自增补。
--
-- 风险：🟢 低。纯新建表 + 新增权限码，零数据回填，不影响既有表。
--
-- 跨库兼容：不使用 USE 语句，依赖 run_migrations.js 连接的默认数据库
-- （与 111 号迁移保持一致；103 号使用的 USE huakey_crm 会导致测试库执行失败）。
-- ============================================================

-- ============================================================
-- 第一步：客户转移申请表
-- ============================================================
-- 外键 ON DELETE 策略对齐项目现状（现存 SET NULL 52 处 > CASCADE 33 处）：
--   · customer_id：客户删除 → 转移申请无意义，随客户级联删除
--   · from/to_user_id：用户删除 → 保留申请记录（审计价值），置 NULL
-- 含 deleted_at：满足「核心业务表应支持软删除」的要求，避免物理删除转移记录。

CREATE TABLE IF NOT EXISTS crm_customer_transfer (
  id INT NOT NULL AUTO_INCREMENT,
  customer_id INT NOT NULL COMMENT '客户ID',
  from_user_id INT DEFAULT NULL COMMENT '发起人（原负责人）',
  to_user_id INT DEFAULT NULL COMMENT '接收人',
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '状态：pending/accepted/rejected/expired',
  reason VARCHAR(500) DEFAULT NULL COMMENT '转移原因（发起人填写）',
  handle_remark VARCHAR(500) DEFAULT NULL COMMENT '接收人处理备注',
  expire_at DATETIME NOT NULL COMMENT '过期时间（创建时间 + 3 天）',
  handle_time DATETIME DEFAULT NULL COMMENT '处理时间',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除标记',
  PRIMARY KEY (id),
  KEY idx_transfer_customer (customer_id),
  KEY idx_transfer_to_status (to_user_id, status),
  KEY idx_transfer_status_expire (status, expire_at),
  KEY idx_transfer_deleted_at (deleted_at),
  CONSTRAINT fk_transfer_customer FOREIGN KEY (customer_id) REFERENCES crm_customer (id) ON DELETE CASCADE,
  CONSTRAINT fk_transfer_from_user FOREIGN KEY (from_user_id) REFERENCES sys_user (id) ON DELETE SET NULL,
  CONSTRAINT fk_transfer_to_user FOREIGN KEY (to_user_id) REFERENCES sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户转移申请（双方同意制）';

-- ============================================================
-- 第二步：新增权限码 customer:transfer（幂等）
-- ============================================================

INSERT INTO sys_permission (name, code, type, parent_id, sort, is_visible)
SELECT '转移客户', 'customer:transfer', 'button',
       (SELECT id FROM (SELECT id FROM sys_permission WHERE code = 'customer') AS p),
       0, 1
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM sys_permission WHERE code = 'customer:transfer');

-- ============================================================
-- 第三步：把 customer:transfer 授予「已拥有 customer:edit 的角色」（幂等）
-- ============================================================
-- 设计取舍：不硬编码角色清单。
-- 能编辑客户的角色，理应也能发起转移；反之不授予。
-- 这样新增角色时不需要再补迁移。

INSERT INTO sys_role_permission (role_id, permission_id)
SELECT rp.role_id, (SELECT id FROM sys_permission WHERE code = 'customer:transfer')
FROM sys_role_permission rp
WHERE rp.permission_id = (SELECT id FROM sys_permission WHERE code = 'customer:edit')
  AND NOT EXISTS (
    SELECT 1 FROM sys_role_permission rp2
    WHERE rp2.role_id = rp.role_id
      AND rp2.permission_id = (SELECT id FROM sys_permission WHERE code = 'customer:transfer')
  );

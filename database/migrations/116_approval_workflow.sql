-- 116_approval_workflow.sql
-- 审批规则表（阈值→审批人矩阵）
-- PRD R-11: 可配置规则（阈值→审批人矩阵）
--   折扣/特价合同审批：按业务金额阈值匹配审批人（经理 / 指定角色 roleCode / 指定用户）
-- 约定：
--   * approver_type = 'manager' 时按提交人上级主管动态解析（approver_ref 留空）
--   * approver_type = 'role'    时 approver_ref 存角色 code（roleCode，禁止硬编码 roleId）
--   * approver_type = 'user'    时 approver_ref 存用户 id
--   * 金额区间左闭右开：[min_amount, max_amount)；max_amount 为 NULL 表示无上限

CREATE TABLE IF NOT EXISTS crm_approval_rule (
  id INT PRIMARY KEY AUTO_INCREMENT,
  business_type VARCHAR(20) NOT NULL COMMENT '业务类型：quote/contract/purchase/discount',
  min_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '金额下限（含）',
  max_amount DECIMAL(15,2) DEFAULT NULL COMMENT '金额上限（不含，NULL 表示无上限）',
  approver_type VARCHAR(20) NOT NULL COMMENT '审批人类型：manager/role/user',
  approver_ref VARCHAR(50) DEFAULT NULL COMMENT 'roleCode 或 用户ID（approver_type=user 时）',
  priority INT NOT NULL DEFAULT 0 COMMENT '优先级，数值越大越优先',
  status TINYINT(1) DEFAULT 1 COMMENT '状态：1启用 0禁用',
  description VARCHAR(200) DEFAULT NULL COMMENT '规则说明',
  created_by INT DEFAULT NULL COMMENT '创建人',
  -- ⚠️ 时间列名遵循项目主流约定 create_time / update_time（同族 crm_approval_workflow/step/record 一致），
  --    切勿写成 created_at/updated_at —— 否则服务层 SQL（r.create_time）会报 Unknown column 500。
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
  KEY idx_arule_type (business_type),
  KEY idx_arule_amount (business_type, min_amount, max_amount)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审批阈值规则（阈值→审批人矩阵）';

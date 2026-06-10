-- 043_approval_workflow.sql
-- 审批流程功能（审批状态字段已在 026 中添加）

-- 审批流程表
CREATE TABLE IF NOT EXISTS crm_approval_workflow (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL COMMENT '流程名称',
  type VARCHAR(20) NOT NULL COMMENT '流程类型：quote/contract/purchase/discount',
  description VARCHAR(200) DEFAULT NULL COMMENT '流程描述',
  status TINYINT(1) DEFAULT 1 COMMENT '状态：1启用 0禁用',
  create_by INT DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  KEY idx_aw_type (type),
  KEY idx_aw_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审批流程';

-- 审批步骤表
CREATE TABLE IF NOT EXISTS crm_approval_step (
  id INT PRIMARY KEY AUTO_INCREMENT,
  workflow_id INT NOT NULL COMMENT '流程ID',
  step_order INT NOT NULL COMMENT '步骤顺序',
  step_name VARCHAR(50) NOT NULL COMMENT '步骤名称',
  approver_type VARCHAR(20) NOT NULL COMMENT '审批人类型：user/role/manager',
  approver_id INT DEFAULT NULL COMMENT '审批人ID',
  is_required TINYINT(1) DEFAULT 1 COMMENT '是否必须审批',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_as_workflow (workflow_id),
  CONSTRAINT fk_as_workflow FOREIGN KEY (workflow_id) REFERENCES crm_approval_workflow(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审批步骤';

-- 审批记录表
CREATE TABLE IF NOT EXISTS crm_approval_record (
  id INT PRIMARY KEY AUTO_INCREMENT,
  workflow_id INT NOT NULL COMMENT '流程ID',
  business_type VARCHAR(20) NOT NULL COMMENT '业务类型',
  business_id INT NOT NULL COMMENT '业务ID',
  step_id INT NOT NULL COMMENT '步骤ID',
  step_order INT NOT NULL COMMENT '步骤顺序',
  approver_id INT NOT NULL COMMENT '审批人ID',
  status VARCHAR(20) DEFAULT 'pending' COMMENT '状态：pending/approved/rejected',
  remark VARCHAR(200) DEFAULT NULL COMMENT '审批意见',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ar_approver (approver_id, status),
  KEY idx_ar_business (business_type, business_id),
  CONSTRAINT fk_ar_workflow FOREIGN KEY (workflow_id) REFERENCES crm_approval_workflow(id),
  CONSTRAINT fk_ar_step FOREIGN KEY (step_id) REFERENCES crm_approval_step(id),
  CONSTRAINT fk_ar_approver FOREIGN KEY (approver_id) REFERENCES sys_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审批记录';

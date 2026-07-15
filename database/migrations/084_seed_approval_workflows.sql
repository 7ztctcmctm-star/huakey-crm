-- 084: 种子审批流程数据
-- 为 quote/purchase 业务类型创建默认审批流程

USE huakey_crm;

-- 创建报价审批流程（幂等）
INSERT IGNORE INTO crm_approval_workflow (id, name, type, description, status, create_by, create_time, update_time)
VALUES (1, '报价审批流程', 'quote', '报价单默认审批流程-部门经理审批', 1, 1, NOW(), NOW());

-- 创建采购审批流程
INSERT IGNORE INTO crm_approval_workflow (id, name, type, description, status, create_by, create_time, update_time)
VALUES (2, '采购审批流程', 'purchase', '采购单默认审批流程-部门经理审批', 1, 1, NOW(), NOW());

-- 创建报价审批步骤 (step 1: 部门经理审批)
INSERT IGNORE INTO crm_approval_step (id, workflow_id, step_order, step_name, approver_type, approver_id, is_required, create_time)
VALUES (1, 1, 1, '部门经理审批', 'manager', NULL, 1, NOW());

-- 创建采购审批步骤
INSERT IGNORE INTO crm_approval_step (id, workflow_id, step_order, step_name, approver_type, approver_id, is_required, create_time)
VALUES (2, 2, 1, '部门经理审批', 'manager', NULL, 1, NOW());

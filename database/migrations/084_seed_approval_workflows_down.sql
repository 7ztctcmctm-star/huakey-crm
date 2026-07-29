-- 084_down: 移除审批工作流种子数据
-- 仅删除本迁移新增的工作流（按名称匹配）
SET @db = DATABASE();
DELETE FROM crm_approval_workflow WHERE name IN ('合同审批', '报价审批', '采购申请审批');
DELETE FROM crm_approval_step WHERE workflow_id NOT IN (SELECT id FROM crm_approval_workflow);

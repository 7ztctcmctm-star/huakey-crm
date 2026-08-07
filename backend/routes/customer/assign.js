const express = require('express');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { requireManager } = require('../../middleware/admin');
const { validate, Joi } = require('../../middleware/validate');
const { autoAssignOwner } = require('../../services/assignService');
const customerController = require('../../controllers/customerController');

const router = express.Router();

// Validation schemas
const assignSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  to_user_id: Joi.number().integer().positive().allow(null),
  remark: Joi.string().max(200).allow('', null)
});

const batchAssignSchema = Joi.object({
  customer_ids: Joi.array().items(Joi.number().integer().positive()).min(1).max(100).required(),
  to_user_id: Joi.number().integer().positive().allow(null),
  remark: Joi.string().max(200).allow('', null)
});

const assignLogSchema = Joi.object({
  customer_id: Joi.number().integer().positive().allow('', null),
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional()
});

const assignRuleSchema = Joi.object({
  rule_name: Joi.string().max(200).required(),
  assign_type: Joi.string().valid('round_robin', 'by_source', 'by_region').required(),
  source_value: Joi.string().max(200).allow('', null),
  region_value: Joi.string().max(200).allow('', null),
  user_ids: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
  priority: Joi.number().integer().min(0).optional()
});

const updateAssignRuleSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  rule_name: Joi.string().max(200).optional(),
  assign_type: Joi.string().valid('round_robin', 'by_source', 'by_region').optional(),
  source_value: Joi.string().max(200).allow('', null),
  region_value: Joi.string().max(200).allow('', null),
  user_ids: Joi.array().items(Joi.number().integer().positive()).optional(),
  priority: Joi.number().integer().min(0).optional(),
  is_active: Joi.number().integer().valid(0, 1).optional()
}).min(1);

const deleteAssignRuleSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const autoAssignSchema = Joi.object({});

// 分配/回收客户负责人（支持设为"无负责人"）
// to_user_id 可以为 null，表示回收为无负责人状态
router.post('/assign', authenticateToken, checkPermission('customer:assign'), requireManager, validate(assignSchema), customerController.assign);

// 批量分配客户负责人
router.post('/batch-assign', authenticateToken, checkPermission('customer:assign'), requireManager, validate(batchAssignSchema), customerController.batchAssign);

// 查询分配日志
router.post('/assign-log', authenticateToken, checkPermission('customer:assign'), validate(assignLogSchema), customerController.listAssignLogs);

// 获取销售用户列表（供分配下拉选择）
router.get('/sales-users', authenticateToken, checkPermission('customer:assign'), customerController.getSalesUsers);

// 获取当前用户的下属列表（通过manager_id关联）
router.get('/my-subordinates', authenticateToken, customerController.getMySubordinates);

// ========== 分配规则管理 ==========

// 获取分配规则列表
router.get('/assign-rules', authenticateToken, requireManager, customerController.getAssignRules);

// 添加分配规则
router.post('/assign-rules/add', authenticateToken, requireManager, validate(assignRuleSchema), customerController.createAssignRule);

// 更新分配规则
router.post('/assign-rules/update', authenticateToken, requireManager, validate(updateAssignRuleSchema), customerController.updateAssignRule);

// 删除分配规则
router.post('/assign-rules/delete', authenticateToken, requireManager, validate(deleteAssignRuleSchema), customerController.deleteAssignRule);

// 轮询自动分配：将公海客户均匀分配给销售团队
router.post('/auto-assign', authenticateToken, checkPermission('customer:assign'), requireManager, validate(autoAssignSchema), customerController.autoAssign);

// ========== 公海认领/释放（从 pool.js 迁移，避免废弃路由继续暴露）==========

const claimSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required()
});

const batchClaimSchema = Joi.object({
  customer_ids: Joi.array().items(Joi.number().integer().positive()).min(1).max(20).required()
});

const releaseSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required()
});

const batchReleaseSchema = Joi.object({
  customer_ids: Joi.array().items(Joi.number().integer().positive()).min(1).max(100).required()
});

const poolLogSchema = Joi.object({
  customer_id: Joi.number().integer().positive().allow('', null),
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional()
});

// 认领公海客户
router.post('/claim', authenticateToken, checkPermission('pool:claim'), validate(claimSchema), customerController.claim);

// 批量认领公海客户
router.post('/batch-claim', authenticateToken, checkPermission('pool:claim'), validate(batchClaimSchema), customerController.batchClaim);

// 释放客户到公海
router.post('/release', authenticateToken, checkPermission('customer:release'), validate(releaseSchema), customerController.release);

// 批量释放客户到公海
router.post('/batch-release', authenticateToken, checkPermission('customer:release'), validate(batchReleaseSchema), customerController.batchRelease);

// 获取公海操作日志
router.post('/pool-log', authenticateToken, checkPermission('pool:view'), validate(poolLogSchema), customerController.listPoolLogs);

module.exports = router;
module.exports.autoAssignOwner = autoAssignOwner;

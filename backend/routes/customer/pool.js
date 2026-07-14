const express = require('express');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const customerController = require('../../controllers/customerController');

const router = express.Router();

const claimCustomerSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required()
});

const releaseCustomerSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required()
});

const batchClaimSchema = Joi.object({
  customer_ids: Joi.array().items(Joi.number().integer().positive()).min(1).max(20).required()
});

const batchReleaseSchema = Joi.object({
  customer_ids: Joi.array().items(Joi.number().integer().positive()).min(1).max(100).required()
});

const poolLogSchema = Joi.object({
  customer_id: Joi.number().integer().positive().allow('', null),
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional()
});

// 公海客户列表（已合并到 /customer/list，返回 410 Gone 引导迁移）
router.post('/pool', authenticateToken, checkPermission('customer:pool'), (req, res) => {
  res.status(410).json({ code: 410, message: '公海列表已合并到 /customer/list，请使用 unassigned=true 筛选', data: null });
});

// 认领公海客户
router.post('/claim', authenticateToken, checkPermission('customer:pool'), validate(claimCustomerSchema), customerController.claim);

// 批量认领公海客户
router.post('/batch-claim', authenticateToken, checkPermission('customer:pool'), validate(batchClaimSchema), customerController.batchClaim);

// 释放客户到公海
router.post('/release', authenticateToken, checkPermission('customer:pool'), validate(releaseCustomerSchema), customerController.release);

// 批量释放客户到公海
router.post('/batch-release', authenticateToken, checkPermission('customer:pool'), validate(batchReleaseSchema), customerController.batchRelease);

// 获取公海操作日志
router.post('/pool-log', authenticateToken, checkPermission('customer:pool'), validate(poolLogSchema), customerController.listPoolLogs);

module.exports = router;

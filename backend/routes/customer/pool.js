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

const poolListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  company_name: Joi.string().max(200).allow('', null),
  industry: Joi.string().max(200).allow('', null),
  source: Joi.string().max(50).allow('', null),
  level: Joi.string().valid('A', 'B', 'C').allow('', null),
  pool_type: Joi.string().max(50).allow('', null)
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

// 公海客户列表
router.post('/pool', authenticateToken, checkPermission('customer:pool'), validate(poolListSchema), customerController.listPool);

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

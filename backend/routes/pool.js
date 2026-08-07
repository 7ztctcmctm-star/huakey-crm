/**
 * Phase 5: 公海池独立路由
 *
 * 挂载路径: /api/v1/pool
 * 权限码: pool:view / pool:claim / customer:release（Phase 4 迁移 098 定义）
 *
 * 端点:
 *   POST /          - 公海列表（status='sea'）            [pool:view]
 *   POST /claim     - 认领公海客户（sea→following, 7天保护期） [pool:claim]
 *   POST /release   - 释放客户到公海（following→sea）       [customer:release]
 *
 * 兼容说明: 旧端点 POST /api/v1/customer/pool-list、/customer/claim-pool、
 *           /customer/release-to-pool 保留，内部调用相同的 controller 方法。
 */

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const customerController = require('../controllers/customerController');

// ========== 查询 Schema（与 customer/center.js 保持一致） ==========

const poolListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  company_name: Joi.string().max(200).allow('', null),
  industry: Joi.string().max(50).allow('', null),
  source: Joi.string().max(50).allow('', null),
  level: Joi.string().valid('A', 'B', 'C').allow('', null),
  sort: Joi.string().valid('create_time_desc', 'last_follow_time_asc', 'last_follow_time_desc').allow('', null)
});

const customerIdSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const releaseSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  reason: Joi.string().max(500).allow('', null)
});

// ========== 路由定义 ==========

// 公海池列表
router.post('/',
  authenticateToken,
  checkPermission('pool:view'),
  validate(poolListSchema),
  customerController.listPoolNew
);

// 认领公海客户（sea → following，设 7 天保护期）
router.post('/claim',
  authenticateToken,
  checkPermission('pool:claim'),
  validate(customerIdSchema),
  customerController.claimPool
);

// 释放客户到公海（following → sea）
router.post('/release',
  authenticateToken,
  checkPermission('customer:release'),
  validate(releaseSchema),
  customerController.releaseToPool
);

module.exports = router;

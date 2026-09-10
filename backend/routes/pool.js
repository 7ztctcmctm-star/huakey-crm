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
const transferController = require('../controllers/transferController');

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

// ========== 客户转移（双方同意制，2026-09-10 新增）==========
// 规则：销售发起 → 接收人同意才生效；不可撤回；超 3 天自动回流。
// 老板/管理员走 assignService 直接分配，不经此流程（见 /api/v1/customer/assign）。

const transferCreateSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  to_user_id: Joi.number().integer().positive().required(),
  reason: Joi.string().max(500).allow('', null)
});

const transferHandleSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  remark: Joi.string().max(500).allow('', null)
});

const transferQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(100).optional()
});

const transferByCustomerSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required()
});

// 发起转移申请
router.post('/transfer',
  authenticateToken,
  checkPermission('customer:transfer'),
  validate(transferCreateSchema),
  transferController.create
);

// 接收人同意
router.post('/transfer/accept',
  authenticateToken,
  checkPermission('customer:transfer'),
  validate(transferHandleSchema),
  transferController.accept
);

// 接收人拒绝
router.post('/transfer/reject',
  authenticateToken,
  checkPermission('customer:transfer'),
  validate(transferHandleSchema),
  transferController.reject
);

// 我收到的待处理申请
router.post('/transfer/my-pending',
  authenticateToken,
  checkPermission('customer:transfer'),
  validate(transferQuerySchema),
  transferController.myPending
);

// 某客户的转移记录
router.post('/transfer/by-customer',
  authenticateToken,
  checkPermission('customer:transfer'),
  validate(transferByCustomerSchema),
  transferController.byCustomer
);

// 可转移的接收人候选（销售也需要，故不复用需 system:user 权限的 /user/list）
router.post('/transfer/candidates',
  authenticateToken,
  checkPermission('customer:transfer'),
  validate(Joi.object({})),
  transferController.candidates
);

module.exports = router;

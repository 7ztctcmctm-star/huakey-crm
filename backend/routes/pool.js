/**
 * Phase 5: 公海池独立路由
 *
 * 挂载路径: /api/v1/pool
 * 权限码: pool:view / pool:claim / customer:release（Phase 4 迁移 098 定义）
 *
 * 端点:
 *   POST /          - 公海列表（owner_id IS NULL）        [pool:view]
 *   POST /claim     - 认领公海客户（owner_id→当前用户）    [pool:claim]
 *   POST /release   - 释放客户到公海（owner_id=NULL）      [customer:release]
 *
 * [2026-10-26] 「7 天保护期」已于 2026-09-10 下线（poolService.claimPoolCustomer
 * 不再写 protect_until），注释同步修正，避免误导调用方。
 *
 * [2026-09-14 阶段2] 旧兼容端点 POST /api/v1/customer/pool-list、/customer/claim-pool、
 *           /customer/release-to-pool 已随 routes/customer/center.js 一并移除；本文件为公海池的唯一端口。
 */

const express = require('express');
const registry = require('../core/ModuleRegistry');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission } = require('../middleware/permission');
const { validate, Joi, idempotencyKeyField } = require('../middleware/validate');
const customerController = require('../controllers/customerController');
const transferController = require('../controllers/transferController');
const { CUSTOMER_LEVEL_CODES } = require('../constants/customerLevel');
const { BUSINESS_STATUS_CODES } = require('../constants/poolStatus');

// ========== 查询 Schema（原与 customer/center.js 保持一致，该文件已于 2026-09-14 移除） ==========

const poolListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  company_name: Joi.string().max(200).allow('', null),
  // [V1.1 §11.3] 前端公海页实际下发的联系人/电话/业务状态筛选：
  // 旧 schema 未声明 ⇒ stripUnknown 静默丢弃，用户点搜索无任何效果。
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  industry: Joi.string().max(50).allow('', null),
  source: Joi.string().max(50).allow('', null),
  level: Joi.string().valid(...CUSTOMER_LEVEL_CODES).allow('', null),
  business_status: Joi.string().valid(...BUSINESS_STATUS_CODES).allow('', null),
  sort: Joi.string().valid('create_time_desc', 'last_follow_time_asc', 'last_follow_time_desc').allow('', null)
});

const customerIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  // 认领接受幂等键：双击不得重复写 pool_log
  ...idempotencyKeyField
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

// 认领公海客户（owner_id=NULL → 当前用户；7 天保护期已下线）
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
  checkDataPermission('customer', 'owner_id'),
  validate(releaseSchema),
  customerController.releaseToPool
);

// ========== 客户转移（双方同意制，2026-09-10 新增）==========
// 规则：销售发起 → 接收人同意才生效；不可撤回；超 3 天自动回流。
// 老板/管理员走 assignService 直接分配，不经此流程（见 /api/v1/customers/assign）。

const transferCreateSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  to_user_id: Joi.number().integer().positive().required(),
  reason: Joi.string().max(500).allow('', null),
  ...idempotencyKeyField
});

const transferHandleSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  remark: Joi.string().max(500).allow('', null),
  // 同意/拒绝接受幂等键：双击不得把同一申请处理两次
  ...idempotencyKeyField
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
// [M-005] 加 checkDataPermission 校验操作者对该客户有权限，防止查看他人客户的转移历史
router.post('/transfer/by-customer',
  authenticateToken,
  checkPermission('customer:transfer'),
  checkDataPermission('customer', 'owner_id'),
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

registry.register('pool', { routes: router, permissions: ['pool', 'pool:view', 'pool:claim', 'customer:release'] });
module.exports = router;

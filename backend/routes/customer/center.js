/**
 * Phase 2: 客户中心三页面路由
 *
 * 新增端点（旧接口保留兼容）：
 *   POST /leads-pool       - 潜客池列表（business_status='lead'）
 *   POST /formal           - 正式客户列表（business_status IN following/quoted/negotiating/signed）
 *   POST /pool-list        - 公海池列表（pool_status='sea' 且 business_status != 'lead'）
 *   POST /convert-lead     - 潜客转正式客户
 *   POST /release-to-pool  - 释放客户到公海
 *   POST /claim-pool       - 领取公海客户
 *
 * 权限说明：
 *   潜客池/正式客户/公海池查询：customer:list 或 customer:view
 *   潜客转正式：customer:edit
 *   释放到公海：customer:release
 *   领取公海：pool:claim
 */

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../../middleware/auth');
const { checkPermission, checkDataPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const customerController = require('../../controllers/customerController');
const { BUSINESS_STATUS_CODES } = require('../../constants/poolStatus');

// ========== 查询 Schema ==========

const leadPoolSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  company_name: Joi.string().max(200).allow('', null),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  source: Joi.string().max(50).allow('', null),
  lead_level: Joi.string().valid('高', '中', '低').allow('', null),
  owner_id: Joi.number().integer().positive().allow(null),
  sort: Joi.string().valid('create_time_desc', 'last_follow_time_asc', 'last_follow_time_desc').allow('', null)
});

const formalSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  company_name: Joi.string().max(200).allow('', null),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  source: Joi.string().max(50).allow('', null),
  level: Joi.string().valid('A', 'B', 'C').allow('', null),
  business_status: Joi.string().valid(...BUSINESS_STATUS_CODES).allow('', null),
  owner_id: Joi.number().integer().positive().allow(null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null),
  sort: Joi.string().valid('create_time_desc', 'last_follow_time_asc', 'last_follow_time_desc').allow('', null)
});

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

// 潜客池列表
router.post('/leads-pool',
  authenticateToken,
  checkPermission('customer:list'),
  checkDataPermission('customer', 'owner_id'),
  validate(leadPoolSchema),
  customerController.listLeadPool
);

// 正式客户列表
router.post('/formal',
  authenticateToken,
  checkPermission('customer:list'),
  checkDataPermission('customer', 'owner_id'),
  validate(formalSchema),
  customerController.listFormal
);

// 公海池列表
router.post('/pool-list',
  authenticateToken,
  checkPermission('customer:list'),
  validate(poolListSchema),
  customerController.listPoolNew
);

// 潜客转正式客户
router.post('/convert-lead',
  authenticateToken,
  checkPermission('customer:edit'),
  validate(customerIdSchema),
  customerController.convertLeadToFormal
);

// 释放客户到公海
router.post('/release-to-pool',
  authenticateToken,
  checkPermission('customer:release'),
  validate(releaseSchema),
  customerController.releaseToPool
);

// 领取公海客户
router.post('/claim-pool',
  authenticateToken,
  checkPermission('pool:claim'),
  validate(customerIdSchema),
  customerController.claimPool
);

module.exports = router;

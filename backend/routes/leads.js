/**
 * Phase 5: 线索管理独立路由
 *
 * 挂载路径: /api/v1/leads
 * 权限码: leads:view / leads:convert（Phase 4 迁移 098 定义）
 *
 * 端点:
 *   POST /          - 线索列表（status='lead'）      [leads:view]
 *   POST /convert   - 潜客转正式客户（lead→following） [leads:convert]
 *
 * 兼容说明: 旧端点 POST /api/v1/customer/leads-pool 和 /customer/convert-lead 保留，
 *           内部调用相同的 controller 方法，行为一致。
 */

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const customerController = require('../controllers/customerController');

// ========== 查询 Schema（与 customer/center.js 保持一致） ==========

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

const convertSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// ========== 路由定义 ==========

// 线索列表
router.post('/',
  authenticateToken,
  checkPermission('leads:view'),
  checkDataPermission('customer', 'owner_id'),
  validate(leadPoolSchema),
  customerController.listLeadPool
);

// 潜客转正式客户（lead → following）
router.post('/convert',
  authenticateToken,
  checkPermission('leads:convert'),
  validate(convertSchema),
  customerController.convertLeadToFormal
);

module.exports = router;

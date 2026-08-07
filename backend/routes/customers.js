/**
 * Phase 5: 客户管理独立路由
 *
 * 挂载路径: /api/v1/customers
 * 权限码: customer:view / customer:add / customer:edit / customer:delete（Phase 4 迁移 098 定义）
 *
 * 端点:
 *   POST /              - 正式客户列表                     [customer:view]
 *   POST /list          - 全量客户列表（兼容旧端点）         [customer:view]
 *   POST /add           - 新增客户                         [customer:add]
 *   POST /update        - 编辑客户                         [customer:edit]
 *   POST /delete        - 删除客户                         [customer:delete]
 *   GET  /detail/:id    - 客户详情                         [customer:view]
 *   POST /forward       - 状态推进                         [customer:edit]
 *   POST /backward      - 状态回退                         [customer:edit]
 *   POST /export        - 导出客户                         [customer:view]
 *
 * 兼容说明: 旧端点 POST /api/v1/customer/* 保留，内部调用相同的 controller 方法。
 *           前端逐步切换到 /api/v1/customers/* 新端点。
 */

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const { validate, Joi } = require('../middleware/validate');
const { checkPermission, checkDataPermission } = require('../middleware/permission');
const customerController = require('../controllers/customerController');
const customerDetailService = require('../services/customerDetailService');
const { CUSTOMER_STATUS_CODES } = require('../constants/customerStatus');

// ========== Schema（与 customer/detail.js 保持一致） ==========

const formalSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  company_name: Joi.string().max(200).allow('', null),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  source: Joi.string().max(50).allow('', null),
  level: Joi.string().valid('A', 'B', 'C').allow('', null),
  business_status: Joi.string().valid(...CUSTOMER_STATUS_CODES).allow('', null),
  owner_id: Joi.number().integer().positive().allow(null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null),
  sort: Joi.string().valid('create_time_desc', 'last_follow_time_asc', 'last_follow_time_desc').allow('', null)
});

const customerListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  company_name: Joi.string().max(200).allow('', null),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  source: Joi.string().valid(...customerDetailService.VALID_SOURCES, ...Object.keys(customerDetailService.SOURCE_PARENT_MAP)).allow('', null),
  level: Joi.string().valid('A', 'B', 'C').allow('', null),
  status: Joi.string().valid(...CUSTOMER_STATUS_CODES, ...[0, 1, 2, 3, 5].map(String)).allow('', null),
  owner_id: Joi.number().integer().positive().allow(null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null),
  overdue: Joi.boolean().allow(null),
  unassigned: Joi.boolean().allow(null),
  sort: Joi.string().valid('create_time_desc', 'last_follow_time_asc', 'last_follow_time_desc').allow('', null)
});

const addCustomerSchema = Joi.object({
  company_name: Joi.string().required().max(200),
  contacts: Joi.array().items(
    Joi.object({
      name: Joi.string().max(50).required(),
      position: Joi.string().max(50).allow('', null),
      phone: Joi.string().pattern(/^\+?\d{7,20}$/).allow('', null),
      email: Joi.string().email().max(100).allow('', null),
      wechat: Joi.string().max(50).allow('', null),
      is_decision: Joi.boolean().allow('', null),
      remark: Joi.string().max(500).allow('', null)
    })
  ).min(1).required().messages({
    'array.min': '请至少添加一个联系人',
    'any.required': '请至少添加一个联系人'
  }),
  address: Joi.string().max(500).allow('', null),
  industry: Joi.string().max(200).allow('', null),
  source: Joi.string().valid(...customerDetailService.VALID_SOURCES).allow('', null),
  level: Joi.string().valid('A', 'B', 'C').default('C'),
  remark: Joi.string().max(2000).allow('', null)
});

const updateCustomerSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  company_name: Joi.string().max(200),
  address: Joi.string().max(500).allow('', null),
  industry: Joi.string().max(200).allow('', null),
  source: Joi.string().valid(...customerDetailService.VALID_SOURCES).allow('', null),
  level: Joi.string().valid('A', 'B', 'C'),
  status: Joi.string().valid(...CUSTOMER_STATUS_CODES, ...[1, 2, 3, 5].map(String)),
  remark: Joi.string().max(2000).allow('', null)
});

const deleteCustomerSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const forwardSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required()
});

const backwardSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  reason: Joi.string().max(500).allow('', null)
});

const exportSchema = Joi.object({
  company_name: Joi.string().max(200).allow('', null),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  source: Joi.string().max(50).allow('', null),
  level: Joi.string().valid('A', 'B', 'C').allow('', null),
  status: Joi.string().valid(...CUSTOMER_STATUS_CODES, ...[0, 1, 2, 3, 5].map(String)).allow('', null),
  owner_id: Joi.number().integer().positive().allow('', null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null)
});

// ========== 路由定义 ==========

// 正式客户列表（Phase 2 新接口，status IN following/quoted/negototiating/signed）
router.post('/',
  authenticateToken,
  checkPermission('customer:view'),
  checkDataPermission('customer', 'owner_id'),
  validate(formalSchema),
  customerController.listFormal
);

// 全量客户列表（兼容旧 /customer/list 端点）
router.post('/list',
  authenticateToken,
  checkPermission('customer:view'),
  checkDataPermission('customer', 'owner_id'),
  validate(customerListSchema),
  customerController.list
);

// 新增客户
router.post('/add',
  authenticateToken,
  checkPermission('customer:add'),
  validate(addCustomerSchema),
  customerController.create
);

// 编辑客户
router.post('/update',
  authenticateToken,
  checkPermission('customer:edit'),
  validate(updateCustomerSchema),
  customerController.update
);

// 删除客户
router.post('/delete',
  authenticateToken,
  checkPermission('customer:delete'),
  validate(deleteCustomerSchema),
  customerController.remove
);

// 客户详情
router.get('/detail/:id',
  authenticateToken,
  checkPermission('customer:view'),
  checkDataPermission('customer', 'owner_id'),
  customerController.detail
);

// 状态推进
router.post('/forward',
  authenticateToken,
  checkPermission('customer:edit'),
  validate(forwardSchema),
  customerController.forward
);

// 状态回退
router.post('/backward',
  authenticateToken,
  checkPermission('customer:edit'),
  validate(backwardSchema),
  customerController.backward
);

// 导出客户
router.post('/export',
  authenticateToken,
  checkPermission('customer:view'),
  checkDataPermission('customer', 'owner_id'),
  validate(exportSchema),
  customerController.exportCustomers
);

module.exports = router;

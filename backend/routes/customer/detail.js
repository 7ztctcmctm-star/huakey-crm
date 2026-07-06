const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { validate, Joi } = require('../../middleware/validate');
const { checkPermission, checkDataPermission } = require('../../middleware/permission');
const { createCache } = require('../../middleware/cache');
const customerDetailService = require('../../services/customerDetailService');
const customerController = require('../../controllers/customerController');

const customerListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  company_name: Joi.string().max(200).allow('', null),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  source: Joi.string().valid(...customerDetailService.VALID_SOURCES, ...Object.keys(customerDetailService.SOURCE_PARENT_MAP)).allow('', null),
  level: Joi.string().valid('A', 'B', 'C').allow('', null),
  status: Joi.number().integer().valid(0, 1, 2, 3, 5).allow('', null),
  customer_type: Joi.string().valid('prospect', 'customer').allow('', null),
  lifecycle_status: Joi.string().valid('new', 'nurturing', 'intent', 'active', 'lost', 'inactive').allow('', null),
  owner_id: Joi.number().integer().positive().allow(null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null),
  overdue: Joi.boolean().allow(null),
  unassigned: Joi.boolean().allow(null),
  overdue_follow: Joi.boolean().allow(null),
  tag_id: Joi.number().integer().positive().allow('', null),
  sort: Joi.string().valid('create_time_desc', 'last_follow_time_asc', 'last_follow_time_desc').allow('', null)
});

const addCustomerSchema = Joi.object({
  company_name: Joi.string().required().max(200),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().pattern(/^\+?\d{7,20}$/).allow('', null),
  email: Joi.string().email().max(200).allow('', null),
  address: Joi.string().max(500).allow('', null),
  industry: Joi.string().max(200).allow('', null),
  source: Joi.string().valid(...customerDetailService.VALID_SOURCES).allow('', null),
  level: Joi.string().valid('A', 'B', 'C').default('C'),
  remark: Joi.string().max(2000).allow('', null)
});

const updateCustomerSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  company_name: Joi.string().max(200),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().pattern(/^\+?\d{7,20}$/).allow('', null),
  email: Joi.string().email().max(200).allow('', null),
  address: Joi.string().max(500).allow('', null),
  industry: Joi.string().max(200).allow('', null),
  source: Joi.string().valid(...customerDetailService.VALID_SOURCES).allow('', null),
  level: Joi.string().valid('A', 'B', 'C'),
  status: Joi.number().integer().valid(1, 2, 3, 5),
  remark: Joi.string().max(2000).allow('', null)
});

const deleteCustomerSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const exportCustomersSchema = Joi.object({
  company_name: Joi.string().max(200).allow('', null),
  contact_name: Joi.string().max(200).allow('', null),
  phone: Joi.string().max(20).allow('', null),
  source: Joi.string().max(50).allow('', null),
  level: Joi.string().valid('A', 'B', 'C').allow('', null),
  status: Joi.number().integer().valid(0, 1, 2, 3, 5).allow('', null),
  customer_type: Joi.string().valid('prospect', 'customer').allow('', null),
  lifecycle_status: Joi.string().valid('new', 'nurturing', 'intent', 'active', 'lost', 'inactive').allow('', null),
  owner_id: Joi.number().integer().positive().allow('', null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null)
});

const convertCustomerSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  action: Joi.string().required()
});

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: 客户管理
 *     description: 客户 CRUD、详情、联系方式
 *
 * /api/customer/list:
 *   post:
 *     summary: 获取客户列表（分页 + 搜索）
 *     tags: [客户管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page: { type: integer, example: 1 }
 *               pageSize: { type: integer, example: 20 }
 *               company_name: { type: string }
 *               contact_name: { type: string }
 *               phone: { type: string }
 *               source: { type: string }
 *               level: { type: string, enum: [A, B, C] }
 *               status: { type: integer, enum: [0, 1, 2, 3, 5] }
 *               customer_type: { type: string, enum: [prospect, customer] }
 *               owner_id: { type: integer }
 *     responses:
 *       200:
 *         description: 客户列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     list: { type: array, items: { type: object } }
 *                     total: { type: integer }
 *       401: { description: 未登录或 token 过期 }
 *       403: { description: 无权限访问 }
 *       500: { description: 服务器内部错误 }
 *
 * /api/customer/add:
 *   post:
 *     summary: 新增客户
 *     tags: [客户管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [company_name]
 *             properties:
 *               company_name: { type: string, example: 铧旗科技 }
 *               contact_name: { type: string }
 *               phone: { type: string }
 *               email: { type: string }
 *               address: { type: string }
 *               industry: { type: string }
 *               source: { type: string }
 *               level: { type: string, enum: [A, B, C], default: C }
 *               remark: { type: string }
 *     responses:
 *       200:
 *         description: 创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string }
 *                 data: { type: object }
 *       400: { description: 参数错误 }
 *       401: { description: 未登录或 token 过期 }
 *       403: { description: 无权限访问 }
 *       500: { description: 服务器内部错误 }
 *
 * /api/customer/detail/{id}:
 *   get:
 *     summary: 获取客户详情
 *     tags: [客户管理]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 客户详情（含联系人、商机、跟进记录）
 *       401: { description: 未登录或 token 过期 }
 *       403: { description: 无权限访问 }
 *       404: { description: 客户不存在 }
 *       500: { description: 服务器内部错误 }
 */

// 1. 获取客户列表（复用 customerService）
router.post('/list',
  authenticateToken,
  createCache(300, (req) => `customer:list:${req.user.userId}:${JSON.stringify(req.body)}`),
  checkDataPermission('customer', 'owner_id'),
  validate(customerListSchema),
  customerController.list
);

// 2. 添加客户
router.post('/add', authenticateToken, checkPermission('customer:add'), validate(addCustomerSchema), customerController.create);

// 3. 修改客户
router.post('/update', authenticateToken, checkPermission('customer:edit'), validate(updateCustomerSchema), customerController.update);

// 4. 删除客户（逻辑删除）
router.post('/delete', authenticateToken, checkPermission('customer:delete'), validate(deleteCustomerSchema), customerController.remove);

// 5. 获取客户详情
router.get('/detail/:id', authenticateToken, checkDataPermission('customer', 'owner_id'), customerController.detail);

// 5.5 客户360度视图
router.get('/:id/360', authenticateToken, checkPermission('customer:list'), customerController.view360);

// 6. 导出客户列表
router.post('/export', authenticateToken, checkPermission('customer:list'), checkDataPermission('customer', 'owner_id'), validate(exportCustomersSchema), customerController.exportCustomers);

// 客户状态转化（复用 customerService）
router.post('/convert', authenticateToken, validate(convertCustomerSchema), customerController.convert);

module.exports = router;
module.exports.VALID_SOURCES = customerDetailService.VALID_SOURCES;
module.exports.SOURCE_PARENT_MAP = customerDetailService.SOURCE_PARENT_MAP;
module.exports.canManageCustomer = (user, ownerId) => customerDetailService.canManageCustomer(pool, user, ownerId);

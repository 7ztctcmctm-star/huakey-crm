const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission, checkFieldPermission } = require('../middleware/permission');
const quoteController = require('../controllers/quoteController');
const { validate, Joi } = require('../middleware/validate');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: 报价管理
 *     description: 报价单列表、创建、修改、删除、详情、转合同、审批
 *
 * /api/quote/list:
 *   post:
 *     summary: 获取报价单列表
 *     tags: [报价管理]
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
 *               quote_no: { type: string }
 *               customer_name: { type: string }
 *               status: { type: integer, enum: [1, 2, 3, 4] }
 *               approval_status: { type: integer, enum: [1, 2, 3] }
 *     responses:
 *       200:
 *         description: 报价单列表
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
 * /api/quote/add:
 *   post:
 *     summary: 创建报价单
 *     tags: [报价管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customer_id: { type: integer }
 *               opportunity_id: { type: integer }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product_id: { type: integer }
 *                     quantity: { type: integer, minimum: 1 }
 *                     unit_price: { type: number, minimum: 0 }
 *                     remark: { type: string }
 *               discount: { type: number, minimum: 0, maximum: 1 }
 *               valid_days: { type: integer, minimum: 1 }
 *               remark: { type: string }
 *               currency: { type: string }
 *               exchange_rate: { type: number, minimum: 0 }
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
 * /api/quote/detail/{id}:
 *   get:
 *     summary: 获取报价单详情
 *     tags: [报价管理]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 报价单详情
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string }
 *                 data: { type: object }
 *       401: { description: 未登录或 token 过期 }
 *       403: { description: 无权限访问 }
 *       404: { description: 报价单不存在 }
 *       500: { description: 服务器内部错误 }
 *
 * /api/quote/update:
 *   post:
 *     summary: 修改报价单
 *     tags: [报价管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id: { type: integer, example: 1 }
 *               customer_id: { type: integer }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product_id: { type: integer }
 *                     quantity: { type: integer, minimum: 1 }
 *                     unit_price: { type: number, minimum: 0 }
 *                     remark: { type: string }
 *               discount: { type: number, minimum: 0, maximum: 1 }
 *               valid_days: { type: integer, minimum: 1 }
 *               remark: { type: string }
 *               status: { type: integer, enum: [1, 2, 3, 4] }
 *     responses:
 *       200:
 *         description: 修改成功
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
 * /api/quote/delete:
 *   post:
 *     summary: 删除报价单
 *     tags: [报价管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: 删除成功
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
 * /api/quote/to-contract:
 *   post:
 *     summary: 报价单转合同
 *     tags: [报价管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: 转合同成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string }
 *                 data: { type: object }
 *       400: { description: 参数错误或报价单状态不允许转换 }
 *       401: { description: 未登录或 token 过期 }
 *       403: { description: 无权限访问 }
 *       500: { description: 服务器内部错误 }
 *
 * /api/quote/approve:
 *   post:
 *     summary: 审批报价单（仅管理员）
 *     tags: [报价管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, approval_status]
 *             properties:
 *               id: { type: integer, example: 1 }
 *               approval_status: { type: integer, enum: [2, 3], description: '2=通过,3=驳回' }
 *               approval_remark: { type: string }
 *     responses:
 *       200:
 *         description: 审批完成
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
 *       403: { description: 无权限审批 }
 *       500: { description: 服务器内部错误 }
 */

// Joi schemas
const quoteItemSchema = Joi.object({
  product_id: Joi.number().integer().positive().required(),
  quantity: Joi.number().integer().min(1).optional(),
  unit_price: Joi.number().min(0).optional(),
  remark: Joi.string().max(500).allow('', null)
});

const addQuoteSchema = Joi.object({
  customer_id: Joi.number().integer().positive().optional(),
  opportunity_id: Joi.number().integer().positive().allow(null),
  items: Joi.array().items(quoteItemSchema).optional(),
  discount: Joi.number().min(0).max(1).optional(),
  valid_days: Joi.number().integer().min(1).optional(),
  remark: Joi.string().max(2000).allow('', null),
  currency: Joi.string().max(10).optional(),
  exchange_rate: Joi.number().min(0).optional()
});

const listQuoteSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).optional(),
  quote_no: Joi.string().max(100).allow('', null),
  customer_name: Joi.string().max(200).allow('', null),
  status: Joi.number().integer().valid(1, 2, 3, 4).allow('', null),
  approval_status: Joi.number().integer().valid(1, 2, 3).allow('', null)
});

const updateQuoteSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  customer_id: Joi.number().integer().positive().optional(),
  items: Joi.array().items(quoteItemSchema).min(1).optional(),
  discount: Joi.number().min(0).max(1).optional(),
  valid_days: Joi.number().integer().min(1).optional(),
  remark: Joi.string().max(2000).allow('', null),
  status: Joi.number().integer().valid(1, 2, 3, 4).optional()
});

const idOnlySchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const approveQuoteSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  approval_status: Joi.number().integer().valid(2, 3).required(),
  approval_remark: Joi.string().max(1000).allow('', null)
});

// 字段级权限：报价成本价仅管理员可见
router.use(checkFieldPermission('quote'));

// 1. 创建报价单
router.post('/add', authenticateToken, checkPermission('quotation:add'), validate(addQuoteSchema), quoteController.add);

// 2. 报价单列表
router.post('/list', authenticateToken, checkPermission('quotation'), checkDataPermission('quote', 'create_by'), validate(listQuoteSchema), quoteController.list);

// 3. 报价单详情
router.get('/detail/:id', authenticateToken, checkDataPermission('quote', 'create_by'), quoteController.detail);

// 4. 修改报价单
router.post('/update', authenticateToken, checkPermission('quotation:edit'), validate(updateQuoteSchema), quoteController.update);

// 5. 删除报价单
router.post('/delete', authenticateToken, checkPermission('quotation:delete'), validate(idOnlySchema), quoteController.remove);

// 6. 报价转合同
router.post('/to-contract', authenticateToken, checkPermission('quotation:edit'), validate(idOnlySchema), quoteController.toContract);

// 审批报价单（仅管理员）
router.post('/approve', authenticateToken, validate(approveQuoteSchema), quoteController.approve);

module.exports = router;

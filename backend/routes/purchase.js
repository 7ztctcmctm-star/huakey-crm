const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission, buildDataPermissionWhere, checkFieldPermission, stripRestrictedFields } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const { createRouteLogger } = require('../middleware/logger');
const purchaseService = require('../services/purchaseService');
const logger = require('../config/logger');

const MODULE_NAME = '采购管理';

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  keyword: Joi.string().max(200).allow('', null),
  status: Joi.string().valid('草稿', '待审核', '已确认', '部分收货', '已完成', '已取消').allow('', null),
  type: Joi.string().valid('常规', '紧急', '样品', '返修').allow('', null),
  supplier_id: Joi.number().integer().positive().allow(null)
});

const addOrderSchema = Joi.object({
  supplier_id: Joi.number().integer().positive().required(),
  title: Joi.string().required().max(200),
  type: Joi.string().valid('常规', '紧急', '样品', '返修').default('常规'),
  expected_date: Joi.date().iso().allow(null),
  payment_terms: Joi.string().max(200).allow('', null),
  delivery_address: Joi.string().max(500).allow('', null),
  remark: Joi.string().max(2000).allow('', null),
  items: Joi.array().items(Joi.object({
    product_name: Joi.string().required().max(200),
    product_spec: Joi.string().max(200).allow('', null),
    unit: Joi.string().max(20).default('个'),
    quantity: Joi.number().precision(3).min(0.001).required(),
    unit_price: Joi.number().precision(4).min(0).required(),
    discount_rate: Joi.number().precision(2).min(0).max(200).default(0),
    remark: Joi.string().max(500).allow('', null)
  })).min(1).required()
});

const updateOrderStatusSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  status: Joi.string().valid('待审核', '已确认', '部分收货', '已完成', '已取消').required(),
  approveRemark: Joi.string().max(500).allow('', null)
});

const addReceiptSchema = Joi.object({
  order_id: Joi.number().integer().positive().required(),
  item_id: Joi.number().integer().positive().required(),
  quantity: Joi.number().precision(3).min(0.001).required(),
  quality_check: Joi.number().integer().valid(0, 1).default(1),
  quality_result: Joi.string().valid('合格', '不合格', '待检').default('待检'),
  defect_desc: Joi.string().max(500).allow('', null),
  warehouse: Joi.string().max(200).allow('', null),
  remark: Joi.string().max(500).allow('', null)
});

const addPaymentSchema = Joi.object({
  order_id: Joi.number().integer().positive().required(),
  amount: Joi.number().precision(2).min(0.01).required(),
  pay_method: Joi.string().max(50).allow('', null),
  pay_date: Joi.date().iso().allow(null),
  remark: Joi.string().max(500).allow('', null)
});

const logAction = createRouteLogger(MODULE_NAME);

/**
 * @swagger
 * tags:
 *   - name: 采购管理
 *     description: 采购单列表、创建、详情、状态更新、收货、付款、统计
 *
 * /api/purchase/list:
 *   post:
 *     summary: 获取采购单列表
 *     tags: [采购管理]
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
 *               keyword: { type: string }
 *               status: { type: string, enum: [草稿, 待审核, 已确认, 部分收货, 已完成, 已取消] }
 *               type: { type: string, enum: [常规, 紧急, 样品, 返修] }
 *               supplier_id: { type: integer }
 *     responses:
 *       200:
 *         description: 采购单列表
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
 * /api/purchase/add:
 *   post:
 *     summary: 创建采购单
 *     tags: [采购管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [supplier_id, title, items]
 *             properties:
 *               supplier_id: { type: integer, example: 1 }
 *               title: { type: string, example: 示例采购单 }
 *               type: { type: string, enum: [常规, 紧急, 样品, 返修] }
 *               expected_date: { type: string, format: date }
 *               payment_terms: { type: string }
 *               delivery_address: { type: string }
 *               remark: { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product_name: { type: string }
 *                     product_spec: { type: string }
 *                     unit: { type: string }
 *                     quantity: { type: number, minimum: 0.001 }
 *                     unit_price: { type: number, minimum: 0 }
 *                     discount_rate: { type: number }
 *                     remark: { type: string }
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
 * /api/purchase/detail/{id}:
 *   get:
 *     summary: 获取采购单详情
 *     tags: [采购管理]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 采购单详情
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
 *       404: { description: 采购单不存在 }
 *       500: { description: 服务器内部错误 }
 *
 * /api/purchase/update-status:
 *   post:
 *     summary: 更新采购单状态
 *     tags: [采购管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, status]
 *             properties:
 *               id: { type: integer, example: 1 }
 *               status: { type: string, enum: [待审核, 已确认, 部分收货, 已完成, 已取消] }
 *               approveRemark: { type: string }
 *     responses:
 *       200:
 *         description: 状态更新成功
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
 * /api/purchase/receipt/add:
 *   post:
 *     summary: 添加收货/入库记录
 *     tags: [采购管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [order_id, item_id, quantity]
 *             properties:
 *               order_id: { type: integer, example: 1 }
 *               item_id: { type: integer, example: 1 }
 *               quantity: { type: number, minimum: 0.001, example: 100 }
 *               quality_check: { type: integer, enum: [0, 1] }
 *               quality_result: { type: string, enum: [合格, 不合格, 待检] }
 *               defect_desc: { type: string }
 *               warehouse: { type: string }
 *               remark: { type: string }
 *     responses:
 *       200:
 *         description: 入库记录成功
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
 * /api/purchase/payment/add:
 *   post:
 *     summary: 添加付款记录
 *     tags: [采购管理]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [order_id, amount]
 *             properties:
 *               order_id: { type: integer, example: 1 }
 *               amount: { type: number, minimum: 0.01, example: 10000.00 }
 *               pay_method: { type: string }
 *               pay_date: { type: string, format: date }
 *               remark: { type: string }
 *     responses:
 *       200:
 *         description: 付款登记成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string }
 *                 data: { type: object }
 *       400: { description: 参数错误或订单ID和金额不能为空 }
 *       401: { description: 未登录或 token 过期 }
 *       403: { description: 无权限访问 }
 *       500: { description: 服务器内部错误 }
 *
 * /api/purchase/statistics:
 *   get:
 *     summary: 采购统计
 *     tags: [采购管理]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 采购统计数据
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
 *       500: { description: 服务器内部错误 }
 */

// 字段级权限：采购明细单价/金额仅管理员可见
router.use(checkFieldPermission('purchase_item'));

router.post('/list', authenticateToken, checkPermission('purchase'), checkDataPermission('purchase', 'owner_id'), validate(listSchema), async (req, res, next) => {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'po');
    const result = await purchaseService.listPurchases(pool, req.body, { clause, params: permParams });
    result.list = stripRestrictedFields(result.list, req.restrictedFields);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[采购] 采购列表错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.get('/detail/:id', authenticateToken, checkDataPermission('purchase', 'owner_id'), async (req, res, next) => {
  try {
    const { clause, params: permParams } = await buildDataPermissionWhere(req.dataPermission, 'po');
    const data = await purchaseService.getPurchase(pool, req.params.id, { clause, params: permParams });
    if (!data) return res.status(404).json({ code: 404, message: '采购单不存在', data: null });
    if (data.items) {
      stripRestrictedFields(data.items, req.restrictedFields);
    }
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[采购] 采购详情错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.post('/add', authenticateToken, checkPermission('purchase:add'), validate(addOrderSchema), async (req, res, next) => {
  try {
    const result = await purchaseService.createPurchase(pool, req.body, req.user.userId);
    await logAction(req, 'add', `创建采购单: ${result.order_no} - ${req.body.title}`);
    res.json({ code: 200, message: '创建采购单成功', data: result });
  } catch (error) {
    logger.error('[采购] 添加采购单错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.post('/update-status', authenticateToken, checkPermission('purchase:add'), validate(updateOrderStatusSchema), async (req, res, next) => {
  try {
    const { id, status, approveRemark } = req.body;
    await purchaseService.updateStatus(pool, id, status, approveRemark);
    await logAction(req, 'update-status', `更新采购单状态: ID=${id} → ${status}`);
    res.json({ code: 200, message: '状态更新成功', data: null });
  } catch (error) {
    logger.error('[采购] 更新状态错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.post('/receipt/add', authenticateToken, checkPermission('purchase:add'), validate(addReceiptSchema), async (req, res, next) => {
  try {
    const result = await purchaseService.addReceipt(pool, req.body, req.user.userId);
    await logAction(req, 'receipt', `入库记录: ${result.receipt_no}, 数量=${req.body.quantity}`);
    res.json({ code: 200, message: '入库记录成功', data: result });
  } catch (error) {
    logger.error('[采购] 添加收货错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.get('/statistics', authenticateToken, async (req, res, next) => {
  try {
    const data = await purchaseService.getStatistics(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[采购] 统计错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.post('/payment/add', authenticateToken, checkPermission('purchase:add'), validate(addPaymentSchema), async (req, res, next) => {
  try {
    const { order_id, amount } = req.body;
    if (!order_id || !amount) {
      return res.status(400).json({ code: 400, message: '订单ID和金额不能为空', data: null });
    }
    const result = await purchaseService.addPayment(pool, req.body, req.user.userId);
    if (result.error) return res.status(result.code).json({ code: result.code, message: result.error, data: null });
    res.json({ code: 200, message: '付款登记成功', data: result });
  } catch (error) {
    logger.error('[采购] 添加付款错误:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

module.exports = router;

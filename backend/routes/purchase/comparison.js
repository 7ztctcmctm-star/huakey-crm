/**
 * 采购比价路由
 * 路径前缀: /api/purchase/comparison
 */

const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { validate, Joi } = require('../../middleware/validate');
const purchaseComparisonService = require('../../services/purchaseComparisonService');
const logger = require('../../config/logger');

const MODULE_NAME = '采购比价';

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  status: Joi.string().valid('draft', 'completed', 'cancelled').allow('', null),
  keyword: Joi.string().max(200).allow('', null)
});

const createSchema = Joi.object({
  request_id: Joi.number().integer().allow(null),
  title: Joi.string().max(200).required(),
  product_name: Joi.string().max(200).allow('', null),
  quantity: Joi.number().precision(2).min(0).allow(null),
  unit: Joi.string().max(20).allow('', null)
});

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const quoteSchema = Joi.object({
  supplier_id: Joi.number().integer().positive().required(),
  unit_price: Joi.number().precision(2).min(0).allow(null),
  total_price: Joi.number().precision(2).min(0).allow(null),
  delivery_days: Joi.number().integer().min(0).allow(null),
  payment_terms: Joi.string().max(200).allow('', null),
  remark: Joi.string().max(1000).allow('', null)
});

const selectSchema = Joi.object({
  supplier_id: Joi.number().integer().positive().allow(null)
});

function handleServiceError(res, error) {
  logger.error(`[${MODULE_NAME}]`, { error: error.stack || error.message });
  const statusCode = error.code || 500;
  const message = error.message || '操作失败';
  res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
    code: statusCode,
    message,
    data: null
  });
}

// 比价单列表
router.post('/list', authenticateToken, validate(listSchema), async (req, res) => {
  try {
    const data = await purchaseComparisonService.listComparisons(pool, req.body);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// 创建比价单
router.post('/create', authenticateToken, validate(createSchema), async (req, res) => {
  try {
    const data = await purchaseComparisonService.createComparison(pool, req.body, req.user.userId);
    res.status(201).json({ code: 201, message: '创建成功', data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// 比价单详情
router.get('/detail/:id', authenticateToken, validate(idParamSchema, 'params'), async (req, res) => {
  try {
    const data = await purchaseComparisonService.getComparisonDetail(pool, req.params.id);
    if (!data) {
      return res.status(404).json({ code: 404, message: '比价单不存在', data: null });
    }
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// 添加供应商报价
router.post('/:id/add-quote', authenticateToken, validate(idParamSchema, 'params'), validate(quoteSchema), async (req, res) => {
  try {
    const data = await purchaseComparisonService.addSupplierQuote(pool, req.params.id, req.body);
    res.json({ code: 200, message: '报价已添加', data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// 选择供应商
router.post('/:id/select-supplier', authenticateToken, validate(idParamSchema, 'params'), validate(selectSchema), async (req, res) => {
  try {
    const data = await purchaseComparisonService.selectSupplier(pool, req.params.id, req.body.supplier_id);
    res.json({ code: 200, message: '供应商已选定', data });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// 取消比价单
router.post('/:id/cancel', authenticateToken, validate(idParamSchema, 'params'), async (req, res) => {
  try {
    await purchaseComparisonService.cancelComparison(pool, req.params.id);
    res.json({ code: 200, message: '已取消', data: null });
  } catch (error) {
    handleServiceError(res, error);
  }
});

module.exports = router;

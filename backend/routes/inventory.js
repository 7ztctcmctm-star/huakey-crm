const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, queryValidate, Joi } = require('../middleware/validate');
const inventoryService = require('../services/inventoryService');
const logger = require('../config/logger');

const inventoryListSchema = Joi.object({
  category: Joi.string().allow('').optional(),
  keyword: Joi.string().allow('').optional().max(100),
  stock_status: Joi.string().valid('low', 'high', 'normal', '').allow('').optional(),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(20)
});

const movementsSchema = Joi.object({
  product_id: Joi.number().integer().positive().allow('', null).optional(),
  movement_type: Joi.string().valid('in', 'out', 'adjust', '').allow('').optional(),
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null).optional(),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null).optional(),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(20)
});

const stockInSchema = Joi.object({
  product_id: Joi.number().integer().positive().required(),
  quantity: Joi.number().integer().min(1).required(),
  remark: Joi.string().max(500).allow('', null)
});

const stockOutSchema = Joi.object({
  product_id: Joi.number().integer().positive().required(),
  quantity: Joi.number().integer().min(1).required(),
  remark: Joi.string().max(500).allow('', null)
});

const stockAdjustSchema = Joi.object({
  product_id: Joi.number().integer().positive().required(),
  new_qty: Joi.number().integer().min(0).required(),
  remark: Joi.string().max(500).allow('', null)
});

// 库存列表
router.get('/list', authenticateToken, queryValidate(inventoryListSchema), async (req, res) => {
  try {
    const data = await inventoryService.listInventory(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[库存] 列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 库存变动记录
router.get('/movements', authenticateToken, queryValidate(movementsSchema), async (req, res) => {
  try {
    const data = await inventoryService.getMovements(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[库存] 变动记录查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 入库
router.post('/in', authenticateToken, checkPermission('purchase:add'), validate(stockInSchema), async (req, res) => {
  try {
    const result = await inventoryService.stockIn(pool, req.body, req.user.userId);
    if (result.error) return res.status(result.status).json({ code: result.status, message: result.message, data: null });
    res.json({ code: 200, message: '入库成功', data: result });
  } catch (error) {
    logger.error('[库存] 入库失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 出库
router.post('/out', authenticateToken, checkPermission('purchase:add'), validate(stockOutSchema), async (req, res) => {
  try {
    const result = await inventoryService.stockOut(pool, req.body, req.user.userId);
    if (result.error) return res.status(result.status).json({ code: result.status, message: result.message, data: null });
    res.json({ code: 200, message: '出库成功', data: result });
  } catch (error) {
    logger.error('[库存] 出库失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 库存调整（盘点）
router.post('/adjust', authenticateToken, checkPermission('purchase:add'), validate(stockAdjustSchema), async (req, res) => {
  try {
    const result = await inventoryService.adjustStock(pool, req.body, req.user.userId);
    if (result.error) return res.status(result.status).json({ code: result.status, message: result.message, data: null });
    res.json({ code: 200, message: '调整成功', data: result });
  } catch (error) {
    logger.error('[库存] 调整失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 库存预警列表
router.get('/alerts', authenticateToken, async (req, res) => {
  try {
    const rows = await inventoryService.getAlerts(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[库存] 预警查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 配置预警阈值
router.put('/alert-config/:product_id', authenticateToken, async (req, res) => {
  try {
    const result = await inventoryService.updateAlertConfig(pool, req.params.product_id, req.body);
    if (result.error) return res.status(result.status).json({ code: result.status, message: result.message, data: null });
    res.json({ code: 200, message: '配置成功', data: null });
  } catch (error) {
    logger.error('[库存] 预警配置失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 库存统计
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const data = await inventoryService.getStats(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[库存] 统计查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 产品分类列表
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const data = await inventoryService.getCategories(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[库存] 分类查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

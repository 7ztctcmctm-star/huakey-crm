const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const requireAdmin = require('../middleware/admin');
const purchaseService = require('../services/purchaseService');
const logger = require('../config/logger');

const planItemSchema = Joi.object({
  product_id: Joi.number().integer().positive().required(),
  supplier_id: Joi.number().integer().positive().allow(null),
  quantity: Joi.number().precision(3).min(0.001).required(),
  unit_price: Joi.number().precision(4).min(0).allow(null),
  reason: Joi.string().max(500).allow('', null)
});

const createPlanSchema = Joi.object({
  name: Joi.string().required().max(200).trim(),
  remark: Joi.string().max(2000).allow('', null),
  items: Joi.array().items(planItemSchema).min(1).required()
});

const updatePlanSchema = Joi.object({
  name: Joi.string().max(200).trim(),
  remark: Joi.string().max(2000).allow('', null),
  items: Joi.array().items(planItemSchema).min(1)
});

const emptyPlanActionSchema = Joi.object({});

const autoGenerateSchema = Joi.object({
  supplier_id: Joi.number().integer().positive().allow(null)
});

// 采购计划列表
router.get('/list', authenticateToken, async (req, res, next) => {
  try {
    const result = await purchaseService.listPlans(pool, req.query);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[采购计划] 列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 计划详情
router.get('/detail/:id', authenticateToken, async (req, res, next) => {
  try {
    const plan = await purchaseService.getPlan(pool, req.params.id);
    if (!plan) return res.status(404).json({ code: 404, message: '计划不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: plan });
  } catch (error) {
    logger.error('[采购计划] 详情查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 创建采购计划
router.post('/create', authenticateToken, checkPermission('purchase:add'), validate(createPlanSchema), async (req, res, next) => {
  try {
    const { name, remark, items } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ code: 400, message: '计划名称不能为空', data: null });
    if (!items || items.length === 0) return res.status(400).json({ code: 400, message: '至少需要一个计划明细', data: null });

    const result = await purchaseService.createPlan(pool, { name, remark, items }, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[采购计划] 创建失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 更新计划
router.put('/:id', authenticateToken, validate(updatePlanSchema), async (req, res, next) => {
  try {
    const result = await purchaseService.updatePlan(pool, req.params.id, req.body);
    if (result.error) return res.status(result.code).json({ code: result.code, message: result.error, data: null });
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[采购计划] 更新失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 删除计划
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const result = await purchaseService.deletePlan(pool, req.params.id);
    if (result.error) return res.status(result.code).json({ code: result.code, message: result.error, data: null });
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[采购计划] 删除失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 提交审批
router.post('/:id/submit', authenticateToken, validate(emptyPlanActionSchema), async (req, res, next) => {
  try {
    const result = await purchaseService.submitPlan(pool, req.params.id);
    if (result.error) return res.status(result.code).json({ code: result.code, message: result.error, data: null });
    res.json({ code: 200, message: '已提交审批', data: null });
  } catch (error) {
    logger.error('[采购计划] 提交失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 批准计划
router.post('/:id/approve', authenticateToken, requireAdmin, validate(emptyPlanActionSchema), async (req, res, next) => {
  try {
    const result = await purchaseService.approvePlan(pool, req.params.id, req.user.userId);
    if (result.error) return res.status(result.code).json({ code: result.code, message: result.error, data: null });
    res.json({ code: 200, message: '已批准', data: null });
  } catch (error) {
    logger.error('[采购计划] 批准失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 自动生成采购计划（根据库存预警）
router.post('/auto-generate', authenticateToken, requireAdmin, validate(autoGenerateSchema), async (req, res, next) => {
  try {
    const result = await purchaseService.autoGenerate(pool, req.user.userId, req.body.supplier_id || null);
    if (result.empty) return res.json({ code: 200, message: '没有库存偏低的产品', data: null });
    res.json({ code: 200, message: '自动生成成功', data: result });
  } catch (error) {
    logger.error('[采购计划] 自动生成失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 统计
router.get('/stats', authenticateToken, async (req, res, next) => {
  try {
    const data = await purchaseService.getPlanStats(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[采购计划] 统计查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 采购计划转采购单
router.post('/:id/convert-to-purchase', authenticateToken, validate(emptyPlanActionSchema), async (req, res, next) => {
  try {
    const result = await purchaseService.convertToPurchase(pool, req.params.id, req.user.userId);
    if (result.error) return res.status(result.code).json({ code: result.code, message: result.error, data: null });
    res.json({ code: 200, message: `已生成 ${result.order_ids.length} 张采购单`, data: { order_ids: result.order_ids } });
  } catch (error) {
    logger.error('[采购计划] 转采购单失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

module.exports = router;

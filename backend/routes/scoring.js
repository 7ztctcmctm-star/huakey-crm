const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

const requireAdmin = require('../middleware/admin');
const { requireManager } = require('../middleware/admin');

const scoringService = require('../services/scoringRouteService');
const supplierScoringService = require('../services/supplierScoringService');
const logger = require('../config/logger');
const { validate, Joi } = require('../middleware/validate');

const ruleSchema = Joi.object({
  name: Joi.string().required().max(100),
  condition_type: Joi.string().valid('source', 'action', 'interaction').optional(),
  condition_field: Joi.string().max(50).allow('', null),
  condition_operator: Joi.string().valid('eq', 'gt', 'lt', 'contains').optional(),
  condition_value: Joi.string().max(200).allow('', null),
  score: Joi.number().integer().required()
});

const ruleUpdateSchema = Joi.object({
  name: Joi.string().max(100).optional(),
  condition_type: Joi.string().valid('source', 'action', 'interaction').optional(),
  condition_field: Joi.string().max(50).allow('', null),
  condition_operator: Joi.string().valid('eq', 'gt', 'lt', 'contains').optional(),
  condition_value: Joi.string().max(200).allow('', null),
  score: Joi.number().integer().optional(),
  status: Joi.number().integer().valid(0, 1).optional()
});

const emptySchema = Joi.object({});

// 获取所有评分规则
router.get('/rules', authenticateToken, checkPermission('scoring'), async (req, res) => {
  try {
    const rows = await scoringService.getRules(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[评分] 获取规则失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建评分规则
router.post('/rules', authenticateToken, checkPermission('scoring'), requireAdmin, validate(ruleSchema), async (req, res) => {
  try {
    const { name, score } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '规则名称不能为空', data: null });
    }
    if (score === undefined || score === null) {
      return res.status(400).json({ code: 400, message: '分数不能为空', data: null });
    }

    const result = await scoringService.createRule(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[评分] 创建规则失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新评分规则
router.put('/rules/:id', authenticateToken, checkPermission('scoring'), requireAdmin, validate(ruleUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    await scoringService.updateRule(pool, id, req.body);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    next(error);
  }
});

// 删除评分规则
router.delete('/rules/:id', authenticateToken, checkPermission('scoring'), requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await scoringService.deleteRule(pool, id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    next(error);
  }
});

// 计算单个客户评分
router.post('/calculate/:customerId', authenticateToken, checkPermission('scoring'), requireManager, validate(emptySchema), async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const data = await scoringService.calculateScore(pool, customerId);
    res.json({ code: 200, message: '评分计算完成', data });
  } catch (error) {
    next(error);
  }
});

// 批量计算所有客户评分
router.post('/batch-calculate', authenticateToken, checkPermission('scoring'), requireAdmin, validate(emptySchema), async (req, res, next) => {
  try {
    const result = await scoringService.batchCalculate(pool);
    res.json({ code: 200, message: '批量评分完成', data: result });
  } catch (error) {
    next(error);
  }
});

// 评分排行榜
router.get('/ranking', authenticateToken, checkPermission('scoring'), async (req, res, next) => {
  try {
    const rows = await scoringService.getRanking(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    next(error);
  }
});

// 获取客户评分详情（含评分历史）
router.get('/customer/:customerId', authenticateToken, checkPermission('scoring'), async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const data = await scoringService.getCustomerScore(pool, customerId);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    next(error);
  }
});

/* ===================== 供应商评分（评分统一，Prompt 4-5） ===================== */
/* 客户评分使用 crm_score_rule，供应商评分使用 crm_scoring_rule + crm_supplier_rating，
   两张表保持独立；此处统一挂载在 /scoring 模块下，共享 scoring 权限。 */

// 获取供应商评分规则（crm_scoring_rule）
router.get('/supplier/rules', authenticateToken, checkPermission('scoring'), async (req, res) => {
  try {
    const rows = await supplierScoringService.getSupplierRules(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[评分] 获取供应商评分规则失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 计算单个供应商评分
router.post('/supplier/calculate/:id', authenticateToken, checkPermission('scoring'), requireManager, validate(emptySchema), async (req, res) => {
  try {
    const { id } = req.params;
    const data = await supplierScoringService.calculateSupplierScore(pool, parseInt(id, 10));
    if (!data) {
      return res.status(404).json({ code: 404, message: '供应商不存在或无启用评分规则', data: null });
    }
    res.json({ code: 200, message: '供应商评分计算完成', data });
  } catch (error) {
    logger.error('[评分] 计算供应商评分失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 获取供应商最新评分
router.get('/supplier/rating/:id', authenticateToken, checkPermission('scoring'), async (req, res) => {
  try {
    const { id } = req.params;
    const data = await supplierScoringService.getSupplierRating(pool, parseInt(id, 10));
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[评分] 获取供应商评分失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 批量计算所有供应商评分
router.post('/supplier/batch', authenticateToken, checkPermission('scoring'), requireAdmin, validate(emptySchema), async (req, res) => {
  try {
    const result = await supplierScoringService.checkAllSuppliersScores(pool);
    res.json({ code: 200, message: '供应商批量评分完成', data: result });
  } catch (error) {
    logger.error('[评分] 供应商批量评分失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

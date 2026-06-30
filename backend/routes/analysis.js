const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { requireManager } = require('../middleware/admin');
const { queryValidate, Joi } = require('../middleware/validate');
const analysisService = require('../services/analysisService');
const logger = require('../config/logger');

const churnAlertSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(20)
});

const enhancedPredictionSchema = Joi.object({
  months_ahead: Joi.number().integer().min(1).max(12).default(3)
});

// 1. 销售预测（仅管理员/经理�?
router.get('/prediction', authenticateToken, checkPermission('analysis'), requireManager, async (req, res) => {
  try {
    const data = await analysisService.getPrediction(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] 销售预测错�?', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 2. 客户流失预警
router.get('/churn-alert', authenticateToken, checkPermission('analysis'), requireManager, queryValidate(churnAlertSchema), async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const data = await analysisService.getChurnAlert(pool, { page, pageSize });
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] 流失预警错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 3. 异常检�?
router.get('/anomaly', authenticateToken, checkPermission('analysis'), requireManager, async (req, res) => {
  try {
    const data = await analysisService.getAnomaly(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] 异常检测错�?', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 4. 客户评分
router.get('/customer-score/:id', authenticateToken, checkPermission('analysis'), requireManager, async (req, res) => {
  try {
    const data = await analysisService.getCustomerScore(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] 客户评分错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 5. 赢单率分�?
router.get('/win-rate', authenticateToken, checkPermission('analysis'), requireManager, async (req, res) => {
  try {
    const data = await analysisService.getWinRate(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] 赢单率分析错�?', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 6. 销售漏�?
router.get('/funnel', authenticateToken, checkPermission('analysis'), requireManager, async (req, res) => {
  try {
    const data = await analysisService.getFunnel(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] 销售漏斗错�?', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 7. 客户价值评�?RFM
router.get('/rfm', authenticateToken, checkPermission('analysis'), requireManager, async (req, res) => {
  try {
    const data = await analysisService.getRFM(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] RFM评分错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 8. 销售排行榜
router.get('/ranking', authenticateToken, checkPermission('analysis'), requireManager, async (req, res) => {
  try {
    const data = await analysisService.getRanking(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] 销售排行榜错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// ============ 增强版销售预�?============

router.get('/prediction/enhanced', authenticateToken, checkPermission('analysis'), requireManager, queryValidate(enhancedPredictionSchema), async (req, res) => {
  try {
    const monthsAhead = parseInt(req.query.months_ahead) || 3;
    const data = await analysisService.getEnhancedPrediction(pool, monthsAhead);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[分析] 增强预测失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错�?, data: null });
  }
});

// ============ 增强版智能建�?============

router.get('/suggestions/enhanced', authenticateToken, checkPermission('analysis'), requireManager, async (req, res) => {
  try {
    const data = await analysisService.getEnhancedSuggestions(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[分析] 增强建议失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错�?, data: null });
  }
});

module.exports = router;

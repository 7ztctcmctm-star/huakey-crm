/**
 * Sales Analytics API (Phase 5.5.2)
 * 统一销售分析查询接口
 * 权限: 复用 RBAC (sales=owner / manager=dept / admin=all)
 */
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const salesAnalyticsService = require('../services/salesAnalyticsService');
const logger = require('../config/logger');

// GET /api/v1/analytics/sales/overview
router.get('/sales/overview', authenticateToken, async (req, res, next) => {
  try {
    const data = await salesAnalyticsService.getOverview(pool, req.user);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[Analytics] overview 失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// GET /api/v1/analytics/sales/funnel
router.get('/sales/funnel', authenticateToken, async (req, res, next) => {
  try {
    const data = await salesAnalyticsService.getSalesFunnel(pool, req.user);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[Analytics] funnel 失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// GET /api/v1/analytics/contract/revenue
router.get('/contract/revenue', authenticateToken, async (req, res, next) => {
  try {
    const data = await salesAnalyticsService.getContractRevenue(pool, req.user);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[Analytics] revenue 失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// GET /api/v1/analytics/payment/collection
router.get('/payment/collection', authenticateToken, async (req, res, next) => {
  try {
    const data = await salesAnalyticsService.getPaymentCollection(pool, req.user);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[Analytics] collection 失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

module.exports = router;

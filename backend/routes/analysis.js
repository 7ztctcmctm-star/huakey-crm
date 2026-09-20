const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission } = require('../middleware/permission');
const { queryValidate, Joi } = require('../middleware/validate');
const analysisService = require('../services/analysisService');
const logger = require('../config/logger');

/**
 * [数据范围修复 2026-09-20] 移除 requireManager。
 *
 * 原实现对所有端点套 `requireManager`，而 `middleware/admin.js` 的 requireManager 只放行
 * `manageAll || ADMIN_ROLE_CODES(super_admin，遗留 code) || roleId === 1(boss)`——
 * 部门经理（roleCode='manager'，`manage_all=0`）**会被 403**，而 manager 恰恰是
 * `scripts/init_role_permissions.js` 里被授予 `analysis` 权限的角色之一（boss + manager），
 * 且前端 Sidebar/路由对它可见 ⇒ 出现「菜单可见、点开全 403，提示『需要管理员或经理权限』」。
 *
 * 现改为「checkPermission('analysis') 控功能入口 + checkDataPermission('analysis') 控数据范围」，
 * 与报表域（routes/report/analytics.js）完全一致：boss(manageAll)→all，
 * manager→dept_and_sub（新增于 DATA_PERMISSIONS），缺省 self。
 */

const churnAlertSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(20)
});

const enhancedPredictionSchema = Joi.object({
  months_ahead: Joi.number().integer().min(1).max(12).default(3)
});

// 1. 销售预测
router.get('/prediction', authenticateToken, checkPermission('analysis'), checkDataPermission('analysis'), async (req, res, next) => {
  try {
    const data = await analysisService.getPrediction(pool, req.dataPermission);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] 销售预测错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 2. 客户流失预警
router.get('/churn-alert', authenticateToken, checkPermission('analysis'), checkDataPermission('analysis'), queryValidate(churnAlertSchema), async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const data = await analysisService.getChurnAlert(pool, { page, pageSize }, req.dataPermission);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] 流失预警错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 3. 异常检测
router.get('/anomaly', authenticateToken, checkPermission('analysis'), checkDataPermission('analysis'), async (req, res, next) => {
  try {
    const data = await analysisService.getAnomaly(pool, req.dataPermission);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] 异常检测错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 4. 客户评分
router.get('/customer-score/:id', authenticateToken, checkPermission('analysis'), checkDataPermission('analysis'), async (req, res, next) => {
  try {
    const data = await analysisService.getCustomerScore(pool, req.params.id, req.dataPermission);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] 客户评分错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 5. 赢单率分析
router.get('/win-rate', authenticateToken, checkPermission('analysis'), checkDataPermission('analysis'), async (req, res, next) => {
  try {
    const data = await analysisService.getWinRate(pool, req.dataPermission);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] 赢单率分析错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 6. 销售漏斗
router.get('/funnel', authenticateToken, checkPermission('analysis'), checkDataPermission('analysis'), async (req, res, next) => {
  try {
    const data = await analysisService.getFunnel(pool, req.dataPermission);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] 销售漏斗错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 7. 客户价值评分 RFM
router.get('/rfm', authenticateToken, checkPermission('analysis'), checkDataPermission('analysis'), async (req, res, next) => {
  try {
    const data = await analysisService.getRFM(pool, req.dataPermission);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] RFM评分错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 8. 销售排行榜
router.get('/ranking', authenticateToken, checkPermission('analysis'), checkDataPermission('analysis'), async (req, res, next) => {
  try {
    const data = await analysisService.getRanking(pool, req.dataPermission);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[数据分析] 销售排行榜错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// ============ 增强版销售预测 ============

router.get('/prediction/enhanced', authenticateToken, checkPermission('analysis'), checkDataPermission('analysis'), queryValidate(enhancedPredictionSchema), async (req, res, next) => {
  try {
    const monthsAhead = parseInt(req.query.months_ahead) || 3;
    const data = await analysisService.getEnhancedPrediction(pool, monthsAhead, req.dataPermission);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[分析] 增强预测失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// ============ 增强版智能建议 ============

router.get('/suggestions/enhanced', authenticateToken, checkPermission('analysis'), checkDataPermission('analysis'), async (req, res, next) => {
  try {
    const data = await analysisService.getEnhancedSuggestions(pool, req.dataPermission);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[分析] 增强建议失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

module.exports = router;

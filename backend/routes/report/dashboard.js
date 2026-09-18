const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission, checkDataPermission } = require('../../middleware/permission');
const { cache, createCache } = require('../../middleware/cache');
const dashboardService = require('../../services/dashboardService');
const pool = require('../../config/database');
const logger = require('../../config/logger');

// 概览数据（首页仪表盘）
// 数据范围：统一走 checkDataPermission('report')，由 service 按各表归属列构造子句
// （修复前 service 用硬编码 roleId 判权，与 sys_role.view_all/sys_data_permission 脱节）
router.get('/overview', authenticateToken, checkPermission('dashboard'), checkDataPermission('report'), createCache(600, (req) => `report:overview:${req.user.userId}:${JSON.stringify(req.query)}`), async (req, res, next) => {
  try {
    const data = await dashboardService.getOverview(pool, req.dataPermission, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 今日待办
router.get('/today-tasks', authenticateToken, checkPermission('dashboard'), checkDataPermission('report'), cache(30), async (req, res, next) => {
  try {
    const data = await dashboardService.getTodayTasks(pool, req.dataPermission);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 快捷操作统计
router.get('/quick-stats', authenticateToken, checkPermission('dashboard'), checkDataPermission('report'), cache(120), async (req, res, next) => {
  try {
    const data = await dashboardService.getQuickStats(pool, req.dataPermission, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 逾期统计（仪表盘用）
router.get('/team-members', authenticateToken, checkPermission('dashboard'), checkDataPermission('report'), cache(300), async (req, res, next) => {
  try {
    const data = await dashboardService.getTeamMembers(pool, req.dataPermission);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.get('/overdue-stats', authenticateToken, checkPermission('dashboard'), checkDataPermission('report'), async (req, res, next) => {
  try {
    const data = await dashboardService.getOverdueStats(pool, req.dataPermission, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

module.exports = router;

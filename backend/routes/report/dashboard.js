const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { cache } = require('../../middleware/cache');
const dashboardService = require('../../services/dashboardService');
const pool = require('../../config/database');
const logger = require('../../config/logger');

// 概览数据（首页仪表盘）
router.get('/overview', authenticateToken, checkPermission('report'), cache(300), async (req, res) => {
  try {
    const data = await dashboardService.getOverview(pool, req.user.userId, req.user.roleId);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 今日待办
router.get('/today-tasks', authenticateToken, checkPermission('report'), cache(30), async (req, res) => {
  try {
    const data = await dashboardService.getTodayTasks(pool, req.user.userId, req.user.roleId);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 快捷操作统计
router.get('/quick-stats', authenticateToken, checkPermission('report'), cache(120), async (req, res) => {
  try {
    const data = await dashboardService.getQuickStats(pool, req.user.userId, req.user.roleId);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 逾期统计（仪表盘用）
router.get('/overdue-stats', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const data = await dashboardService.getOverdueStats(pool, req.user.userId, req.user.roleId);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;

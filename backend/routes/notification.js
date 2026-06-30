const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const logger = require('../config/logger');

// 获取通知列表
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page, pageSize, unread_only } = req.query;
    const data = await notificationService.listNotifications(pool, userId, {
      page,
      pageSize,
      unread_only: unread_only === '1' || unread_only === 'true'
    });
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[通知] 列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 标记单条已读
router.post('/read/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ code: 400, message: '通知ID无效', data: null });
    }
    await notificationService.markAsRead(pool, id, req.user.userId);
    res.json({ code: 200, message: '已标记为已读', data: null });
  } catch (error) {
    logger.error('[通知] 标记已读失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 全部已读
router.post('/read-all', authenticateToken, async (req, res) => {
  try {
    const { affectedRows } = await notificationService.markAllAsRead(pool, req.user.userId);
    res.json({ code: 200, message: '全部已读', data: { affectedRows } });
  } catch (error) {
    logger.error('[通知] 全部已读失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

// 未读数
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const data = await notificationService.getUnreadCount(pool, req.user.userId);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[通知] 未读数查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;

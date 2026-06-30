const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const sseManager = require('../utils/sseManager');
const logger = require('../config/logger');

const router = express.Router();

/**
 * GET /api/v1/sse/notifications
 * SSE 实时通知流
 */
router.get('/notifications', authenticateToken, (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ code: 401, message: '未登录' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.write(':ok\n\n');

  sseManager.add(userId, res);

  logger.info(`[SSE] user ${userId} connected, total online: ${sseManager.getOnlineCount()}`);

  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n');
    } catch (e) {
      cleanup();
    }
  }, 30000);

  const cleanup = () => {
    clearInterval(heartbeat);
    sseManager.remove(userId, res);
    try {
      if (!res.writableEnded) res.end();
    } catch { /* ok */ }
    logger.info(`[SSE] user ${userId} disconnected, total online: ${sseManager.getOnlineCount()}`);
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);
  res.on('finish', cleanup);
});

module.exports = router;

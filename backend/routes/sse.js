const express = require('express');
const jwt = require('jsonwebtoken');
const sseManager = require('../utils/sseManager');
const logger = require('../config/logger');

const router = express.Router();

// SSE 专用轻量认证：EventSource 不支持自定义 Header，token 通过 query string 传递
function sseAuth(req, res, next) {
  const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ code: 401, message: '未提供访问令牌' });
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not configured');
    const decoded = jwt.verify(token, secret);
    // 映射 JWT payload 字段到 req.user（与 authenticateToken 一致）
    req.user = {
      id: decoded.userId,
      userId: decoded.userId,
      username: decoded.username,
      roleId: decoded.roleId,
      roleCode: decoded.roleCode,
      viewAll: decoded.viewAll,
      manageAll: decoded.manageAll
    };
    next();
  } catch {
    return res.status(401).json({ code: 401, message: '无效或过期的访问令牌' });
  }
}

/**
 * GET /api/v1/sse/notifications
 * SSE 实时通知流
 */
router.get('/notifications', sseAuth, (req, res) => {
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

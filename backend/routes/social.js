const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const socialService = require('../services/socialRouteService');
const logger = require('../config/logger');
const { validate, Joi } = require('../middleware/validate');

const socialRecordSchema = Joi.object({
  customer_id: Joi.number().integer().positive().allow(null),
  contact_id: Joi.number().integer().positive().allow(null),
  platform: Joi.string().required().max(50),
  direction: Joi.string().required().max(50),
  content: Joi.string().max(4000).allow('', null),
  attachment_url: Joi.string().max(500).allow('', null),
  message_time: Joi.date().iso().allow(null)
});

const socialRecordUpdateSchema = Joi.object({
  platform: Joi.string().max(50).optional(),
  direction: Joi.string().max(50).optional(),
  content: Joi.string().max(4000).allow('', null),
  attachment_url: Joi.string().max(500).allow('', null),
  message_time: Joi.date().iso().allow(null)
});

// 沟通记录列表
router.get('/records', authenticateToken, checkPermission('social'), async (req, res, next) => {
  try {
    const result = await socialService.listRecords(pool, req.query);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[社媒] 记录列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 创建沟通记录
router.post('/records', authenticateToken, checkPermission('social'), validate(socialRecordSchema), async (req, res, next) => {
  try {
    const result = await socialService.createRecord(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[社媒] 创建记录失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.status || error.httpStatus || error.code || 500;
    res.status(status).json({ code: status, message: error.message || '服务器内部错误', data: null });
  }
});

// 更新记录
router.put('/records/:id', authenticateToken, checkPermission('social'), validate(socialRecordUpdateSchema), async (req, res, next) => {
  try {
    await socialService.updateRecord(pool, req.params.id, req.body);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[社媒] 更新记录失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.status || error.httpStatus || error.code || 500;
    res.status(status).json({ code: status, message: error.message || '服务器内部错误', data: null });
  }
});

// 删除记录
router.delete('/records/:id', authenticateToken, checkPermission('social'), async (req, res, next) => {
  try {
    await socialService.deleteRecord(pool, req.params.id, req.user.userId, req.user.manageAll);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[社媒] 删除记录失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.status || error.httpStatus || error.code || 500;
    res.status(status).json({ code: status, message: error.message || '服务器内部错误', data: null });
  }
});

// 社媒统计
router.get('/stats', authenticateToken, checkPermission('social'), async (req, res, next) => {
  try {
    const result = await socialService.getStats(pool);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[社媒] 统计查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 客户社媒时间线
router.get('/customer/:id/timeline', authenticateToken, checkPermission('social'), async (req, res, next) => {
  try {
    const result = await socialService.getCustomerTimeline(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[社媒] 客户时间线查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

module.exports = router;

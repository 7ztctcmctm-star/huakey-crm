const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const calendarService = require('../services/calendarRouteService');
const logger = require('../config/logger');

// --- Joi schemas ---

const createEventSchema = Joi.object({
  title: Joi.string().required().max(200),
  event_type: Joi.string().valid('meeting', 'task', 'reminder', 'other').optional(),
  description: Joi.string().allow('', null).optional().max(1000),
  start_time: Joi.date().iso().required(),
  end_time: Joi.date().iso().allow(null).optional(),
  all_day: Joi.boolean().optional(),
  location: Joi.string().allow('', null).optional().max(200),
  customer_id: Joi.number().integer().allow(null).optional(),
  contact_id: Joi.number().integer().allow(null).optional(),
  related_type: Joi.string().optional().max(50),
  related_id: Joi.number().integer().allow(null).optional(),
  attendees: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional(),
  reminder_minutes: Joi.number().integer().optional(),
  color: Joi.string().optional().max(50)
});

const updateEventSchema = Joi.object({
  title: Joi.string().max(200).optional(),
  event_type: Joi.string().valid('meeting', 'task', 'reminder', 'other').optional(),
  description: Joi.string().allow('', null).optional().max(1000),
  start_time: Joi.date().iso().optional(),
  end_time: Joi.date().iso().allow(null).optional(),
  all_day: Joi.boolean().optional(),
  location: Joi.string().allow('', null).optional().max(200),
  customer_id: Joi.number().integer().allow(null).optional(),
  contact_id: Joi.number().integer().allow(null).optional(),
  related_type: Joi.string().optional().max(50),
  related_id: Joi.number().integer().allow(null).optional(),
  attendees: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional(),
  reminder_minutes: Joi.number().integer().optional(),
  status: Joi.string().optional().max(50),
  color: Joi.string().optional().max(50)
});

const emptySchema = Joi.object({});

// 日程列表
router.get('/events', authenticateToken, checkPermission('calendar'), async (req, res, next) => {
  try {
    const rows = await calendarService.getEvents(pool, req.query);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[日程] 列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 日程详情
router.get('/events/:id', authenticateToken, checkPermission('calendar'), async (req, res, next) => {
  try {
    const row = await calendarService.getEvent(pool, req.params.id);
    if (!row) return res.status(404).json({ code: 404, message: '日程不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    logger.error('[日程] 详情查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 创建日程
router.post('/events', authenticateToken, checkPermission('calendar'), validate(createEventSchema), async (req, res, next) => {
  try {
    const result = await calendarService.createEvent(pool, req.body, req.user.userId);
    if (result.error) return res.status(400).json({ code: 400, message: result.error, data: null });
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[日程] 创建失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 更新日程
router.put('/events/:id', authenticateToken, checkPermission('calendar'), validate(updateEventSchema), async (req, res, next) => {
  try {
    const result = await calendarService.updateEvent(pool, req.params.id, req.body, req.user.userId, req.user.manageAll);
    if (result.error) return res.status(result.status || 500).json({ code: result.status || 500, message: result.error, data: null });
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[日程] 更新失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 删除日程
router.delete('/events/:id', authenticateToken, checkPermission('calendar'), async (req, res, next) => {
  try {
    const result = await calendarService.deleteEvent(pool, req.params.id, req.user.userId, req.user.manageAll);
    if (result.error) return res.status(result.status || 500).json({ code: result.status || 500, message: result.error, data: null });
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[日程] 删除失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 标记完成
router.post('/events/:id/complete', authenticateToken, checkPermission('calendar'), validate(emptySchema), async (req, res, next) => {
  try {
    await calendarService.completeEvent(pool, req.params.id);
    res.json({ code: 200, message: '已标记完成', data: null });
  } catch (error) {
    logger.error('[日程] 标记完成失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 今日日程
router.get('/today', authenticateToken, checkPermission('calendar'), async (req, res, next) => {
  try {
    const rows = await calendarService.getToday(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[日程] 今日日程查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 未来7天日程
router.get('/upcoming', authenticateToken, checkPermission('calendar'), async (req, res, next) => {
  try {
    const rows = await calendarService.getUpcoming(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[日程] 未来日程查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

module.exports = router;

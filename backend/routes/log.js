const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const requireAdmin = require('../middleware/admin');
const logService = require('../services/logRouteService');
const logger = require('../config/logger');

// Joi schemas
const listSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(20),
  module: Joi.string().max(50).allow('', null),
  action: Joi.string().max(100).allow('', null),
  status: Joi.number().integer().valid(0, 1).allow('', null),
  startDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  endDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  actionType: Joi.alternatives().try(
    Joi.string().max(20),
    Joi.array().items(Joi.string().max(20))
  ).allow('', null),
  userId: Joi.number().integer().allow('', null)
});

const exportSchema = Joi.object({
  module: Joi.string().max(50).allow('', null),
  action: Joi.string().max(100).allow('', null),
  status: Joi.number().integer().valid(0, 1).allow('', null),
  startDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  endDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null)
});

const deleteSchema = Joi.object({
  ids: Joi.array().items(Joi.number().integer()).min(1).required().messages({
    'any.required': '请选择要删除的日志',
    'array.min': '请选择要删除的日志'
  })
});

const clearSchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(30)
});

router.post('/list', authenticateToken, checkPermission('system:log'), validate(listSchema), async (req, res, next) => {
  try {
    const result = await logService.listLogs(pool, req.body);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('查询日志失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.get('/detail/:id', authenticateToken, async (req, res, next) => {
  try {
    const log = await logService.getLogDetail(pool, req.params.id);
    if (!log) {
      return res.status(404).json({ code: 404, message: '日志不存在', data: null });
    }
    res.json({ code: 200, message: '查询成功', data: log });
  } catch (error) {
    logger.error('查询日志详情失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.get('/modules', authenticateToken, async (req, res, next) => {
  try {
    const modules = await logService.getModules(pool);
    res.json({ code: 200, message: '查询成功', data: modules });
  } catch (error) {
    logger.error('查询模块失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.post('/delete', authenticateToken, requireAdmin, validate(deleteSchema), async (req, res, next) => {
  try {
    const count = await logService.deleteLogs(pool, req.body.ids);
    res.json({ code: 200, message: `成功删除 ${count} 条日志`, data: null });
  } catch (error) {
    logger.error('删除日志失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.post('/clear', authenticateToken, requireAdmin, validate(clearSchema), async (req, res, next) => {
  try {
    const count = await logService.clearLogs(pool, req.body.days);
    res.json({ code: 200, message: `成功清理 ${count} 条过期日志`, data: null });
  } catch (error) {
    logger.error('清理日志失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.post('/export', authenticateToken, checkPermission('log:export'), requireAdmin, validate(exportSchema), async (req, res, next) => {
  try {
    const buf = await logService.exportLogs(pool, req.body);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=operation_logs.xlsx');
    res.send(buf);
  } catch (error) {
    logger.error('导出日志失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

module.exports = router;

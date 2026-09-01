const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const integrationService = require('../services/integrationService');
const logger = require('../config/logger');

const integrationUpdateSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  config: Joi.object().required().unknown(true)
});

const emptySchema = Joi.object({});

const sendTestEmailSchema = Joi.object({
  to: Joi.string().email().required().max(200),
  subject: Joi.string().required().max(500),
  body: Joi.string().required().max(50000),
  ref_type: Joi.string().max(50).allow('', null),
  ref_id: Joi.number().integer().positive().allow(null)
});

// 获取集成配置列表
router.get('/list', authenticateToken, checkPermission('system'), async (req, res, next) => {
  try {
    const data = await integrationService.listIntegrations(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('集成配置查询错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 更新集成配置
router.post('/update', authenticateToken, checkPermission('system'), validate(integrationUpdateSchema), async (req, res, next) => {
  try {
    await integrationService.updateIntegration(pool, req.body);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('集成配置更新错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.status || error.httpStatus || error.code || 500;
    res.status(status).json({ code: status, message: error.message || '更新失败', data: null });
  }
});

// 测试邮件连接
router.post('/test', authenticateToken, checkPermission('system'), validate(emptySchema), async (req, res, next) => {
  try {
    const result = await integrationService.testIntegration(pool);
    res.json({ code: 200, message: result.message, data: { success: result.success } });
  } catch (error) {
    logger.error('邮件测试失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.json({ code: 200, message: error.message, data: { success: false } });
  }
});

// 发送邮件
router.post('/send-email', authenticateToken, checkPermission('system'), validate(sendTestEmailSchema), async (req, res, next) => {
  try {
    await integrationService.sendTestEmail(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '邮件发送成功', data: null });
  } catch (error) {
    logger.error('邮件发送错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.status || error.httpStatus || error.code || 500;
    res.status(status).json({ code: status, message: error.message || '邮件发送失败', data: null });
  }
});

// 邮件日志列表
router.get('/email-log', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const result = await integrationService.getEmailLog(pool, { page, pageSize });
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('邮件日志查询错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

module.exports = router;

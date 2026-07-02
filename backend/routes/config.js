const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { requireManager } = require('../middleware/admin');
const { validate, Joi } = require('../middleware/validate');
const configRouteService = require('../services/configRouteService');
const logger = require('../config/logger');

const configUpdateSchema = Joi.object({
  configs: Joi.array().items(
    Joi.object({
      config_key: Joi.string().required().max(100),
      config_value: Joi.string().allow('').required().max(1000)
    })
  ).min(1).required()
});

const emptySchema = Joi.object({});

const router = express.Router();

// 获取逾期天数（所有登录用户可用）
router.get('/overdue-days', authenticateToken, checkPermission('system'), async (req, res) => {
  try {
    const data = await configRouteService.fetchOverdueDays();
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[配置] 获取逾期天数失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 获取所有配置（仅管理员/经理）
router.get('/list', authenticateToken, checkPermission('system'), requireManager, async (req, res) => {
  try {
    const rows = await configRouteService.listConfigs(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[配置] 获取配置错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '获取配置失败', data: null });
  }
});

// 更新配置（仅管理员/经理）
router.post('/update', authenticateToken, checkPermission('system'), requireManager, validate(configUpdateSchema), async (req, res) => {
  try {
    await configRouteService.updateConfigs(pool, req.body.configs);
    res.json({ code: 200, message: '配置更新成功', data: null });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    logger.error('[配置] 更新配置错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '更新配置失败', data: null });
  }
});

// 测试企业微信通知
router.post('/test-notification', authenticateToken, checkPermission('system'), validate(emptySchema), async (req, res) => {
  try {
    await configRouteService.testNotification();
    res.json({ code: 200, message: '测试消息已发送', data: null });
  } catch (error) {
    logger.error('[配置] 测试通知失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '发送失败，请检查配置', data: null });
  }
});

module.exports = router;

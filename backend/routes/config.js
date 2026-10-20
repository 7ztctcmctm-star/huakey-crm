const express = require('express');
const registry = require('../core/ModuleRegistry');
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

// 获取逾期天数
// [权限说明 · C1 2026-10-20 复核] **保持公开（仅认证）**，不补权限码。
//   判定依据：
//   1. 单值标量：只返回一个逾期天数阈值，属系统级展示参数，非业务数据；
//   2. 判定基准一致性：逾期高亮是列表页的展示口径，必须对所有能看到
//      列表的角色一致；若差别授权，同一批客户在不同账号下会显示不同的
//      逾期状态，反而制造歧义；
//   3. 真正的敏感面已锁死：全量配置读取（GET /list，含各类密钥开关）
//      与写入（POST /update）均已配 checkPermission('system') +
//      requireManager，本端点不暴露任何配置项。
router.get('/overdue-days', authenticateToken, async (req, res, next) => {
  try {
    const data = await configRouteService.fetchOverdueDays();
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[配置] 获取逾期天数失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 获取所有配置（仅管理员/经理）
router.get('/list', authenticateToken, checkPermission('system'), requireManager, async (req, res, next) => {
  try {
    const rows = await configRouteService.listConfigs(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[配置] 获取配置错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 更新配置（仅管理员/经理）
router.post('/update', authenticateToken, checkPermission('system'), requireManager, validate(configUpdateSchema), async (req, res, next) => {
  try {
    await configRouteService.updateConfigs(pool, req.body.configs);
    res.json({ code: 200, message: '配置更新成功', data: null });
  } catch (error) {
    next(error);
  }
});

// 测试企业微信通知
router.post('/test-notification', authenticateToken, checkPermission('system'), validate(emptySchema), async (req, res, next) => {
  try {
    await configRouteService.testNotification();
    res.json({ code: 200, message: '测试消息已发送', data: null });
  } catch (error) {
    logger.error('[配置] 测试通知失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

registry.register('config', { routes: router, permissions: ['system'] });
module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validate, Joi } = require('../middleware/validate');
const crypto = require('crypto');
const svc = require('../services/apiPlatformService');

const requireAdmin = require('../middleware/admin');
const logger = require('../config/logger');

// [认证说明] 本模块所有端点均使用 authenticateToken + requireAdmin，无需额外 checkPermission

// --- Joi schemas ---

const createKeySchema = Joi.object({
  name: Joi.string().required().max(100),
  permissions: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional(),
  rate_limit: Joi.number().integer().min(1).allow(null).optional(),
  expires_at: Joi.date().iso().allow(null).optional()
});

const updateKeySchema = Joi.object({
  name: Joi.string().max(100).optional(),
  permissions: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional(),
  rate_limit: Joi.number().integer().min(1).allow(null).optional(),
  status: Joi.number().integer().valid(0, 1).optional(),
  expires_at: Joi.date().iso().allow(null).optional()
});

const createWebhookSchema = Joi.object({
  name: Joi.string().required().max(100),
  url: Joi.string().uri().required().max(500),
  events: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).required(),
  secret: Joi.string().allow('', null).optional().max(200)
});

const updateWebhookSchema = Joi.object({
  name: Joi.string().max(100).optional(),
  url: Joi.string().uri().max(500).optional(),
  events: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional(),
  status: Joi.number().integer().valid(0, 1).optional()
});

const emptySchema = Joi.object({});

// 生成随机密钥
const generateKey = (prefix = '', length = 32) => {
  return prefix + crypto.randomBytes(length).toString('hex').slice(0, length);
};

// ============ API密钥管理 ============

router.get('/keys', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await svc.listKeys(pool);
    // 遮蔽api_key，只显示后4位
    const maskedKeys = rows.map(k => ({
      ...k,
      api_key: '****' + (k.api_key || '').slice(-4)
    }));
    res.json({ code: 200, message: '查询成功', data: maskedKeys });
  } catch (error) {
    logger.error('[API平台] 密钥列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/keys', authenticateToken, requireAdmin, validate(createKeySchema), async (req, res) => {
  try {
    const { name, permissions, rate_limit, expires_at } = req.body;
    if (!name) return res.status(400).json({ code: 400, message: '密钥名称不能为空', data: null });
    const apiKey = generateKey('crm_', 32);
    const apiSecret = generateKey('', 48);
    const permsStr = Array.isArray(permissions) ? JSON.stringify(permissions) : (permissions || '["customer:read"]');
    const result = await svc.createKey(pool, {
      name, api_key: apiKey, api_secret: apiSecret, permissions: permsStr, rate_limit, expires_at, create_by: req.user.userId
    });
    res.json({ code: 200, message: '创建成功，请妥善保存密钥', data: { id: result.id, api_key: apiKey, api_secret: apiSecret } });
  } catch (error) {
    logger.error('[API平台] 创建密钥失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/keys/:id', authenticateToken, requireAdmin, validate(updateKeySchema), async (req, res) => {
  try {
    const { name, permissions, rate_limit, status, expires_at } = req.body;
    const fields = [], values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (permissions !== undefined) { fields.push('permissions = ?'); values.push(Array.isArray(permissions) ? JSON.stringify(permissions) : permissions); }
    if (rate_limit !== undefined) { fields.push('rate_limit = ?'); values.push(rate_limit); }
    if (status !== undefined) { fields.push('status = ?'); values.push(parseInt(status)); }
    if (expires_at !== undefined) { fields.push('expires_at = ?'); values.push(expires_at); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    await svc.updateKey(pool, req.params.id, fields, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[API平台] 更新密钥失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/keys/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await svc.deleteKey(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[API平台] 删除密钥失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/keys/:id/regenerate', authenticateToken, requireAdmin, validate(emptySchema), async (req, res) => {
  try {
    const newKey = generateKey('crm_', 32);
    const newSecret = generateKey('', 48);
    await svc.regenerateKey(pool, req.params.id, newKey, newSecret);
    res.json({ code: 200, message: '重新生成成功，请妥善保存', data: { api_key: newKey, api_secret: newSecret } });
  } catch (error) {
    logger.error('[API平台] 重新生成密钥失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ Webhook管理 ============

router.get('/webhooks', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await svc.listWebhooks(pool);
    // 遮蔽secret字段
    const maskedWebhooks = rows.map(w => ({
      ...w,
      secret: w.secret ? '****' + w.secret.slice(-4) : null
    }));
    res.json({ code: 200, message: '查询成功', data: maskedWebhooks });
  } catch (error) {
    logger.error('[API平台] Webhook列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/webhooks', authenticateToken, requireAdmin, validate(createWebhookSchema), async (req, res) => {
  try {
    const { name, url, events, secret } = req.body;
    if (!name || !url || !events) return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    const eventsStr = Array.isArray(events) ? JSON.stringify(events) : events;
    const result = await svc.createWebhook(pool, {
      name, url, events: eventsStr, secret: secret || generateKey('wh_', 32), create_by: req.user.userId
    });
    res.json({ code: 200, message: '创建成功', data: { id: result.id } });
  } catch (error) {
    logger.error('[API平台] 创建Webhook失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/webhooks/:id', authenticateToken, requireAdmin, validate(updateWebhookSchema), async (req, res) => {
  try {
    const { name, url, events, status } = req.body;
    const fields = [], values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (url !== undefined) { fields.push('url = ?'); values.push(url); }
    if (events !== undefined) { fields.push('events = ?'); values.push(Array.isArray(events) ? JSON.stringify(events) : events); }
    if (status !== undefined) { fields.push('status = ?'); values.push(parseInt(status)); }
    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    await svc.updateWebhook(pool, req.params.id, fields, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[API平台] 更新Webhook失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/webhooks/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await svc.deleteWebhook(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[API平台] 删除Webhook失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 测试Webhook
router.post('/webhooks/:id/test', authenticateToken, requireAdmin, validate(emptySchema), async (req, res) => {
  try {
    const webhook = await svc.getWebhookById(pool, req.params.id);
    if (!webhook) return res.status(404).json({ code: 404, message: 'Webhook不存在', data: null });

    const payload = { event: 'test', timestamp: new Date().toISOString(), data: { message: '这是一条测试消息' } };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': webhook.secret || '' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      const responseBody = await response.text().catch(() => '');
      await svc.insertWebhookLog(pool, {
        webhook_id: webhook.id, event_type: 'test', payload: JSON.stringify(payload),
        response_status: response.status, response_body: responseBody.slice(0, 1000), status: response.ok ? 'success' : 'failed'
      });

      await svc.updateWebhookTrigger(pool, webhook.id, true);
      res.json({ code: 200, message: '测试发送成功', data: { status: response.status, ok: response.ok } });
    } catch (fetchError) {
      await svc.insertWebhookLog(pool, {
        webhook_id: webhook.id, event_type: 'test', payload: JSON.stringify(payload), status: 'failed'
      });
      await svc.updateWebhookTrigger(pool, webhook.id, false);
      res.json({ code: 200, message: '测试发送失败', data: { error: fetchError.message } });
    }
  } catch (error) {
    logger.error('[API平台] 测试Webhook失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// Webhook日志
router.get('/webhooks/:id/logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await svc.getWebhookLogs(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[API平台] Webhook日志查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// API文档概览（同步响应，无需try/catch）
router.get('/docs', authenticateToken, (req, res) => {
  res.json({
    code: 200, message: '查询成功',
    data: {
      auth: { method: 'Header', header: 'X-API-Key', description: '在请求头中添加 X-API-Key: your_api_key' },
      endpoints: [
        { module: '客户', endpoints: [{ method: 'GET', path: '/api/customer/list', permission: 'customer:read', description: '客户列表' }, { method: 'GET', path: '/api/customer/detail/:id', permission: 'customer:read', description: '客户详情' }] },
        { module: '合同', endpoints: [{ method: 'GET', path: '/api/contract/list', permission: 'contract:read', description: '合同列表' }] },
        { module: '商机', endpoints: [{ method: 'GET', path: '/api/opportunity/list', permission: 'opportunity:read', description: '商机列表' }] },
        { module: '产品', endpoints: [{ method: 'GET', path: '/api/product/list', permission: 'product:read', description: '产品列表' }] }
      ],
      rate_limit: '默认100次/小时，可在密钥配置中调整'
    }
  });
});

module.exports = router;

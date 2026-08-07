const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { requireManager } = require('../middleware/admin');
const { validate, Joi } = require('../middleware/validate');
const tagService = require('../services/tagRouteService');
const logger = require('../config/logger');

const tagManageSchema = Joi.object({
  action: Joi.string().valid('add', 'update', 'delete').required(),
  id: Joi.number().integer().positive().when('action', { is: Joi.valid('update', 'delete'), then: Joi.required() }),
  name: Joi.string().max(50).when('action', { is: Joi.valid('add', 'update'), then: Joi.required() }),
  color: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).default('#1a56db')
});

const setCustomerTagsSchema = Joi.object({
  tag_ids: Joi.array().items(Joi.number().integer().positive()).default([])
});

// 获取所有标签
router.get('/list', authenticateToken, checkPermission('tag'), async (req, res, next) => {
  try {
    const tags = await tagService.listTags(pool);
    res.json({ code: 200, message: 'success', data: tags });
  } catch (error) {
    logger.error('获取标签列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 获取客户的标签
router.get('/customer/:customerId', authenticateToken, checkPermission('tag'), async (req, res, next) => {
  try {
    const tags = await tagService.getCustomerTags(pool, req.params.customerId);
    res.json({ code: 200, message: 'success', data: tags });
  } catch (error) {
    logger.error('获取客户标签错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 设置客户标签（仅管理员/经理）
router.post('/customer/:customerId', authenticateToken, checkPermission('tag'), requireManager, validate(setCustomerTagsSchema), async (req, res, next) => {
  try {
    const { tag_ids } = req.body;
    const customerId = req.params.customerId;
    const userId = req.user.userId;
    const { logAction, getIpAddress } = require('../middleware/logger');

    await tagService.setCustomerTags(pool, { customerId, tag_ids, userId, req }, logAction, getIpAddress);
    res.json({ code: 200, message: '标签设置成功', data: null });
  } catch (error) {
    logger.error('设置客户标签错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 管理标签（仅管理员/经理）
router.post('/manage', authenticateToken, checkPermission('tag'), requireManager, validate(tagManageSchema), async (req, res, next) => {
  try {
    const result = await tagService.manageTag(pool, req.body);
    if (result.error) {
      return res.status(result.status).json({ code: result.status, message: result.error, data: null });
    }
    if (result.id !== undefined) {
      res.json({ code: 200, message: '标签已添加', data: { id: result.id } });
    } else {
      res.json({ code: 200, message: req.body.action === 'delete' ? '标签已删除' : '标签已更新', data: null });
    }
  } catch (error) {
    logger.error('管理标签错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

module.exports = router;

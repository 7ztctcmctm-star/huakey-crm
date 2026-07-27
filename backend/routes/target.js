const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const targetService = require('../services/targetService');
const logger = require('../config/logger');

const targetListSchema = Joi.object({
  year: Joi.number().integer().min(2020).max(2030).optional(),
  month: Joi.number().integer().min(1).max(12).optional()
});

const targetSetSchema = Joi.object({
  user_id: Joi.number().integer().positive().required(),
  year: Joi.number().integer().min(2020).max(2030).required(),
  month: Joi.number().integer().min(1).max(12).required(),
  target_amount: Joi.number().precision(2).min(0).default(0)
});

const targetBatchSetSchema = Joi.object({
  year: Joi.number().integer().min(2020).max(2030).required(),
  month: Joi.number().integer().min(1).max(12).required(),
  targets: Joi.array().items(
    Joi.object({
      user_id: Joi.number().integer().positive().required(),
      target_amount: Joi.number().precision(2).min(0).default(0)
    })
  ).min(1).required()
});

const targetDeleteSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// 1. 获取销售目标列表（含达成率）
router.post('/list', authenticateToken, validate(targetListSchema), async (req, res) => {
  try {
    const data = await targetService.listTargets(pool, req.body);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('获取销售目标错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 2. 设置/更新销售目标
router.post('/set', authenticateToken, checkPermission('target'), validate(targetSetSchema), async (req, res, next) => {
  try {
    await targetService.setTarget(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '设置目标成功', data: null });
  } catch (error) {
    next(error);
  }
});

// 3. 批量设置销售目标
router.post('/batch-set', authenticateToken, checkPermission('target'), validate(targetBatchSetSchema), async (req, res, next) => {
  try {
    await targetService.batchSetTarget(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '批量设置成功', data: null });
  } catch (error) {
    next(error);
  }
});

// 4. 删除销售目标
router.post('/delete', authenticateToken, checkPermission('target'), validate(targetDeleteSchema), async (req, res, next) => {
  try {
    await targetService.deleteTarget(pool, req.body);
    res.json({ code: 200, message: '删除目标成功', data: null });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

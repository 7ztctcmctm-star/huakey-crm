const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { queryValidate, Joi } = require('../middleware/validate');
const searchRouteService = require('../services/searchRouteService');
const logger = require('../config/logger');

const globalSearchSchema = Joi.object({
  keyword: Joi.string().min(2).max(100).required().messages({
    'string.min': '搜索关键词至少2个字符',
    'any.required': '搜索关键词不能为空'
  })
});

// 全局搜索
router.get('/global', authenticateToken, checkPermission('search'), queryValidate(globalSearchSchema), async (req, res, next) => {
  try {
    const keyword = (req.query.keyword || '').trim();
    const data = await searchRouteService.globalSearch(pool, { keyword, user: req.user });
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('全局搜索错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

module.exports = router;

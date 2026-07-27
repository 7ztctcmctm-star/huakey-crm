const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const requireAdmin = require('../middleware/admin');
const { requireManager } = require('../middleware/admin');
const currencyService = require('../services/currencyService');
const logger = require('../config/logger');
const { validate, Joi } = require('../middleware/validate');

const updateCurrencySchema = Joi.object({
  exchange_rate: Joi.number().positive().allow(null),
  is_default: Joi.boolean(),
  status: Joi.number().integer().valid(0, 1)
});

// 货币列表
// [权限说明] 公共查询接口，仅需认证
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const rows = await currencyService.listCurrencies(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[货币] 列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 获取汇率map（前端用）
// [权限说明] 公共查询接口，仅需认证
router.get('/rates', authenticateToken, async (req, res) => {
  try {
    const rates = await currencyService.getRates(pool);
    res.json({ code: 200, message: '查询成功', data: rates });
  } catch (error) {
    logger.error('[货币] 汇率查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新汇率（管理员）
router.put('/:id', authenticateToken, requireAdmin, validate(updateCurrencySchema), async (req, res, next) => {
  try {
    await currencyService.updateCurrency(pool, req.params.id, req.body);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    next(error);
  }
});

// 删除货币（软删除，仅管理员/经理）
router.delete('/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    await currencyService.deleteCurrency(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[货币] 删除失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

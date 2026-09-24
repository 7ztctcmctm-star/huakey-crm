const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const { requireManager } = require('../middleware/admin');
const { checkPermission } = require('../middleware/permission');
const currencyService = require('../services/currencyService');
const { validate, Joi } = require('../middleware/validate');

const updateCurrencySchema = Joi.object({
  exchange_rate: Joi.number().positive().allow(null),
  is_default: Joi.boolean(),
  status: Joi.number().integer().valid(0, 1)
});

// 货币列表
// [权限说明] 公共查询接口，仅需认证
router.get('/list', authenticateToken, async (req, res, next) => {
  try {
    const rows = await currencyService.listCurrencies(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    next(error);
  }
});

// 获取汇率map（前端用）
// [权限说明] 公共查询接口，仅需认证
router.get('/rates', authenticateToken, async (req, res, next) => {
  try {
    const rates = await currencyService.getRates(pool);
    res.json({ code: 200, message: '查询成功', data: rates });
  } catch (error) {
    next(error);
  }
});

// 更新汇率（system:currency 权限持有者可操作，已去掉 requireAdmin 硬锁）
router.put('/:id', authenticateToken, checkPermission('system:currency'), validate(updateCurrencySchema), async (req, res, next) => {
  try {
    await currencyService.updateCurrency(pool, req.params.id, req.body);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    next(error);
  }
});

// 删除货币（软删除，仅管理员）
// ⚠️ 配对 checkPermission('system:currency')（仅 boss 持有）：
//    requireManager 语义修正后会放行 manager，若不配对会把「删除货币」放宽给部门经理；
//    与同文件 PUT /:id 的 requireAdmin 级别保持一致（2026-09-20）。
router.delete('/:id', authenticateToken, checkPermission('system:currency'), requireManager, async (req, res, next) => {
  try {
    await currencyService.deleteCurrency(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

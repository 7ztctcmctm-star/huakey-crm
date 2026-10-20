const express = require('express');
const registry = require('../core/ModuleRegistry');
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
// [权限说明 · C1 2026-10-20 复核] **保持公开（仅认证）**，不补权限码。
//   判定依据：
//   1. 字典性质：返回 crm_currency 的货币代码/名称/符号，不含任何客户或金额数据；
//   2. 全链路依赖：报价、合同、发票、采购的币种下拉都要读它，且这些模块的
//      使用者横跨 sales / purchase / finance / engineer —— 若挂到
//      system:currency（现仅 boss 持有），销售连报价单都开不出来；
//   3. 敏感操作已隔离：写操作（PUT /:id、DELETE /:id）均已配
//      checkPermission('system:currency')，读写分治，无需在此再加门。
router.get('/list', authenticateToken, async (req, res, next) => {
  try {
    const rows = await currencyService.listCurrencies(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    next(error);
  }
});

// 获取汇率map（前端用）
// [权限说明 · C1 2026-10-20 复核] **保持公开（仅认证）**，同 /list 口径。
//   仅返回 code → exchange_rate 映射，是报价换算的基础字典，无行级归属概念。
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

registry.register('currency', { routes: router, permissions: ['system:currency'] });
module.exports = router;

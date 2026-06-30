const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const { createRouteLogger } = require('../../middleware/logger');
const contractPaymentService = require('../../services/contractPaymentService');
const logger = require('../../config/logger');

const logAction = createRouteLogger('合同管理');

// --- Joi schemas ---

const paymentAddSchema = Joi.object({
  contract_id: Joi.number().integer().positive().required(),
  plan_id: Joi.number().integer().positive().allow(null),
  pay_date: Joi.date().iso().required(),
  pay_amount: Joi.number().precision(2).min(0).required(),
  pay_method: Joi.string().max(50).allow('', null),
  remark: Joi.string().max(500).allow('', null)
});

const paymentUpdateSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  pay_date: Joi.date().iso().required(),
  pay_amount: Joi.number().precision(2).min(0).required(),
  pay_method: Joi.string().max(50).allow('', null),
  remark: Joi.string().max(500).allow('', null)
});

const paymentDeleteSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// --- Routes ---

router.post('/payment/add', authenticateToken, checkPermission('contract'), validate(paymentAddSchema), async (req, res) => {
  try {
    await contractPaymentService.addPayment(pool, req.body, req.user);
    await logAction(req, 'add', `登记回款: 合同ID=${req.body.contract_id}, 金额=${req.body.pay_amount}`);
    res.json({ code: 200, message: '登记回款成功', data: null });
  } catch (error) {
    logger.error('[合同] 登记回款失败:', { error: error.message, traceId: req.traceId || 'N/A' });
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '登记回款失败', data: null });
  }
});

router.post('/payment/update', authenticateToken, checkPermission('contract'), validate(paymentUpdateSchema), async (req, res) => {
  try {
    await contractPaymentService.updatePayment(pool, req.body, req.user);
    await logAction(req, 'update', `修改回款记录: ID=${req.body.id}`);
    res.json({ code: 200, message: '修改回款记录成功', data: null });
  } catch (error) {
    logger.error('[合同] 修改回款记录失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '修改回款记录失败', data: null });
  }
});

router.post('/payment/delete', authenticateToken, checkPermission('contract'), validate(paymentDeleteSchema), async (req, res) => {
  try {
    await contractPaymentService.deletePayment(pool, req.body.id, req.user);
    await logAction(req, 'delete', `删除回款记录: ID=${req.body.id}`);
    res.json({ code: 200, message: '删除回款记录成功', data: null });
  } catch (error) {
    logger.error('[合同] 删除回款记录失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '删除回款记录失败', data: null });
  }
});

// 回款管理：回款列表 + 逾期未回款
router.post('/payment/list', authenticateToken, checkPermission('contract'), async (req, res) => {
  try {
    const result = await contractPaymentService.listPayments(pool, req.body);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[合同] 查询回款列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 回款合并视图（计划+记录）
router.post('/payment/merged', authenticateToken, checkPermission('contract'), async (req, res) => {
  try {
    const result = await contractPaymentService.getMergedPayments(pool, req.body);
    res.json({ code: 200, message: '查询成功', data: { list: result.list, total: result.total } });
  } catch (error) {
    logger.error('[合同] 合并回款视图查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 客户对账汇总
router.post('/payment/summary', authenticateToken, checkPermission('contract'), async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.body;
    const result = await contractPaymentService.getSummary(pool);
    res.json({
      code: 200, message: '查询成功',
      data: { list: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize), summary: result }
    });
  } catch (error) {
    logger.error('[合同] 对账汇总错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 对账单导出
router.post('/payment/statement-export', authenticateToken, checkPermission('contract'), async (req, res) => {
  try {
    const { buffer } = await contractPaymentService.getStatementExport(pool, req.body);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=statement.xlsx');
    res.send(buffer);
    await logAction(req, 'export', '导出对账单');
  } catch (error) {
    logger.error('[合同] 对账单导出错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '导出对账单失败', data: null });
  }
});

module.exports = router;

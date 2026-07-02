const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const invoiceService = require('../services/invoiceService');
const logger = require('../config/logger');

// Joi 数据校验规则
const listSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  keyword: Joi.string().max(200).allow('', null),
  status: Joi.number().integer().valid(1, 2, 3, 4).allow('', null),
  type: Joi.number().integer().valid(1, 2, 3).allow('', null),
  start_date: Joi.date().iso().allow('', null),
  end_date: Joi.date().iso().allow('', null)
});

const addSchema = Joi.object({
  contract_id: Joi.number().integer().positive().required(),
  customer_id: Joi.number().integer().positive().required(),
  type: Joi.number().integer().valid(1, 2, 3).required(),
  amount: Joi.number().precision(2).min(0).required(),
  tax_rate: Joi.number().precision(2).min(0).max(100).allow(null),
  tax_amount: Joi.number().precision(2).min(0).allow(null),
  invoice_date: Joi.date().iso().allow(null),
  status: Joi.number().integer().valid(1, 2, 3, 4).allow(null),
  remark: Joi.string().max(500).allow('', null)
});

const updateSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  contract_id: Joi.number().integer().positive().required(),
  customer_id: Joi.number().integer().positive().required(),
  type: Joi.number().integer().valid(1, 2, 3).required(),
  amount: Joi.number().precision(2).min(0).required(),
  tax_rate: Joi.number().precision(2).min(0).max(100).allow(null),
  tax_amount: Joi.number().precision(2).min(0).allow(null),
  invoice_date: Joi.date().iso().allow(null),
  status: Joi.number().integer().valid(1, 2, 3, 4).allow(null),
  remark: Joi.string().max(500).allow('', null)
});

const deleteSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const exportSchema = Joi.object({
  keyword: Joi.string().max(200).allow('', null),
  status: Joi.number().integer().valid(1, 2, 3, 4).allow('', null),
  type: Joi.number().integer().valid(1, 2, 3).allow('', null)
});

// 列表查询
router.post('/list', authenticateToken, checkPermission('invoice'), checkDataPermission('invoice', 'create_by'), validate(listSchema), async (req, res) => {
  try {
    const data = await invoiceService.listInvoices(pool, req.body, req.dataPermission);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('发票列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 详情
router.get('/detail/:id', authenticateToken, async (req, res) => {
  try {
    const data = await invoiceService.getInvoice(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    const status = error.statusCode || 500;
    logger.error('发票详情查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(status).json({ code: status, message: error.message || '查询失败', data: null });
  }
});

// 新增
router.post('/add', authenticateToken, checkPermission('invoice:add'), validate(addSchema), async (req, res) => {
  try {
    const result = await invoiceService.createInvoice(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建发票成功', data: result });
  } catch (error) {
    logger.error('新增发票失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '创建发票失败', data: null });
  }
});

// 编辑
router.post('/update', authenticateToken, checkPermission('invoice:edit'), validate(updateSchema), async (req, res) => {
  try {
    await invoiceService.updateInvoice(pool, req.body, req);
    res.json({ code: 200, message: '修改成功', data: null });
  } catch (error) {
    const status = error.statusCode || 500;
    logger.error('修改发票失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(status).json({ code: status, message: error.message || '修改失败', data: null });
  }
});

// 删除（软删除）
router.post('/delete', authenticateToken, checkPermission('invoice:delete'), validate(deleteSchema), async (req, res) => {
  try {
    await invoiceService.deleteInvoice(pool, req.body, req);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    const status = error.statusCode || 500;
    logger.error('删除发票失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(status).json({ code: status, message: error.message || '删除失败', data: null });
  }
});

// 导出
router.post('/export', authenticateToken, checkPermission('invoice:export'), checkDataPermission('invoice', 'create_by'), validate(exportSchema), async (req, res) => {
  try {
    const buf = await invoiceService.exportInvoices(pool, req.body, req.dataPermission, req);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=invoices.xlsx');
    res.send(buf);
  } catch (error) {
    logger.error('导出发票失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

module.exports = router;

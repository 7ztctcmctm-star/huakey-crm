const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const financeService = require('../services/financeService');
const logger = require('../config/logger');

// ============ 回款提醒 ============

// 提醒列表
router.get('/reminders', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { status = '', page = 1, pageSize = 20 } = req.query;
    const data = await financeService.getReminders(pool, { status, page: parseInt(page), pageSize: parseInt(pageSize) });
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[财务] 提醒列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 生成回款提醒
router.post('/reminders/generate', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { created } = await financeService.generateReminders(pool);
    res.json({ code: 200, message: `生成完成，新增 ${created} 条提醒`, data: { created } });
  } catch (error) {
    logger.error('[财务] 生成提醒失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 确认提醒
router.put('/reminders/:id/acknowledge', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    await financeService.acknowledgeReminder(pool, req.params.id);
    res.json({ code: 200, message: '已确认', data: null });
  } catch (error) {
    logger.error('[财务] 确认提醒失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 提醒汇总
router.get('/reminders/summary', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const data = await financeService.getReminderSummary(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[财务] 提醒汇总查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 对账管理 ============

// 客户对账数据
router.get('/reconciliation/customer', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { customer_id, start_date, end_date } = req.query;
    if (!customer_id) return res.status(400).json({ code: 400, message: '请选择客户', data: null });
    const result = await financeService.getCustomerReconciliation(pool, { customer_id, start_date, end_date });
    if (result.error === 'not_found') return res.status(404).json({ code: 404, message: '客户不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[财务] 客户对账查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 供应商对账数据
router.get('/reconciliation/supplier', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { supplier_id, start_date, end_date } = req.query;
    if (!supplier_id) return res.status(400).json({ code: 400, message: '请选择供应商', data: null });
    const result = await financeService.getSupplierReconciliation(pool, { supplier_id, start_date, end_date });
    if (result.error === 'not_found') return res.status(404).json({ code: 404, message: '供应商不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[财务] 供应商对账查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 保存对账单
router.post('/reconciliation/save', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { recon_type, target_id } = req.body;
    if (!recon_type || !target_id) return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    const result = await financeService.saveReconciliation(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '保存成功', data: result });
  } catch (error) {
    logger.error('[财务] 保存对账单失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 对账单列表
router.get('/reconciliation/list', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { recon_type = '', status = '', page = 1, pageSize = 20 } = req.query;
    const data = await financeService.getReconciliationList(pool, { recon_type, status, page: parseInt(page), pageSize: parseInt(pageSize) });
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[财务] 对账单列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 财务分析 ============

router.get('/analysis', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const data = await financeService.getAnalysis(pool, { start_date, end_date });
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[财务] 分析查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 财务分析导出CSV
router.get('/analysis/export', authenticateToken, checkPermission('finance'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const rows = await financeService.getAnalysisExport(pool, { start_date, end_date });
    if (rows.length === 0) return res.status(404).json({ code: 404, message: '无数据', data: null });

    const headers = Object.keys(rows[0]);
    const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=financial_analysis.csv');
    res.send('﻿' + csv);
  } catch (error) {
    logger.error('[财务] 导出失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

module.exports = router;

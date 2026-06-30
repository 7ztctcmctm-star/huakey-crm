const express = require('express');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: 数据报表
 *     description: 销售漏斗、业绩概览、客户分析
 *
 * /api/report/sales-funnel:
 *   get:
 *     summary: 销售漏斗分析
 *     tags: [数据报表]
 *     responses:
 *       200:
 *         description: 各阶段商机数量和金额统计
 *
 * /api/report/overview:
 *   get:
 *     summary: 销售业绩概览
 *     tags: [数据报表]
 *     responses:
 *       200:
 *         description: 当月/季度/年度销售额、回款、新增客户等概览数据
 *
 * /api/report/purchase-cost:
 *   get:
 *     summary: 采购成本分析
 *     tags: [数据报表]
 *     responses:
 *       200:
 *         description: 按月份、产品分类统计采购金额
 *
 * /api/report/supplier-performance:
 *   get:
 *     summary: 供应商绩效分析
 *     tags: [数据报表]
 *     responses:
 *       200:
 *         description: 供应商采购金额、准时交付率、质量评分
 */
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { validate, queryValidate, Joi } = require('../../middleware/validate');
const { cache } = require('../../middleware/cache');
const { createRouteLogger } = require('../../middleware/logger');
const reportAnalyticsService = require('../../services/reportAnalyticsService');
const logAction = createRouteLogger('报表管理');

// --- Joi schemas ---

const dateRangeQuerySchema = Joi.object({
  startDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  endDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null)
});

const financeQuerySchema = Joi.object({
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null)
});

const financeExportQuerySchema = Joi.object({
  type: Joi.string().valid('receivable', 'income', 'purchase').default('receivable'),
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null)
});

const purchaseCostQuerySchema = Joi.object({
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null)
});

const supplierPerformanceQuerySchema = Joi.object({
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  supplier_id: Joi.number().integer().min(1).allow('', null)
});

const overdueSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(20)
});

const exportSchema = Joi.object({
  startDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  endDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null)
});

// --- Routes ---

// 销售漏斗统计
router.get('/sales-funnel', authenticateToken, cache(300), queryValidate(dateRangeQuerySchema), async (req, res) => {
  try {
    const data = await reportAnalyticsService.getSalesFunnel(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 业绩统计
router.get('/performance', authenticateToken, queryValidate(dateRangeQuerySchema), async (req, res) => {
  try {
    const data = await reportAnalyticsService.getPerformance(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[报表] 业绩统计错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 客户统计
router.get('/customer', authenticateToken, queryValidate(dateRangeQuerySchema), async (req, res) => {
  try {
    const data = await reportAnalyticsService.getCustomerStats(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 回款统计
router.get('/payment', authenticateToken, queryValidate(dateRangeQuerySchema), async (req, res) => {
  try {
    const data = await reportAnalyticsService.getPaymentStats(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 销售趋势
router.get('/sales-trend', authenticateToken, queryValidate(dateRangeQuerySchema), async (req, res) => {
  try {
    const data = await reportAnalyticsService.getSalesTrend(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 逾期跟进客户列表
router.post('/overdue', authenticateToken, checkPermission('report'), validate(overdueSchema), async (req, res) => {
  try {
    const data = await reportAnalyticsService.getOverdueCustomers(pool, req.body, req.user.userId, req.user.roleId);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 采购趋势（近12个月）
router.get('/purchase-trend', authenticateToken, queryValidate(dateRangeQuerySchema), async (req, res) => {
  try {
    const data = await reportAnalyticsService.getPurchaseTrend(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 采购按供应商分布
router.get('/purchase-by-supplier', authenticateToken, queryValidate(dateRangeQuerySchema), async (req, res) => {
  try {
    const data = await reportAnalyticsService.getPurchaseBySupplier(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 采购成本分析
router.get('/purchase-cost', authenticateToken, queryValidate(purchaseCostQuerySchema), async (req, res) => {
  try {
    const data = await reportAnalyticsService.getPurchaseCost(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[报表] 采购成本分析错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 供应商绩效分析
router.get('/supplier-performance', authenticateToken, queryValidate(supplierPerformanceQuerySchema), async (req, res) => {
  try {
    const data = await reportAnalyticsService.getSupplierPerformance(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[报表] 供应商绩效分析错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 导出报表
router.post('/export', authenticateToken, checkPermission('report'), validate(exportSchema), async (req, res) => {
  try {
    const buf = await reportAnalyticsService.exportReport(pool, req.body);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx');
    res.send(buf);

    const { startDate, endDate } = req.body;
    await logAction(req, 'export', `导出报表${startDate && endDate ? `(${startDate} ~ ${endDate})` : '(本月)'}`);
  } catch (error) {
    console.error('导出报表错误:', error);
    res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

// ============ 财务报表 ============

router.get('/finance', authenticateToken, checkPermission('report'), queryValidate(financeQuerySchema), async (req, res) => {
  try {
    const data = await reportAnalyticsService.getFinanceReport(pool, req.query);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[报表] 财务报表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 财务报表导出CSV
router.get('/finance/export', authenticateToken, checkPermission('report'), queryValidate(financeExportQuerySchema), async (req, res) => {
  try {
    const { rows, filename } = await reportAnalyticsService.exportFinance(pool, req.query);

    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '无数据可导出', data: null });
    }

    const headers = Object.keys(rows[0]);
    const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`);
    res.send('﻿' + csv);
  } catch (error) {
    console.error('[报表] 财务导出失败:', error);
    res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

// ============ 经营分析看板 ============

router.get('/business', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const data = await reportAnalyticsService.getBusinessDashboard(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    console.error('[报表] 经营分析查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const reportService = require('../../services/customReportService');

// --- Joi schemas ---

const customReportSchema = Joi.object({
  name: Joi.string().required().max(200).messages({'any.required': '报表名称不能为空'}),
  description: Joi.string().max(500).allow('', null),
  report_type: Joi.string().required().max(50).messages({'any.required': '报表类型不能为空'}),
  data_source: Joi.string().required().max(50).messages({'any.required': '数据来源不能为空'}),
  columns_config: Joi.string().allow('', null),
  filter_config: Joi.string().allow('', null),
  chart_config: Joi.string().allow('', null),
  is_public: Joi.number().integer().valid(0, 1).default(0)
});

const customReportUpdateSchema = Joi.object({
  name: Joi.string().max(200),
  description: Joi.string().max(500).allow('', null),
  report_type: Joi.string().max(50),
  data_source: Joi.string().max(50),
  columns_config: Joi.string().allow('', null),
  filter_config: Joi.string().allow('', null),
  chart_config: Joi.string().allow('', null),
  is_public: Joi.number().integer().valid(0, 1)
});

const customReportRunSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(20),
  filters: Joi.object().default({})
});

// --- Routes ---

// 获取自定义报表列表
router.get('/custom', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const rows = await reportService.listReports(pool, req.user.userId);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[报表] 自定义报表列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建自定义报表
router.post('/custom', authenticateToken, checkPermission('report'), validate(customReportSchema), async (req, res) => {
  try {
    const result = await reportService.createReport(pool, req.body, req.user.userId);
    if (result.error) return res.status(400).json({ code: 400, message: result.error, data: null });
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    console.error('[报表] 创建自定义报表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新自定义报表
router.put('/custom/:id', authenticateToken, checkPermission('report'), validate(customReportUpdateSchema), async (req, res) => {
  try {
    const result = await reportService.updateReport(pool, req.params.id, req.body, req.user.userId, req.user.manageAll);
    if (result.error) return res.status(result.status || 500).json({ code: result.status || 500, message: result.error, data: null });
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[报表] 更新自定义报表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除自定义报表
router.delete('/custom/:id', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const result = await reportService.deleteReport(pool, req.params.id, req.user.userId, req.user.manageAll);
    if (result.error) return res.status(result.status || 500).json({ code: result.status || 500, message: result.error, data: null });
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[报表] 删除自定义报表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 获取可用字段列表
router.get('/custom/fields/:source', authenticateToken, checkPermission('report'), async (req, res) => {
  try {
    const result = reportService.getFields(req.params.source);
    if (result.error) return res.status(400).json({ code: 400, message: result.error, data: null });
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    console.error('[报表] 获取字段列表错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 执行自定义报表
router.post('/custom/:id/run', authenticateToken, checkPermission('report'), validate(customReportRunSchema), async (req, res) => {
  try {
    const result = await reportService.runReport(pool, req.params.id, req.body);
    if (result.error) return res.status(result.status || 500).json({ code: result.status || 500, message: result.error, data: null });
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    console.error('[报表] 执行自定义报表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

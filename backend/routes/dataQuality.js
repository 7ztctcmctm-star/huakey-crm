/**
 * 数据质量路由（数据管理域）
 * 从 routes/customer/quality.js 剥离而来（Prompt 4-5 质量检查剥离）。
 * 统一挂载于 /api/v1/data-quality，权限点 data_quality:check。
 */

const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const qualityService = require('../services/dataManagement/qualityService');
const logger = require('../config/logger');

const qualityCheckSchema = Joi.object({
  table: Joi.string().valid('crm_customer', 'crm_supplier').default('crm_customer')
});

const qualityReportSchema = Joi.object({
  table: Joi.string().valid('crm_customer', 'crm_supplier').default('crm_customer')
});

const router = express.Router();

/**
 * 数据质量检查
 * POST /data-quality/check
 */
router.post('/check', authenticateToken, checkPermission('data_quality:check'), validate(qualityCheckSchema), async (req, res, next) => {
  try {
    const { table = 'crm_customer' } = req.body;
    const result = await qualityService.runQualityCheck(pool, table);
    res.json({ code: 200, message: '检查完成', data: result });
  } catch (error) {
    logger.error('数据质量检查失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    if (error.message === '不支持的表') {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    next(error);
  }
});

/**
 * 获取最近的质量报告
 * POST /data-quality/report
 */
router.post('/report', authenticateToken, checkPermission('data_quality:check'), validate(qualityReportSchema), async (req, res, next) => {
  try {
    const { table = 'crm_customer' } = req.body;
    const report = await qualityService.getQualityReport(pool, table);
    res.json({ code: 200, message: '查询成功', data: report });
  } catch (error) {
    logger.error('查询质量报告失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

module.exports = router;

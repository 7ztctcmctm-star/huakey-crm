const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const qualityService = require('../../services/qualityService');

const qualityCheckSchema = Joi.object({
  table: Joi.string().valid('crm_customer', 'crm_supplier').default('crm_customer')
});

const qualityReportSchema = Joi.object({
  table: Joi.string().valid('crm_customer', 'crm_supplier').default('crm_customer')
});

const router = express.Router();

/**
 * 数据质量检查
 * POST /customer/quality-check
 * 检查指定表的数据质量，返回统计报告
 */
router.post('/quality-check', authenticateToken, checkPermission('data_quality:check'), validate(qualityCheckSchema), async (req, res) => {
  try {
    const { table = 'crm_customer' } = req.body;
    const result = await qualityService.runQualityCheck(pool, table);
    res.json({ code: 200, message: '检查完成', data: result });
  } catch (error) {
    console.error('数据质量检查失败:', error);
    if (error.message === '不支持的表') {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    res.status(500).json({ code: 500, message: '检查失败', data: null });
  }
});

/**
 * 获取最近的质量报告
 * POST /customer/quality-report
 */
router.post('/quality-report', authenticateToken, validate(qualityReportSchema), async (req, res) => {
  try {
    const { table = 'crm_customer' } = req.body;
    const report = await qualityService.getQualityReport(pool, table);
    res.json({ code: 200, message: '查询成功', data: report });
  } catch (error) {
    console.error('查询质量报告失败:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;

const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { SOURCE_PARENT_MAP } = require('./detail');
const { validate, Joi } = require('../../middleware/validate');

const MODULE_NAME = '客户管理';

const { createRouteLogger } = require('../../middleware/logger');
const logAction = createRouteLogger(MODULE_NAME);

const leadsService = require('../../services/leadsService');
const logger = require('../../config/logger');

const router = express.Router();

// Validation schemas
const convertSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const claimSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const markLostSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const importLeadsSchema = Joi.object({
  leads: Joi.array().items(Joi.object({
    company_name: Joi.string().required(),
    contact_name: Joi.string().allow('', null),
    phone: Joi.string().allow('', null),
    source: Joi.string().allow('', null)
  })).min(1).required()
});

const batchConvertSchema = Joi.object({
  ids: Joi.array().items(Joi.number().integer().positive()).min(1).required()
});

// 线索列表
router.post('/list', authenticateToken, checkPermission('leads'), async (req, res) => {
  try {
    const result = await leadsService.getLeadsList(pool, req.body, req.user, SOURCE_PARENT_MAP);
    res.json({ code: 200, message: '获取线索列表成功', data: result });
  } catch (error) {
    logger.error('获取线索列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '获取线索列表失败', data: null });
  }
});

// 线索转化：将线索转为潜客（status 5→1）
router.post('/convert', authenticateToken, checkPermission('leads'), validate(convertSchema), async (req, res) => {
  try {
    const result = await leadsService.convertLead(pool, req.body.id);
    await logAction(req, 'convert', `线索转化: ${result.company_name} → 潜客`);
    res.json({ code: 200, message: '转化成功，已转为潜客', data: result });
  } catch (error) {
    logger.error('线索转化错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '转化失败', data: null });
  }
});

// 批量转化线索
router.post('/batch-convert', authenticateToken, checkPermission('leads'), validate(batchConvertSchema), async (req, res) => {
  try {
    const result = await leadsService.batchConvert(pool, req.body.ids);
    await logAction(req, 'batch-convert', `批量转化线索: ${result.converted}条成功`);
    res.json({ code: 200, message: '批量转化完成', data: result });
  } catch (error) {
    logger.error('批量转化错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '批量转化失败', data: null });
  }
});

// 导入线索
router.post('/import', authenticateToken, checkPermission('leads'), validate(importLeadsSchema), async (req, res) => {
  try {
    const result = await leadsService.importLeads(pool, req.body.leads, req.user.userId);
    await logAction(req, 'import', `导入线索: ${result.imported}条成功`);
    res.json({ code: 200, message: '导入完成', data: result });
  } catch (error) {
    logger.error('导入线索错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '导入失败', data: null });
  }
});

// 销售领取线索
router.post('/claim', authenticateToken, checkPermission('leads'), validate(claimSchema), async (req, res) => {
  try {
    const result = await leadsService.claimLead(pool, req.body.id, req.user.userId);
    await logAction(req, 'claim-lead', `领取线索: ${result.company_name}`);
    res.json({ code: 200, message: '领取成功，该线索已归您跟进', data: result });
  } catch (error) {
    logger.error('领取线索错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '领取失败', data: null });
  }
});

// 销售标记线索为已流失
router.post('/mark-lost', authenticateToken, checkPermission('leads'), validate(markLostSchema), async (req, res) => {
  try {
    await leadsService.markLeadLost(pool, req.body.id, req.user.userId);
    res.json({ code: 200, message: '已标记为流失', data: { id: req.body.id } });
  } catch (error) {
    logger.error('标记流失错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(error.code || 500).json({ code: error.code || 500, message: error.message || '操作失败', data: null });
  }
});

// 线索统计
router.get('/stats', authenticateToken, checkPermission('leads'), async (req, res) => {
  try {
    const result = await leadsService.getLeadsStats(pool, req.user);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('线索统计错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;

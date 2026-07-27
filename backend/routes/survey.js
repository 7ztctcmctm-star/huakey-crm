const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const requireAdmin = require('../middleware/admin');
const { requireManager } = require('../middleware/admin');
const { surveyRespondLimiter } = require('../middleware/rateLimiter');
const surveyService = require('../services/surveyService');
const logger = require('../config/logger');

// Joi schemas
const templateSchema = Joi.object({
  name: Joi.string().required().max(100),
  description: Joi.string().max(500).allow('', null),
  survey_type: Joi.string().valid('csat', 'nps', 'ces').optional(),
  questions: Joi.alternatives().try(Joi.array(), Joi.object(), Joi.string()).required()
});

const templateUpdateSchema = Joi.object({
  name: Joi.string().max(100).optional(),
  description: Joi.string().max(500).allow('', null),
  survey_type: Joi.string().valid('csat', 'nps', 'ces').optional(),
  questions: Joi.alternatives().try(Joi.array(), Joi.object(), Joi.string()).optional()
});

const campaignSchema = Joi.object({
  name: Joi.string().required().max(100),
  template_id: Joi.number().integer().positive().required(),
  target_type: Joi.string().valid('all', 'selected').optional(),
  target_ids: Joi.alternatives().try(Joi.array().items(Joi.number().integer().positive()), Joi.string()).optional(),
  send_method: Joi.string().valid('link', 'email', 'sms').optional(),
  start_date: Joi.date().iso().allow(null),
  end_date: Joi.date().iso().allow(null)
});

const campaignUpdateSchema = Joi.object({
  name: Joi.string().max(100).optional(),
  template_id: Joi.number().integer().positive().optional(),
  target_type: Joi.string().valid('all', 'selected').optional(),
  target_ids: Joi.alternatives().try(Joi.array().items(Joi.number().integer().positive()), Joi.string()).optional(),
  send_method: Joi.string().valid('link', 'email', 'sms').optional(),
  start_date: Joi.date().iso().allow(null),
  end_date: Joi.date().iso().allow(null)
});

const emptySchema = Joi.object({});

// ============ 模板管理 ============

// 模板列表
router.get('/templates', authenticateToken, checkPermission('survey'), async (req, res) => {
  try {
    const { page, pageSize } = req.query;
    const result = await surveyService.getTemplates(pool, { page, pageSize });
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[调查] 模板列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建模板
router.post('/templates', authenticateToken, checkPermission('survey'), requireManager, validate(templateSchema), async (req, res) => {
  try {
    const { name, questions } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ code: 400, message: '模板名称不能为空', data: null });
    if (!questions) return res.status(400).json({ code: 400, message: '问题配置不能为空', data: null });
    const result = await surveyService.createTemplate(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[调查] 创建模板失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新模板
router.put('/templates/:id', authenticateToken, checkPermission('survey'), requireManager, validate(templateUpdateSchema), async (req, res) => {
  try {
    const result = await surveyService.updateTemplate(pool, req.params.id, req.body);
    if (result.error === 'not_found') return res.status(404).json({ code: 404, message: '模板不存在', data: null });
    if (result.error === 'system_template') return res.status(403).json({ code: 403, message: '不能修改系统预设模板', data: null });
    if (result.error === 'no_fields') return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[调查] 更新模板失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除模板
router.delete('/templates/:id', authenticateToken, checkPermission('survey'), requireManager, async (req, res) => {
  try {
    const result = await surveyService.deleteTemplate(pool, req.params.id);
    if (result.error === 'not_found') return res.status(404).json({ code: 404, message: '模板不存在', data: null });
    if (result.error === 'system_template') return res.status(403).json({ code: 403, message: '不能删除系统预设模板', data: null });
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[调查] 删除模板失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 初始化系统预设模板
router.post('/templates/init', authenticateToken, checkPermission('survey'), requireAdmin, validate(emptySchema), async (req, res) => {
  try {
    const result = await surveyService.initTemplates(pool);
    if (result.count > 0 && !result.count) return res.json({ code: 200, message: '预设模板已存在', data: { count: result.count } });
    res.json({ code: 200, message: '初始化成功', data: { count: result.count } });
  } catch (error) {
    logger.error('[调查] 初始化预设模板失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 活动管理 ============

// 活动列表
router.get('/campaigns', authenticateToken, checkPermission('survey'), async (req, res) => {
  try {
    const { status } = req.query;
    const rows = await surveyService.getCampaigns(pool, { status });
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[调查] 活动列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 活动详情
router.get('/campaigns/:id', authenticateToken, checkPermission('survey'), async (req, res) => {
  try {
    const row = await surveyService.getCampaign(pool, req.params.id);
    if (!row) return res.status(404).json({ code: 404, message: '活动不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    logger.error('[调查] 活动详情查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建活动
router.post('/campaigns', authenticateToken, checkPermission('survey'), requireManager, validate(campaignSchema), async (req, res) => {
  try {
    const { name, template_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ code: 400, message: '活动名称不能为空', data: null });
    if (!template_id) return res.status(400).json({ code: 400, message: '请选择调查模板', data: null });
    const result = await surveyService.createCampaign(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[调查] 创建活动失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新活动
router.put('/campaigns/:id', authenticateToken, checkPermission('survey'), requireManager, validate(campaignUpdateSchema), async (req, res) => {
  try {
    const result = await surveyService.updateCampaign(pool, req.params.id, req.body);
    if (result.error === 'not_found') return res.status(404).json({ code: 404, message: '活动不存在', data: null });
    if (result.error === 'not_draft') return res.status(400).json({ code: 400, message: '只能编辑草稿状态的活动', data: null });
    if (result.error === 'no_fields') return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[调查] 更新活动失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 启动活动
router.post('/campaigns/:id/start', authenticateToken, checkPermission('survey'), requireManager, validate(emptySchema), async (req, res) => {
  try {
    const result = await surveyService.startCampaign(pool, req.params.id);
    if (result.error === 'not_found') return res.status(404).json({ code: 404, message: '活动不存在', data: null });
    if (result.error === 'not_draft') return res.status(400).json({ code: 400, message: '只有草稿状态的活动可以启动', data: null });
    res.json({ code: 200, message: '活动已启动', data: { total_sent: result.total_sent } });
  } catch (error) {
    logger.error('[调查] 启动活动失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 关闭活动
router.post('/campaigns/:id/close', authenticateToken, checkPermission('survey'), requireManager, validate(emptySchema), async (req, res) => {
  try {
    const result = await surveyService.closeCampaign(pool, req.params.id);
    if (result.error === 'not_found') return res.status(404).json({ code: 404, message: '活动不存在', data: null });
    if (result.error === 'not_active') return res.status(400).json({ code: 400, message: '只有进行中的活动可以关闭', data: null });
    res.json({ code: 200, message: '活动已关闭', data: null });
  } catch (error) {
    logger.error('[调查] 关闭活动失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 回复接口 ============

const respondSchema = Joi.object({
  campaign_id: Joi.number().integer().positive().required(),
  answers: Joi.object().required(),
  customer_id: Joi.number().integer().positive().allow(null),
  respondent_name: Joi.string().max(100).allow('', null),
  respondent_contact: Joi.string().max(100).allow('', null)
});

// 提交回复（公开接口，不需要登录；启用 IP+campaign_id 限流防刷）
router.post('/respond/:campaign_id', surveyRespondLimiter, validate(respondSchema), async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const result = await surveyService.submitResponse(pool, campaign_id, req.body);
    if (result.error === 'not_active') return res.status(400).json({ code: 400, message: '调查活动不存在或已关闭', data: null });
    if (result.error === 'invalid_answers') return res.status(400).json({ code: 400, message: 'answers 格式错误', data: null });
    res.json({ code: 200, message: '感谢您的反馈！', data: null });
  } catch (error) {
    logger.error('[调查] 提交回复失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 查看回复列表
router.get('/campaigns/:id/responses', authenticateToken, checkPermission('survey'), async (req, res) => {
  try {
    const { page, pageSize } = req.query;
    const result = await surveyService.getCampaignResponses(pool, req.params.id, { page, pageSize });
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[调查] 回复列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 分析接口 ============

// 整体满意度概览
router.get('/analytics/overview', authenticateToken, checkPermission('survey'), async (req, res) => {
  try {
    const result = await surveyService.getAnalyticsOverview(pool);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[调查] 满意度概览查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 单个活动分析
router.get('/analytics/:campaign_id', authenticateToken, checkPermission('survey'), async (req, res) => {
  try {
    const result = await surveyService.getCampaignAnalytics(pool, req.params.campaign_id);
    if (!result) return res.status(404).json({ code: 404, message: '活动不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[调查] 活动分析查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

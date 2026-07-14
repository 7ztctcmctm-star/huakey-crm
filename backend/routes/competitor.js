const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const competitorService = require('../services/competitorService');
const logger = require('../config/logger');

// Joi schemas
const competitorSchema = Joi.object({
  name: Joi.string().required().max(200).trim(),
  website: Joi.string().max(500).allow('', null),
  industry: Joi.string().max(100).allow('', null),
  scale: Joi.string().max(50).allow('', null),
  headquarters: Joi.string().max(200).allow('', null),
  strengths: Joi.alternatives().try(Joi.array(), Joi.string().max(5000)).allow(null),
  weaknesses: Joi.alternatives().try(Joi.array(), Joi.string().max(5000)).allow(null),
  products: Joi.string().max(2000).allow('', null),
  price_range: Joi.string().max(200).allow('', null),
  market_share: Joi.string().max(100).allow('', null),
  description: Joi.string().max(5000).allow('', null)
});

const competitorUpdateSchema = Joi.object({
  name: Joi.string().max(200).trim(),
  website: Joi.string().max(500).allow('', null),
  industry: Joi.string().max(100).allow('', null),
  scale: Joi.string().max(50).allow('', null),
  headquarters: Joi.string().max(200).allow('', null),
  strengths: Joi.alternatives().try(Joi.array(), Joi.string().max(5000)).allow(null),
  weaknesses: Joi.alternatives().try(Joi.array(), Joi.string().max(5000)).allow(null),
  products: Joi.string().max(2000).allow('', null),
  price_range: Joi.string().max(200).allow('', null),
  market_share: Joi.string().max(100).allow('', null),
  description: Joi.string().max(5000).allow('', null),
  status: Joi.number().integer().valid(0, 1).allow(null)
});

const encounterSchema = Joi.object({
  competitor_id: Joi.number().integer().positive().required(),
  customer_id: Joi.number().integer().positive().allow(null),
  opportunity_id: Joi.number().integer().positive().allow(null),
  encounter_type: Joi.string().valid('won', 'lost', 'competing', 'neutral').required(),
  our_price: Joi.number().precision(2).min(0).allow(null),
  their_price: Joi.number().precision(2).min(0).allow(null),
  win_reason: Joi.string().max(500).allow('', null),
  our_advantage: Joi.string().max(1000).allow('', null),
  their_advantage: Joi.string().max(1000).allow('', null),
  lesson_learned: Joi.string().max(2000).allow('', null),
  encounter_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null)
});

const encounterUpdateSchema = Joi.object({
  encounter_type: Joi.string().valid('won', 'lost', 'competing', 'neutral'),
  our_price: Joi.number().precision(2).min(0).allow(null),
  their_price: Joi.number().precision(2).min(0).allow(null),
  win_reason: Joi.string().max(500).allow('', null),
  our_advantage: Joi.string().max(1000).allow('', null),
  their_advantage: Joi.string().max(1000).allow('', null),
  lesson_learned: Joi.string().max(2000).allow('', null),
  encounter_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null)
});

const intelSchema = Joi.object({
  competitor_id: Joi.number().integer().positive().required(),
  intel_type: Joi.string().valid('pricing', 'product', 'strategy', 'market', 'technology', 'other').required(),
  title: Joi.string().required().max(200).trim(),
  content: Joi.string().required().max(10000).trim(),
  source: Joi.string().max(500).allow('', null),
  importance: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium')
});

const intelUpdateSchema = Joi.object({
  intel_type: Joi.string().valid('pricing', 'product', 'strategy', 'market', 'technology', 'other'),
  title: Joi.string().max(200).trim(),
  content: Joi.string().max(10000).trim(),
  source: Joi.string().max(500).allow('', null),
  importance: Joi.string().valid('low', 'medium', 'high', 'critical'),
  verified: Joi.number().integer().valid(0, 1).allow(null)
});

// ============ 竞争对手 ============

const competitorListHandler = async (req, res) => {
  const source = req.method === "GET" ? req.query : req.body;
  try {
    const data = await competitorService.listCompetitors(pool, source);
    res.json({ code: 200, message: "查询成功", data });
  } catch (error) {
    logger.error("[竞品] 列表查询失败:", { error: error.stack || error.message, traceId: req.traceId || "N/A" });
    res.status(500).json({ code: 500, message: "服务器内部错误", data: null });
  }
};
router.get("/list", authenticateToken, checkPermission("competitor:view"), competitorListHandler);
router.post("/list", authenticateToken, checkPermission("competitor:view"), competitorListHandler);


router.get('/:id', authenticateToken, checkPermission('competitor:view'), async (req, res) => {
  try {
    const row = await competitorService.getCompetitor(pool, req.params.id);
    if (!row) return res.status(404).json({ code: 404, message: '竞争对手不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    logger.error('[竞品] 详情查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/add', authenticateToken, checkPermission('competitor:add'), validate(competitorSchema), async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ code: 400, message: '名称不能为空', data: null });
    const result = await competitorService.createCompetitor(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[竞品] 创建失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/:id', authenticateToken, checkPermission('competitor:edit'), validate(competitorUpdateSchema), async (req, res) => {
  try {
    await competitorService.updateCompetitor(pool, req.params.id, req.body);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[竞品] 更新失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/:id', authenticateToken, checkPermission('competitor:delete'), async (req, res) => {
  try {
    await competitorService.deleteCompetitor(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[竞品] 删除失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 交锋记录 ============

router.get('/:id/encounters', authenticateToken, checkPermission('competitor:view'), async (req, res) => {
  try {
    const data = await competitorService.getEncounters(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[竞品] 交锋记录查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/encounters/add', authenticateToken, checkPermission('competitor:edit'), validate(encounterSchema), async (req, res) => {
  try {
    if (!req.body.competitor_id || !req.body.encounter_type) return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    const result = await competitorService.addEncounter(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[竞品] 创建交锋记录失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/encounters/:id', authenticateToken, checkPermission('competitor:edit'), validate(encounterUpdateSchema), async (req, res) => {
  try {
    await competitorService.updateEncounter(pool, req.params.id, req.body);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[竞品] 更新交锋记录失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/encounters/:id', authenticateToken, checkPermission('competitor:delete'), async (req, res) => {
  try {
    await competitorService.deleteEncounter(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[竞品] 删除交锋记录失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 情报 ============

router.get('/:id/intel', authenticateToken, checkPermission('competitor:view'), async (req, res) => {
  try {
    const data = await competitorService.getIntel(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[竞品] 情报查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/intel/add', authenticateToken, checkPermission('competitor:edit'), validate(intelSchema), async (req, res) => {
  try {
    if (!req.body.competitor_id || !req.body.intel_type || !req.body.title || !req.body.content) return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    const result = await competitorService.addIntel(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[竞品] 创建情报失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/intel/:id', authenticateToken, checkPermission('competitor:edit'), validate(intelUpdateSchema), async (req, res) => {
  try {
    await competitorService.updateIntel(pool, req.params.id, req.body);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[竞品] 更新情报失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/intel/:id', authenticateToken, checkPermission('competitor:delete'), async (req, res) => {
  try {
    await competitorService.deleteIntel(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[竞品] 删除情报失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 分析总览 ============

router.get('/analysis/overview', authenticateToken, checkPermission('competitor:view'), async (req, res) => {
  try {
    const data = await competitorService.getAnalysisOverview(pool);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[竞品] 分析总览查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.get('/analysis/compare', authenticateToken, checkPermission('competitor:view'), async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
    if (ids.length === 0) return res.status(400).json({ code: 400, message: '请选择竞争对手', data: null });
    const data = await competitorService.getComparison(pool, ids);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('[竞品] 对比查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

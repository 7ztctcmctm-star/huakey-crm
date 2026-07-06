const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const requireAdmin = require('../middleware/admin');
const { validate, Joi } = require('../middleware/validate');
const automationService = require('../services/automationService');
const logger = require('../config/logger');

// --- Joi schemas ---

const createWorkflowSchema = Joi.object({
  name: Joi.string().required().max(100),
  description: Joi.string().allow('', null).optional().max(500),
  trigger_event: Joi.string().required().max(50),
  conditions: Joi.alternatives().try(Joi.array().items(Joi.object()), Joi.string()).optional(),
  actions: Joi.alternatives().try(Joi.array().items(Joi.object()), Joi.string()).required()
});

const updateWorkflowSchema = Joi.object({
  name: Joi.string().max(100).optional(),
  description: Joi.string().allow('', null).optional().max(500),
  trigger_event: Joi.string().max(50).optional(),
  conditions: Joi.alternatives().try(Joi.array().items(Joi.object()), Joi.string()).optional(),
  actions: Joi.alternatives().try(Joi.array().items(Joi.object()), Joi.string()).optional(),
  status: Joi.number().integer().valid(0, 1).optional()
});

const executeWorkflowSchema = Joi.object({
  rule_id: Joi.number().integer().required(),
  target_type: Joi.string().required().max(50),
  target_id: Joi.number().integer().required()
});

const triggerWorkflowSchema = Joi.object({
  event: Joi.string().required().max(50),
  target_type: Joi.string().max(50).allow(null).optional(),
  target_id: Joi.number().integer().allow(null).optional()
});

const createAssignRuleSchema = Joi.object({
  rule_name: Joi.string().required().max(100),
  assign_type: Joi.string().valid('round_robin', 'by_source', 'by_region').required(),
  source_value: Joi.string().allow('', null).optional().max(100),
  region_value: Joi.string().allow('', null).optional().max(100),
  user_ids: Joi.alternatives().try(Joi.array().items(Joi.number().integer()), Joi.string()).optional(),
  priority: Joi.number().integer().optional(),
  is_active: Joi.boolean().optional()
});

const updateAssignRuleSchema = Joi.object({
  rule_name: Joi.string().max(100).optional(),
  assign_type: Joi.string().valid('round_robin', 'by_source', 'by_region').optional(),
  source_value: Joi.string().allow('', null).optional().max(100),
  region_value: Joi.string().allow('', null).optional().max(100),
  user_ids: Joi.alternatives().try(Joi.array().items(Joi.number().integer()), Joi.string()).optional(),
  priority: Joi.number().integer().optional(),
  is_active: Joi.boolean().optional()
});

const applyAssignRuleSchema = Joi.object({
  customer_id: Joi.number().integer().allow(null).optional(),
  customer_ids: Joi.array().items(Joi.number().integer()).optional()
});

const createSmartReminderSchema = Joi.object({
  name: Joi.string().required().max(100),
  reminder_type: Joi.string().valid('followup_gap', 'contract_expire', 'payment_due', 'inactive').required(),
  config: Joi.alternatives().try(Joi.object(), Joi.string()).required(),
  notify_to: Joi.string().valid('owner', 'boss').optional(),
  notify_method: Joi.string().optional().max(50)
});

const updateSmartReminderSchema = Joi.object({
  name: Joi.string().max(100).optional(),
  reminder_type: Joi.string().valid('followup_gap', 'contract_expire', 'payment_due', 'inactive').optional(),
  config: Joi.alternatives().try(Joi.object(), Joi.string()).optional(),
  notify_to: Joi.string().valid('owner', 'boss').optional(),
  notify_method: Joi.string().optional().max(50),
  status: Joi.number().integer().valid(0, 1).optional()
});

const emptySchema = Joi.object({});

// ============ 工作流规则 ============

// 规则列表
// [权限说明] 工作流列表供已登录用户查看；增删改用 requireAdmin 控制
router.get('/workflows', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await automationService.getWorkflows(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[自动化] 工作流列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建规则
router.post('/workflows', authenticateToken, requireAdmin, validate(createWorkflowSchema), async (req, res) => {
  try {
    const { name, description, trigger_event, conditions, actions } = req.body;
    if (!name || !trigger_event || !actions) return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    const result = await automationService.createWorkflow(pool, { name, description, trigger_event, conditions, actions }, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[自动化] 创建工作流失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新规则
router.put('/workflows/:id', authenticateToken, requireAdmin, validate(updateWorkflowSchema), async (req, res) => {
  try {
    const updated = await automationService.updateWorkflow(pool, req.params.id, req.body);
    if (!updated) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[自动化] 更新工作流失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除规则
router.delete('/workflows/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await automationService.deleteWorkflow(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[自动化] 删除工作流失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 启用/禁用
router.post('/workflows/:id/toggle', authenticateToken, requireAdmin, validate(emptySchema), async (req, res) => {
  try {
    const result = await automationService.toggleWorkflow(pool, req.params.id);
    if (!result) return res.status(404).json({ code: 404, message: '规则不存在', data: null });
    res.json({ code: 200, message: result.status ? '已启用' : '已禁用', data: { status: result.status } });
  } catch (error) {
    logger.error('[自动化] 切换状态失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 手动执行（测试）
router.post('/workflows/execute', authenticateToken, requireAdmin, validate(executeWorkflowSchema), async (req, res) => {
  try {
    const { rule_id, target_type, target_id } = req.body;
    const result = await automationService.executeWorkflow(pool, { rule_id, target_type, target_id });
    if (!result) return res.status(404).json({ code: 404, message: '规则不存在', data: null });
    res.json({ code: 200, message: '执行完成', data: result });
  } catch (error) {
    logger.error('[自动化] 执行失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 触发器入口
// [权限说明] 工作流触发由业务事件驱动，仅需认证即可调用
router.post('/workflows/trigger', authenticateToken, validate(triggerWorkflowSchema), async (req, res) => {
  try {
    const { event, target_type, target_id } = req.body;
    if (!event) return res.status(400).json({ code: 400, message: '事件不能为空', data: null });
    const result = await automationService.triggerWorkflow(pool, { event, target_type, target_id });
    res.json({ code: 200, message: '触发完成', data: result });
  } catch (error) {
    logger.error('[自动化] 触发失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 执行日志
// [权限说明] 执行日志供已登录用户查看，不涉及敏感操作
router.get('/workflows/logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rule_id, page, pageSize } = req.query;
    const result = await automationService.getWorkflowLogs(pool, { rule_id, page, pageSize });
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[自动化] 日志查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 自动分配规则 ============

// [权限说明] 分配规则列表供已登录用户查看；增删改用 requireAdmin 控制
router.get('/assign-rules', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await automationService.getAssignRules(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[自动化] 分配规则查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/assign-rules', authenticateToken, requireAdmin, validate(createAssignRuleSchema), async (req, res) => {
  try {
    const { rule_name, assign_type } = req.body;
    if (!rule_name || !assign_type) return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    const result = await automationService.createAssignRule(pool, req.body);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[自动化] 创建分配规则失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/assign-rules/:id', authenticateToken, requireAdmin, validate(updateAssignRuleSchema), async (req, res) => {
  try {
    const updated = await automationService.updateAssignRule(pool, req.params.id, req.body);
    if (!updated) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[自动化] 更新分配规则失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/assign-rules/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await automationService.deleteAssignRule(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[自动化] 删除分配规则失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 执行自动分配
router.post('/assign-rules/apply', authenticateToken, requireAdmin, validate(applyAssignRuleSchema), async (req, res) => {
  try {
    const { customer_id, customer_ids } = req.body;
    const ids = customer_ids || (customer_id ? [customer_id] : []);
    if (ids.length === 0) return res.status(400).json({ code: 400, message: '请选择客户', data: null });
    const results = await automationService.applyAssignRule(pool, { customer_id, customer_ids });
    res.json({ code: 200, message: '分配完成', data: results });
  } catch (error) {
    logger.error('[自动化] 自动分配失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 智能提醒 ============

// [权限说明] 智能提醒列表供已登录用户查看；增删改用 requireAdmin 控制
router.get('/smart-reminders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await automationService.getSmartReminders(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[自动化] 智能提醒列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/smart-reminders', authenticateToken, requireAdmin, validate(createSmartReminderSchema), async (req, res) => {
  try {
    const { name, reminder_type, config } = req.body;
    if (!name || !reminder_type || !config) return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    const result = await automationService.createSmartReminder(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[自动化] 创建智能提醒失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/smart-reminders/:id', authenticateToken, requireAdmin, validate(updateSmartReminderSchema), async (req, res) => {
  try {
    const updated = await automationService.updateSmartReminder(pool, req.params.id, req.body);
    if (!updated) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[自动化] 更新智能提醒失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/smart-reminders/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await automationService.deleteSmartReminder(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[自动化] 删除智能提醒失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 执行智能提醒扫描
router.post('/smart-reminders/run', authenticateToken, requireAdmin, validate(emptySchema), async (req, res) => {
  try {
    const totalFound = await automationService.runSmartReminder(pool);
    res.json({ code: 200, message: `扫描完成，发现 ${totalFound} 条新提醒`, data: { found: totalFound } });
  } catch (error) {
    logger.error('[自动化] 智能提醒扫描失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 我的待处理提醒
// [权限说明] 个人待处理提醒，仅需认证
router.get('/smart-reminders/pending', authenticateToken, async (req, res) => {
  try {
    const rows = await automationService.getPendingReminders(pool, req.user.userId);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[自动化] 待处理提醒查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 标记已读
// [权限说明] 个人提醒标记已读，仅需认证
router.put('/smart-reminders/log/:id/seen', authenticateToken, validate(emptySchema), async (req, res) => {
  try {
    await automationService.markReminderSeen(pool, req.params.id, req.user.userId);
    res.json({ code: 200, message: '已标记', data: null });
  } catch (error) {
    logger.error('[自动化] 标记已读失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

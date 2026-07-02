const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { requireManager } = require('../middleware/admin');
const { validate, Joi } = require('../middleware/validate');
const hrService = require('../services/hrService');
const logger = require('../config/logger');

const employeeProfileSchema = Joi.object({
  gender: Joi.string().max(20).allow('', null),
  birth_date: Joi.string().max(20).allow('', null),
  id_card: Joi.string().max(50).allow('', null),
  hire_date: Joi.string().max(20).allow('', null),
  leave_date: Joi.string().max(20).allow('', null),
  position: Joi.string().max(100).allow('', null),
  employment_type: Joi.string().max(50).allow('', null),
  contract_start: Joi.string().max(20).allow('', null),
  contract_end: Joi.string().max(20).allow('', null),
  salary_base: Joi.number().min(0).allow(null),
  salary_commission_rate: Joi.number().min(0).allow(null),
  bank_name: Joi.string().max(100).allow('', null),
  bank_account: Joi.string().max(100).allow('', null),
  emergency_contact: Joi.string().max(100).allow('', null),
  emergency_phone: Joi.string().max(50).allow('', null),
  address: Joi.string().max(500).allow('', null),
  education: Joi.string().max(50).allow('', null),
  university: Joi.string().max(100).allow('', null),
  major: Joi.string().max(100).allow('', null),
  remark: Joi.string().max(1000).allow('', null)
});

const commissionRuleSchema = Joi.object({
  name: Joi.string().required().max(200),
  rule_type: Joi.string().required().max(100),
  apply_to: Joi.string().max(100).allow('', null),
  config: Joi.alternatives().try(Joi.object(), Joi.string()).required(),
  remark: Joi.string().max(1000).allow('', null)
});

const commissionRuleUpdateSchema = Joi.object({
  name: Joi.string().max(200).allow('', null),
  rule_type: Joi.string().max(100).allow('', null),
  apply_to: Joi.string().max(100).allow('', null),
  config: Joi.alternatives().try(Joi.object(), Joi.string()).allow(null),
  status: Joi.number().integer().valid(0, 1).allow(null),
  remark: Joi.string().max(1000).allow('', null)
});

const commissionCalculateSchema = Joi.object({
  period: Joi.string().pattern(/^\d{4}-\d{2}$/).required(),
  user_ids: Joi.array().items(Joi.number().integer().positive()).allow(null)
});

const batchIdsSchema = Joi.object({
  ids: Joi.array().items(Joi.number().integer().positive()).min(1).required()
});

// ============ 员工档案 ============

// 员工列表
router.get('/employees', authenticateToken, checkPermission('hr'), requireManager, async (req, res) => {
  try {
    const { dept_id, status, keyword, contract_expiring, page, pageSize } = req.query;
    const result = await hrService.getEmployees(pool, { dept_id, status, keyword, contract_expiring, page, pageSize });
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[HR] 员工列表查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 员工统计
router.get('/employees/stats', authenticateToken, checkPermission('hr'), requireManager, async (req, res) => {
  try {
    const result = await hrService.getEmployeeStats(pool);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[HR] 员工统计查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 员工详情
router.get('/employees/:id', authenticateToken, checkPermission('hr'), requireManager, async (req, res) => {
  try {
    const row = await hrService.getEmployee(pool, req.params.id);
    if (!row) return res.status(404).json({ code: 404, message: '员工不存在', data: null });
    res.json({ code: 200, message: '查询成功', data: row });
  } catch (error) {
    logger.error('[HR] 员工详情查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 员工薪资信息（仅管理员可访问）
router.get('/employees/:id/salary', authenticateToken, checkPermission('hr'), requireManager, async (req, res) => {
  try {
    const result = await hrService.getEmployeeSalary(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[HR] 员工薪资查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建/更新员工档案
router.post('/employees/:id/profile', authenticateToken, checkPermission('hr'), requireManager, validate(employeeProfileSchema), async (req, res) => {
  try {
    const result = await hrService.saveEmployeeProfile(pool, req.params.id, req.body);
    if (result === null) return res.status(404).json({ code: 404, message: '员工不存在', data: null });
    if (!result) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    res.json({ code: 200, message: '保存成功', data: null });
  } catch (error) {
    logger.error('[HR] 员工档案保存失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 员工佣金汇总
router.get('/employees/:id/commission', authenticateToken, checkPermission('hr'), requireManager, async (req, res) => {
  try {
    const result = await hrService.getEmployeeCommission(pool, req.params.id);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[HR] 员工佣金查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 佣金规则 ============

router.get('/commission/rules', authenticateToken, checkPermission('hr'), requireManager, async (req, res) => {
  try {
    const rows = await hrService.getCommissionRules(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[HR] 佣金规则查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.post('/commission/rules', authenticateToken, checkPermission('hr'), requireManager, validate(commissionRuleSchema), async (req, res) => {
  try {
    const { name, rule_type, config } = req.body;
    if (!name || !rule_type || !config) return res.status(400).json({ code: 400, message: '参数不完整', data: null });
    const result = await hrService.createCommissionRule(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: result });
  } catch (error) {
    logger.error('[HR] 创建佣金规则失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.put('/commission/rules/:id', authenticateToken, checkPermission('hr'), requireManager, validate(commissionRuleUpdateSchema), async (req, res) => {
  try {
    const updated = await hrService.updateCommissionRule(pool, req.params.id, req.body);
    if (!updated) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    logger.error('[HR] 更新佣金规则失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

router.delete('/commission/rules/:id', authenticateToken, checkPermission('hr'), requireManager, async (req, res) => {
  try {
    await hrService.deleteCommissionRule(pool, req.params.id);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    logger.error('[HR] 删除佣金规则失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 计算佣金
router.post('/commission/calculate', authenticateToken, checkPermission('hr'), requireManager, validate(commissionCalculateSchema), async (req, res) => {
  try {
    const { period, user_ids } = req.body;
    if (!period) return res.status(400).json({ code: 400, message: '请选择月份', data: null });
    const result = await hrService.calculateCommission(pool, { period, user_ids });
    res.json({ code: 200, message: '计算完成', data: result });
  } catch (error) {
    logger.error('[HR] 佣金计算失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 佣金记录列表
router.get('/commission/records', authenticateToken, checkPermission('hr'), requireManager, async (req, res) => {
  try {
    const { period, user_id, status, page, pageSize } = req.query;
    const result = await hrService.getCommissionRecords(pool, { period, user_id, status, page, pageSize });
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[HR] 佣金记录查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 佣金统计
router.get('/commission/stats', authenticateToken, checkPermission('hr'), requireManager, async (req, res) => {
  try {
    const result = await hrService.getCommissionStats(pool);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[HR] 佣金统计查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 批量确认
router.post('/commission/records/batch-confirm', authenticateToken, checkPermission('hr'), requireManager, validate(batchIdsSchema), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || ids.length === 0) return res.status(400).json({ code: 400, message: '请选择记录', data: null });
    await hrService.batchConfirmCommission(pool, ids);
    res.json({ code: 200, message: '确认成功', data: null });
  } catch (error) {
    logger.error('[HR] 批量确认失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 批量发放
router.post('/commission/records/batch-pay', authenticateToken, checkPermission('hr'), requireManager, validate(batchIdsSchema), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || ids.length === 0) return res.status(400).json({ code: 400, message: '请选择记录', data: null });
    await hrService.batchPayCommission(pool, ids);
    res.json({ code: 200, message: '发放成功', data: null });
  } catch (error) {
    logger.error('[HR] 批量发放失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// ============ 组织架构 ============

router.get('/org-tree', authenticateToken, checkPermission('hr'), requireManager, async (req, res) => {
  try {
    const result = await hrService.getOrgTree(pool);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[HR] 组织架构查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 部门员工列表
router.get('/org-tree/:deptId/employees', authenticateToken, checkPermission('hr'), requireManager, async (req, res) => {
  try {
    const rows = await hrService.getDeptEmployees(pool, req.params.deptId);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    logger.error('[HR] 部门员工查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

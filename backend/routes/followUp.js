const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission, buildDataPermissionWhere } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const followUpService = require('../services/followUpService');
const logger = require('../config/logger');

const router = express.Router();

const followUpAddSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  contact_id: Joi.number().integer().positive().allow(null),
  follow_type: Joi.string().max(50).allow('', null),
  content: Joi.string().required().max(5000),
  next_time: Joi.date().iso().allow(null),
  next_content: Joi.string().max(1000).allow('', null),
  attachment_ids: Joi.array().items(Joi.number().integer().positive()).allow(null),
  advance_status: Joi.boolean().optional()
});

const followUpBatchAddSchema = Joi.object({
  items: Joi.array().items(Joi.object({
    customer_id: Joi.number().integer().positive().required(),
    content: Joi.string().required().max(5000),
    follow_type: Joi.string().max(50).allow('', null),
    next_time: Joi.date().iso().allow(null)
  })).min(1).max(20).required()
});

const followUpUpdateSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  contact_id: Joi.number().integer().positive().allow(null),
  follow_type: Joi.string().max(50).allow('', null),
  content: Joi.string().required().max(5000),
  next_time: Joi.date().iso().allow(null),
  next_content: Joi.string().max(1000).allow('', null)
});

const followUpDeleteSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const followUpListSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional()
});

const followUpCalendarSchema = Joi.object({
  year: Joi.number().integer().min(1900).max(2100).required(),
  month: Joi.number().integer().min(1).max(12).required()
});

const followPlanAddSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  contact_id: Joi.number().integer().positive().allow(null),
  plan_time: Joi.date().iso().required(),
  plan_content: Joi.string().max(500).required(),
  follow_type: Joi.string().max(20).default('电话')
});

const followPlanListSchema = Joi.object({
  customer_id: Joi.number().integer().positive().allow(null),
  status: Joi.string().valid('pending', 'completed', 'overdue', 'cancelled').allow('', null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null),
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional()
});

const followPlanCompleteSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  content: Joi.string().max(2000).required(),
  follow_type: Joi.string().max(20).allow(null)
});

const followPlanCancelSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// 1. 添加跟进记录
router.post('/add', authenticateToken, checkPermission('customer:edit'), validate(followUpAddSchema), async (req, res, next) => {
  try {
    const result = await followUpService.addFollowUp(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '添加跟进记录成功', data: result });
  } catch (error) {
    logger.error('添加跟进记录错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '添加跟进记录失败', data: null });
  }
});

// 批量添加跟进记录
router.post('/batch-add', authenticateToken, checkPermission('customer:edit'), validate(followUpBatchAddSchema), async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ code: 400, message: '跟进记录不能为空', data: null });
    }
    if (items.length > 20) {
      return res.status(400).json({ code: 400, message: '单次批量跟进不超过20条', data: null });
    }

    const result = await followUpService.batchAddFollowUp(pool, items, req.user.userId);
    res.json({ code: 200, message: `成功录入 ${result.count} 条跟进记录`, data: result });
  } catch (error) {
    logger.error('批量跟进错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 2. 获取客户的跟进记录列表
router.post('/list', authenticateToken, checkPermission('followup:calendar'), checkDataPermission('followup', 'create_by'), validate(followUpListSchema), async (req, res, next) => {
  try {
    const { customer_id, page = 1, pageSize = 20 } = req.body;
    if (!customer_id) {
      return res.status(400).json({ code: 400, message: '客户ID不能为空', data: null });
    }

    const permission = await buildDataPermissionWhere(req.dataPermission, 'f');
    const data = await followUpService.listFollowUps(pool, { customer_id, page, pageSize }, permission);
    res.json({ code: 200, message: '获取跟进记录成功', data });
  } catch (error) {
    logger.error('获取跟进记录错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 3. 获取今日需要跟进的提醒
router.get('/remind', authenticateToken, checkPermission('followup:calendar'), checkDataPermission('followup', 'create_by'), async (req, res, next) => {
  try {
    const permission = await buildDataPermissionWhere(req.dataPermission, 'f');
    const data = await followUpService.getTodayRemind(pool, permission);
    res.json({ code: 200, message: '获取今日待跟进成功', data });
  } catch (error) {
    logger.error('获取今日待跟进错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 3.1 明日计划跟进列表
router.get('/tomorrow', authenticateToken, checkPermission('followup:calendar'), checkDataPermission('followup', 'create_by'), async (req, res, next) => {
  try {
    const permission = await buildDataPermissionWhere(req.dataPermission, 'f');
    const data = await followUpService.getTomorrowPlan(pool, permission);
    res.json({ code: 200, message: '获取明日计划成功', data });
  } catch (error) {
    logger.error('获取明日计划错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 3.2 逾期未跟进列表
router.get('/overdue', authenticateToken, checkPermission('followup:calendar'), checkDataPermission('followup', 'create_by'), async (req, res, next) => {
  try {
    const permission = await buildDataPermissionWhere(req.dataPermission, 'f');
    const data = await followUpService.getOverdueList(pool, permission);
    res.json({ code: 200, message: '获取逾期跟进成功', data });
  } catch (error) {
    logger.error('获取逾期跟进错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 3.3 任务统计（今日/明日/逾期数量）
router.get('/task-stats', authenticateToken, checkPermission('followup:calendar'), checkDataPermission('followup', 'create_by'), async (req, res, next) => {
  try {
    const data = await followUpService.getTaskStats(pool, req.dataPermission);
    res.json({ code: 200, message: '获取统计成功', data });
  } catch (error) {
    logger.error('获取任务统计错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 4. 编辑跟进记录
router.post('/update', authenticateToken, checkPermission('customer:edit'), validate(followUpUpdateSchema), async (req, res, next) => {
  try {
    await followUpService.updateFollowUp(pool, req.body, req.user);
    res.json({ code: 200, message: '修改跟进记录成功', data: null });
  } catch (error) {
    logger.error('修改跟进记录错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '修改跟进记录失败', data: null });
  }
});

// 5. 删除跟进记录
router.post('/delete', authenticateToken, checkPermission('customer:delete'), validate(followUpDeleteSchema), async (req, res, next) => {
  try {
    await followUpService.deleteFollowUp(pool, req.body.id, req.user);
    res.json({ code: 200, message: '删除跟进记录成功', data: null });
  } catch (error) {
    logger.error('删除跟进记录错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '删除跟进记录失败', data: null });
  }
});

// 6. 跟进日历：获取某月的跟进记录（含下次跟进时间）
router.post('/calendar', authenticateToken, checkPermission('followup:calendar'), checkDataPermission('followup', 'create_by'), validate(followUpCalendarSchema), async (req, res, next) => {
  try {
    const { year, month } = req.body;
    if (!year || !month) {
      return res.status(400).json({ code: 400, message: '请提供年份和月份', data: null });
    }

    const data = await followUpService.getCalendar(pool, { year, month }, req.dataPermission);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('跟进日历查询错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// ====== 跟进计划（合并模型：is_plan=1 的跟进记录） ======
// 7. 创建跟进计划
router.post('/plan/add', authenticateToken, checkPermission('customer:edit'), validate(followPlanAddSchema), async (req, res, next) => {
  try {
    const result = await followUpService.addPlan(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建跟进计划成功', data: { id: result.id } });
  } catch (error) {
    logger.error('创建跟进计划错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '创建跟进计划失败', data: null });
  }
});

// 8. 跟进计划列表
router.post('/plan/list', authenticateToken, checkPermission('customer:edit'), checkDataPermission('followup', 'create_by'), validate(followPlanListSchema), async (req, res, next) => {
  try {
    const permission = await buildDataPermissionWhere(req.dataPermission, 'f');
    const data = await followUpService.listPlans(pool, req.body, permission);
    res.json({ code: 200, message: '获取跟进计划列表成功', data });
  } catch (error) {
    logger.error('获取跟进计划列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 9. 完成跟进计划（is_plan 置 0 + 填充完成时间）
router.post('/plan/complete', authenticateToken, checkPermission('customer:edit'), validate(followPlanCompleteSchema), async (req, res, next) => {
  try {
    await followUpService.completePlan(pool, req.body);
    res.json({ code: 200, message: '跟进计划已完成', data: null });
  } catch (error) {
    logger.error('完成跟进计划错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '完成跟进计划失败', data: null });
  }
});

// 10. 取消跟进计划（软删除）
router.post('/plan/cancel', authenticateToken, validate(followPlanCancelSchema), async (req, res, next) => {
  try {
    const { id } = req.body;
    const { roleId, userId, manageAll } = req.user;
    await followUpService.cancelPlan(pool, { id, roleId, userId, manageAll });
    res.json({ code: 200, message: '跟进计划已取消', data: null });
  } catch (error) {
    logger.error('取消跟进计划错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '取消跟进计划失败', data: null });
  }
});

module.exports = router;

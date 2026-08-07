const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const serviceOrderService = require('../services/serviceOrderService');
const logger = require('../config/logger');

// Joi schemas
const listSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(10),
  keyword: Joi.string().max(200).allow('', null),
  status: Joi.number().integer().allow('', null),
  type: Joi.string().max(50).allow('', null),
  priority: Joi.number().integer().allow('', null),
  assignee_id: Joi.number().integer().allow('', null),
  created_today: Joi.boolean().allow('', null),
  is_timeout: Joi.boolean().allow('', null)
});

const addSchema = Joi.object({
  customer_id: Joi.number().integer().required().messages({'any.required': '客户ID必填'}),
  contract_id: Joi.number().integer().allow(null),
  type: Joi.string().required().max(50).messages({'any.required': '工单类型必填'}),
  title: Joi.string().required().max(200).messages({'any.required': '工单标题必填'}),
  description: Joi.string().max(2000).allow('', null),
  priority: Joi.number().integer().min(1).max(4).default(3),
  attachment_ids: Joi.array().items(Joi.number().integer())
});

const updateSchema = Joi.object({
  id: Joi.number().integer().required().messages({'any.required': '工单ID必填'}),
  customer_id: Joi.number().integer(),
  contract_id: Joi.number().integer().allow(null),
  type: Joi.string().max(50),
  title: Joi.string().max(200),
  description: Joi.string().max(2000).allow('', null),
  priority: Joi.number().integer().min(1).max(4),
  attachment_ids: Joi.array().items(Joi.number().integer())
});

const idSchema = Joi.object({
  id: Joi.number().integer().required().messages({'any.required': '工单ID必填'})
});

const assignSchema = Joi.object({
  id: Joi.number().integer().required().messages({'any.required': '工单ID必填'}),
  assignee_id: Joi.number().integer().required().messages({'any.required': '请选择工程师'})
});

const batchAssignSchema = Joi.object({
  ids: Joi.array().items(Joi.number().integer()).min(1).max(50).required().messages({'any.required': '请选择要分配的工单'}),
  assignee_id: Joi.number().integer().required().messages({'any.required': '请选择工程师'})
});

const finishSchema = Joi.object({
  id: Joi.number().integer().required().messages({'any.required': '工单ID必填'}),
  finish_desc: Joi.string().max(2000).allow('', null)
});

const confirmSchema = Joi.object({
  id: Joi.number().integer().required().messages({'any.required': '工单ID必填'}),
  satisfaction: Joi.number().integer().min(1).max(5).required().messages({'any.required': '满意度评分必填'})
});

// 获取工单列表
router.post('/list', authenticateToken, checkPermission('service'), checkDataPermission('service', 'create_by'), validate(listSchema), async (req, res, next) => {
  try {
    const permissionClause = await serviceOrderService.buildServicePermissionClause(pool, req.dataPermission);
    const data = await serviceOrderService.listServiceOrders(pool, req.body, permissionClause);
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 获取工单详情
router.get('/detail/:id', authenticateToken, async (req, res, next) => {
  try {
    const data = await serviceOrderService.getServiceOrderDetail(pool, req.params.id);
    if (!data) {
      return res.status(404).json({ code: 404, message: '工单不存在', data: null });
    }

    if (!(await serviceOrderService.canManageService(pool, req.user, data))) {
      return res.status(403).json({ code: 403, message: '无权查看该工单', data: null });
    }

    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 创建工单
router.post('/add', authenticateToken, checkPermission('service:add'), validate(addSchema), async (req, res, next) => {
  try {
    const result = await serviceOrderService.createServiceOrder(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建工单成功', data: result });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '创建工单失败', data: null });
  }
});

// 更新工单
router.post('/update', authenticateToken, checkPermission('service:edit'), validate(updateSchema), async (req, res, next) => {
  try {
    await serviceOrderService.updateServiceOrder(pool, req.body, req.user);
    res.json({ code: 200, message: '修改工单成功', data: null });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '修改工单失败', data: null });
  }
});

// 删除工单
router.post('/delete', authenticateToken, checkPermission('service:delete'), validate(idSchema), async (req, res, next) => {
  try {
    await serviceOrderService.deleteServiceOrder(pool, req.body.id, req.user);
    res.json({ code: 200, message: '删除工单成功', data: null });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '删除工单失败', data: null });
  }
});

// 分配工程师
router.post('/assign', authenticateToken, checkPermission('service:edit'), validate(assignSchema), async (req, res, next) => {
  try {
    const { id, assignee_id } = req.body;
    await serviceOrderService.assignServiceOrder(pool, id, assignee_id, req.user);
    res.json({ code: 200, message: '分配成功', data: null });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '分配失败', data: null });
  }
});

// 批量分配工程师
router.post('/batch-assign', authenticateToken, checkPermission('service:edit'), validate(batchAssignSchema), async (req, res, next) => {
  try {
    const { ids, assignee_id } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择要分配的工单', data: null });
    }
    if (!assignee_id) {
      return res.status(400).json({ code: 400, message: '请选择工程师', data: null });
    }
    if (ids.length > 50) {
      return res.status(400).json({ code: 400, message: '单次批量分配不超过50条', data: null });
    }

    const result = await serviceOrderService.batchAssignServiceOrders(pool, ids, assignee_id, req.user.userId);
    res.json({ code: 200, message: `已批量分配 ${result.count} 个工单`, data: result });
  } catch (error) {
    logger.error('批量分配工单错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 开始处理
router.post('/start', authenticateToken, checkPermission('service:edit'), validate(idSchema), async (req, res, next) => {
  try {
    await serviceOrderService.startServiceOrder(pool, req.body.id, req.user);
    res.json({ code: 200, message: '开始处理', data: null });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '操作失败', data: null });
  }
});

// 完成处理（提交结果）
router.post('/finish', authenticateToken, checkPermission('service:edit'), validate(finishSchema), async (req, res, next) => {
  try {
    const { id, finish_desc } = req.body;
    await serviceOrderService.finishServiceOrder(pool, id, finish_desc, req.user);
    res.json({ code: 200, message: '处理完成，请等待客户确认', data: null });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '操作失败', data: null });
  }
});

// 客户确认
router.post('/confirm', authenticateToken, checkPermission('service:edit'), validate(confirmSchema), async (req, res, next) => {
  try {
    const { id, satisfaction } = req.body;
    await serviceOrderService.confirmServiceOrder(pool, id, satisfaction, req.user);
    res.json({ code: 200, message: '确认完成', data: null });
  } catch (error) {
    logger.error('捕获到错误', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    const status = error.code && typeof error.code === 'number' ? error.code : 500;
    res.status(status).json({ code: status, message: error.message || '操作失败', data: null });
  }
});

// 获取服务类型列表
router.get('/types', authenticateToken, (req, res) => {
  const types = [
    { value: '安装', label: '安装' },
    { value: '维修', label: '维修' },
    { value: '保养', label: '保养' },
    { value: '培训', label: '培训' },
    { value: '投诉', label: '投诉' },
    { value: '咨询', label: '咨询' },
    { value: '退换货', label: '退换货' },
    { value: '其他', label: '其他' }
  ];
  res.json({ code: 200, message: '查询成功', data: types });
});

// 获取状态列表
router.get('/status-list', authenticateToken, (req, res) => {
  const statusList = [
    { value: 1, label: '待分配' },
    { value: 2, label: '已分配' },
    { value: 3, label: '处理中' },
    { value: 4, label: '待确认' },
    { value: 5, label: '已完成' }
  ];
  res.json({ code: 200, message: '查询成功', data: statusList });
});

// 获取优先级列表
router.get('/priority-list', authenticateToken, (req, res) => {
  const priorityList = [
    { value: 1, label: '紧急' },
    { value: 2, label: '高' },
    { value: 3, label: '中' },
    { value: 4, label: '低' }
  ];
  res.json({ code: 200, message: '查询成功', data: priorityList });
});

module.exports = router;

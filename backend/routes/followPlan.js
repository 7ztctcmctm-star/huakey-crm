const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission, checkDataPermission, buildDataPermissionWhere } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const ROLES = require('../config/roles');
const followPlanService = require('../services/followPlanRouteService');

const router = express.Router();

const addPlanSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  contact_id: Joi.number().integer().positive().allow(null),
  plan_time: Joi.date().iso().required(),
  plan_content: Joi.string().max(500).required(),
  follow_type: Joi.string().max(20).default('电话')
});

const listPlanSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  customer_id: Joi.number().integer().positive().allow(null),
  status: Joi.string().valid('pending', 'completed', 'overdue').allow('', null),
  start_date: Joi.string().isoDate().allow('', null),
  end_date: Joi.string().isoDate().allow('', null)
});

const completePlanSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  content: Joi.string().max(2000).required(),
  follow_type: Joi.string().max(20).allow(null)
});

const cancelPlanSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// 1. 创建跟进计划
router.post('/add', authenticateToken, checkPermission('customer:edit'), validate(addPlanSchema), async (req, res) => {
  try {
    const result = await followPlanService.addPlan(pool, req.body, req.user.userId);
    if (result.error) {
      return res.status(result.status).json({ code: result.status, message: result.error, data: null });
    }
    res.json({ code: 200, message: '创建跟进计划成功', data: { id: result.id } });
  } catch (error) {
    console.error('创建跟进计划错误:', error);
    res.status(500).json({ code: 500, message: '创建跟进计划失败', data: null });
  }
});

// 2. 跟进计划列表
router.post('/list', authenticateToken, checkPermission('customer:edit'), checkDataPermission('followPlan', 'create_by'), validate(listPlanSchema), async (req, res) => {
  try {
    const result = await followPlanService.listPlans(pool, req.body, req.dataPermission, buildDataPermissionWhere);
    res.json({ code: 200, message: '获取跟进计划列表成功', data: result });
  } catch (error) {
    console.error('获取跟进计划列表错误:', error);
    res.status(500).json({ code: 500, message: '获取跟进计划列表失败', data: null });
  }
});

// 3. 完成跟进计划（事务：更新状态 + 创建跟进记录 + 更新客户最后跟进时间）
router.post('/complete', authenticateToken, checkPermission('customer:edit'), validate(completePlanSchema), async (req, res) => {
  try {
    const result = await followPlanService.completePlan(pool, req.body, req.user.userId);
    if (result.error) {
      return res.status(result.status).json({ code: result.status, message: result.error, data: null });
    }
    res.json({ code: 200, message: '跟进计划已完成', data: null });
  } catch (error) {
    console.error('完成跟进计划错误:', error);
    res.status(500).json({ code: 500, message: '完成跟进计划失败', data: null });
  }
});

// 4. 取消跟进计划（软删除，仅创建人或管理员）
router.post('/cancel', authenticateToken, validate(cancelPlanSchema), async (req, res) => {
  try {
    const { id } = req.body;
    const { roleId, userId, manageAll } = req.user;
    const result = await followPlanService.cancelPlan(pool, { id, roleId, userId, manageAll }, ROLES);
    if (result.error) {
      return res.status(result.status).json({ code: result.status, message: result.error, data: null });
    }
    res.json({ code: 200, message: '跟进计划已取消', data: null });
  } catch (error) {
    console.error('取消跟进计划错误:', error);
    res.status(500).json({ code: 500, message: '取消跟进计划失败', data: null });
  }
});

module.exports = router;

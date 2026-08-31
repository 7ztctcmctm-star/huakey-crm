const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const ROLES = require('../config/roles');
const teamDashboardService = require('../services/teamDashboardService');
const logger = require('../config/logger');
const { validate, Joi } = require('../middleware/validate');

const salesDrilldownSchema = Joi.object({
  user_id: Joi.number().integer().positive().required(),
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional()
});

const urgeFollowupSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  user_id: Joi.number().integer().positive().required()
});

// 老板团队跟单全景视图 API

// 1. 团队总览卡片数据
router.get('/overview', authenticateToken, checkPermission('team-dashboard'), async (req, res, next) => {
  try {
    const isBoss = req.user.viewAll || ROLES.ADMIN_ROLE_CODES.has(req.user.roleCode);
    const { startDate, endDate } = req.query;
    const data = await teamDashboardService.getOverview(pool, {
      userId: req.user.userId, isBoss, startDate, endDate
    });
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('团队概览错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 2. 每个销售的实况卡片
router.get('/sales-breakdown', authenticateToken, checkPermission('team-dashboard'), async (req, res, next) => {
  try {
    const isBoss = req.user.viewAll || req.user.roleId === ROLES.ADMIN || req.user.roleId === ROLES.MANAGER;
    const data = await teamDashboardService.getSalesBreakdown(pool, {
      userId: req.user.userId, isBoss
    });
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('销售实况错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 3. 下钻：某个销售的逾期未跟进客户明细
router.post('/sales-overdue-customers', authenticateToken, checkPermission('team-dashboard'), validate(salesDrilldownSchema), async (req, res, next) => {
  try {
    const { user_id, page = 1, pageSize = 20 } = req.body;
    if (!user_id) {
      return res.status(400).json({ code: 400, message: '请指定销售人员', data: null });
    }
    const data = await teamDashboardService.getSalesOverdueCustomers(pool, { user_id, page, pageSize });
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('逾期客户错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 4. 下钻：某个销售的所有客户列表
router.post('/sales-customers', authenticateToken, checkPermission('team-dashboard'), validate(salesDrilldownSchema), async (req, res, next) => {
  try {
    const { user_id, page = 1, pageSize = 20 } = req.body;
    if (!user_id) {
      return res.status(400).json({ code: 400, message: '请指定销售人员', data: null });
    }
    const data = await teamDashboardService.getSalesCustomers(pool, { user_id, page, pageSize });
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('销售客户错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 5. 催办：主管对销售员的逾期客户发起跟进催促
router.post('/urge-followup', authenticateToken, checkPermission('team-dashboard'), validate(urgeFollowupSchema), async (req, res, next) => {
  try {
    const { customer_id, user_id } = req.body;
    const isBoss = req.user.viewAll || req.user.roleId === ROLES.ADMIN || req.user.roleId === ROLES.MANAGER;

    if (!isBoss) {
      return res.status(403).json({ code: 403, message: '仅主管/管理员可催办', data: null });
    }
    if (!customer_id || !user_id) {
      return res.status(400).json({ code: 400, message: '客户ID和销售员ID不能为空', data: null });
    }

    const result = await teamDashboardService.urgeFollowup(pool, {
      customer_id, user_id, senderUserId: req.user.userId
    });

    if (result.error === 'not_found') {
      return res.status(404).json({ code: 404, message: '客户不存在或不属于该销售员', data: null });
    }
    if (result.error === 'duplicate') {
      return res.status(400).json({ code: 400, message: '今日已催办过该客户', data: null });
    }

    res.json({ code: 200, message: '催办成功', data: null });
  } catch (error) {
    logger.error('催办错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 6. 获取待审批列表（报价+合同，供团队看板直接审批）
router.get('/pending-approvals', authenticateToken, checkPermission('team-dashboard'), async (req, res, next) => {
  try {
    const isBoss = req.user.viewAll || req.user.roleId === ROLES.ADMIN || req.user.roleId === ROLES.MANAGER;
    if (!isBoss) {
      return res.status(403).json({ code: 403, message: '无权限', data: null });
    }
    const data = await teamDashboardService.getPendingApprovals(pool, { roleId: req.user.roleId });
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('待审批列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

// 8. 卡住的商机（阶段停留超过N天未推进）
router.get('/stuck-opportunities', authenticateToken, checkPermission('team-dashboard'), async (req, res, next) => {
  try {
    const isBoss = req.user.viewAll || req.user.roleId === ROLES.ADMIN || req.user.roleId === ROLES.MANAGER;
    if (!isBoss) {
      return res.status(403).json({ code: 403, message: '仅主管可查看', data: null });
    }
    const data = await teamDashboardService.getStuckOpportunities(pool, {
      userId: req.user.userId, isBoss, viewAll: req.user.viewAll, roleId: req.user.roleId
    });
    res.json({ code: 200, message: '查询成功', data });
  } catch (error) {
    logger.error('卡住商机查询错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

module.exports = router;

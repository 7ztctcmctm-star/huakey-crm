const express = require('express');
const pool = require('../../config/database');
const { authenticateToken } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { validate, Joi } = require('../../middleware/validate');
const { SOURCE_PARENT_MAP } = require('./detail');
const poolService = require('../../services/poolService');

const MODULE_NAME = '客户管理';

const claimCustomerSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required()
});

const releaseCustomerSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required()
});

const { createRouteLogger } = require('../../middleware/logger');
const logAction = createRouteLogger(MODULE_NAME);

const router = express.Router();

// 公海客户列表
router.post('/pool', authenticateToken, checkPermission('customer:pool'), async (req, res) => {
  try {
    const result = await poolService.listPoolCustomers(pool, req.body, SOURCE_PARENT_MAP);
    res.json({ code: 200, message: '获取公海客户列表成功', data: result });
  } catch (error) {
    console.error('获取公海客户列表错误:', error);
    res.status(500).json({ code: 500, message: '获取公海客户列表失败', data: null });
  }
});

// 认领公海客户
router.post('/claim', authenticateToken, checkPermission('customer:pool'), validate(claimCustomerSchema), async (req, res) => {
  try {
    const result = await poolService.claimCustomer(pool, req.body.customer_id, req.user.userId, req.user);
    if (result.error) return res.status(result.status || 500).json({ code: result.status || 500, message: result.error, data: result.protect_until ? { protect_until: result.protect_until } : null });
    await logAction(req, 'claim', `认领客户: ${result.company_name}`);
    res.json({ code: 200, message: '认领客户成功', data: { protect_until: result.protect_until } });
  } catch (error) {
    console.error('认领客户错误:', error);
    res.status(500).json({ code: 500, message: '认领客户失败', data: null });
  }
});

// 批量认领公海客户
router.post('/batch-claim', authenticateToken, checkPermission('customer:pool'), async (req, res) => {
  try {
    const result = await poolService.batchClaimCustomers(pool, req.body.customer_ids, req.user.userId, req.user);
    if (result.error) return res.status(result.status || 500).json({ code: result.status || 500, message: result.error, data: null });
    await logAction(req, 'batch-claim', `批量认领 ${result.claimed} 个客户`);
    const msg = `成功认领 ${result.claimed} 个客户` + (result.skipped.length > 0 ? `，跳过: ${result.skipped.join('; ')}` : '');
    res.json({ code: 200, message: msg, data: { claimed: result.claimed, skipped: result.skipped.length > 0 ? result.skipped : null } });
  } catch (error) {
    console.error('批量认领错误:', error);
    res.status(500).json({ code: 500, message: '批量认领失败', data: null });
  }
});

// 释放客户到公海
router.post('/release', authenticateToken, checkPermission('customer:pool'), validate(releaseCustomerSchema), async (req, res) => {
  try {
    const result = await poolService.releaseCustomer(pool, req.body.customer_id, req.user.userId, req.user);
    if (result.error) return res.status(result.status || 500).json({ code: result.status || 500, message: result.error, data: null });
    await logAction(req, 'release', `释放客户到公海: ${result.company_name}`);
    res.json({ code: 200, message: '释放客户成功', data: null });
  } catch (error) {
    console.error('释放客户错误:', error);
    res.status(500).json({ code: 500, message: '释放客户失败', data: null });
  }
});

// 批量释放客户到公海
router.post('/batch-release', authenticateToken, checkPermission('customer:pool'), async (req, res) => {
  try {
    const result = await poolService.batchReleaseCustomers(pool, req.body.customer_ids, req.user.userId, req.user);
    if (result.error) return res.status(result.status || 500).json({ code: result.status || 500, message: result.error, data: null });
    await logAction(req, 'batch-release', `批量释放 ${result.count} 个客户到公海`);
    res.json({ code: 200, message: `成功释放 ${result.count} 个客户`, data: { count: result.count } });
  } catch (error) {
    console.error('批量释放错误:', error);
    res.status(500).json({ code: 500, message: '批量释放失败', data: null });
  }
});

// 获取公海操作日志
router.post('/pool-log', authenticateToken, checkPermission('customer:pool'), async (req, res) => {
  try {
    const result = await poolService.getPoolLogs(pool, req.body);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    console.error('查询公海日志错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

module.exports = router;

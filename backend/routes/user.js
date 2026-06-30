const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const userRouteService = require('../services/userRouteService');
const logger = require('../config/logger');

const router = express.Router();

const userListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  pageSize: Joi.number().integer().min(1).max(200).optional().default(10),
  username: Joi.string().allow('').optional().max(50),
  realName: Joi.string().allow('').optional().max(50)
});

const userAddSchema = Joi.object({
  username: Joi.string().required().max(50).trim(),
  password: Joi.string().required().min(6).max(100),
  real_name: Joi.string().allow(null, '').optional().max(50),
  phone: Joi.string().allow(null, '').optional().max(20),
  email: Joi.string().email().allow(null, '').optional().max(100),
  dept_id: Joi.number().integer().allow(null).optional(),
  role_id: Joi.number().integer().allow(null).optional()
});

const userUpdateSchema = Joi.object({
  id: Joi.number().integer().required(),
  real_name: Joi.string().allow(null, '').optional().max(50),
  phone: Joi.string().allow(null, '').optional().max(20),
  email: Joi.string().email().allow(null, '').optional().max(100),
  dept_id: Joi.number().integer().allow(null).optional(),
  role_id: Joi.number().integer().allow(null).optional(),
  status: Joi.number().integer().valid(0, 1).optional()
});

const userDeleteSchema = Joi.object({
  id: Joi.number().integer().required()
});

// 1. 获取用户列表
router.post('/list', authenticateToken, checkPermission('system:user'), validate(userListSchema), async (req, res) => {
  try {
    const data = await userRouteService.listUsers(pool, req.body);
    res.json({ code: 200, message: '获取用户列表成功', data });
  } catch (error) {
    logger.error('获取用户列表错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '获取用户列表失败', data: null });
  }
});

// 2. 添加用户
router.post('/add', authenticateToken, checkPermission('system:user:add'), validate(userAddSchema), async (req, res) => {
  try {
    const result = await userRouteService.addUser(pool, req.body);
    res.json({ code: 200, message: '添加用户成功', data: result });
  } catch (error) {
    const status = error.statusCode || 500;
    logger.error('添加用户错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(status).json({ code: status, message: error.message || '添加用户失败', data: null });
  }
});

// 3. 修改用户
router.post('/update', authenticateToken, checkPermission('system:user:edit'), validate(userUpdateSchema), async (req, res) => {
  try {
    await userRouteService.updateUser(pool, req.body);
    res.json({ code: 200, message: '修改用户成功', data: null });
  } catch (error) {
    const status = error.statusCode || 500;
    logger.error('修改用户错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(status).json({ code: status, message: error.message || '修改用户失败', data: null });
  }
});

// 4. 删除用户（逻辑删除）
router.post('/delete', authenticateToken, checkPermission('system:user:delete'), validate(userDeleteSchema), async (req, res) => {
  try {
    await userRouteService.deleteUser(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '删除用户成功', data: null });
  } catch (error) {
    const status = error.statusCode || 500;
    logger.error('删除用户错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(status).json({ code: status, message: error.message || '删除用户失败', data: null });
  }
});

// 5. 获取用户详情
router.get('/detail/:id', authenticateToken, checkPermission('system:user'), async (req, res) => {
  try {
    const data = await userRouteService.getUserDetail(pool, req.params.id);
    res.json({ code: 200, message: '获取用户详情成功', data });
  } catch (error) {
    const status = error.statusCode || 500;
    logger.error('获取用户详情错误:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(status).json({ code: status, message: error.message || '获取用户详情失败', data: null });
  }
});

module.exports = router;

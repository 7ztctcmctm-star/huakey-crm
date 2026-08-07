const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const { logAction, getIpAddress } = require('../middleware/logger');
const { PASSWORD_PATTERN, PASSWORD_MESSAGE } = require('../services/authService');
const userRouteService = require('../services/userRouteService');

const router = express.Router();

const userListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  pageSize: Joi.number().integer().min(1).max(200).optional().default(10),
  username: Joi.string().allow('').optional().max(50),
  realName: Joi.string().allow('').optional().max(50)
});

// [v1.0.1 安全补丁] 密码策略统一：至少8位 + 大小写字母 + 数字（与 authService 一致）
const userAddSchema = Joi.object({
  username: Joi.string().required().max(50).trim(),
  password: Joi.string().required().min(8).max(100).pattern(PASSWORD_PATTERN).message(PASSWORD_MESSAGE),
  real_name: Joi.string().allow(null, '').optional().max(50),
  phone: Joi.string().allow(null, '').optional().max(20),
  email: Joi.string().email().allow(null, '').optional().max(100),
  dept_id: Joi.number().integer().allow(null).optional(),
  role_id: Joi.number().integer().allow(null).optional()
});

// [v1.0.1 安全补丁] 管理员重置密码校验
const userResetPasswordSchema = Joi.object({
  id: Joi.number().integer().required(),
  new_password: Joi.string().required().min(8).max(100).pattern(PASSWORD_PATTERN).message(PASSWORD_MESSAGE)
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
router.post('/list', authenticateToken, checkPermission('system:user'), validate(userListSchema), async (req, res, next) => {
  try {
    const data = await userRouteService.listUsers(pool, req.body);
    res.json({ code: 200, message: '获取用户列表成功', data });
  } catch (error) {
    next(error);
  }
});

// 2. 添加用户
router.post('/add', authenticateToken, checkPermission('system:user:add'), validate(userAddSchema), async (req, res, next) => {
  try {
    const result = await userRouteService.addUser(pool, req.body);
    res.json({ code: 200, message: '添加用户成功', data: result });
  } catch (error) {
    next(error);
  }
});

// 3. 修改用户
router.post('/update', authenticateToken, checkPermission('system:user:edit'), validate(userUpdateSchema), async (req, res, next) => {
  try {
    await userRouteService.updateUser(pool, req.body);
    res.json({ code: 200, message: '修改用户成功', data: null });
  } catch (error) {
    next(error);
  }
});

// 4. 删除用户（逻辑删除 + 级联：档案离职、客户入公海、商机释放）
router.post('/delete', authenticateToken, checkPermission('system:user:delete'), validate(userDeleteSchema), async (req, res, next) => {
  try {
    const result = await userRouteService.deleteUser(pool, req.body, req.user.userId);
    const msgParts = [`已删除用户「${result.username}」`];
    if (result.customersReleased > 0) msgParts.push(`${result.customersReleased} 个客户已释放到公海池`);
    if (result.opportunitiesReleased > 0) msgParts.push(`${result.opportunitiesReleased} 个商机已转移或释放`);
    res.json({ code: 200, message: msgParts.join('，'), data: result });
  } catch (error) {
    next(error);
  }
});

// 5. 获取用户详情
router.get('/detail/:id', authenticateToken, checkPermission('system:user'), async (req, res, next) => {
  try {
    const data = await userRouteService.getUserDetail(pool, req.params.id);
    res.json({ code: 200, message: '获取用户详情成功', data });
  } catch (error) {
    next(error);
  }
});

// 6. 重置用户密码（管理员操作，复用 system:user:edit 权限）
//    [v1.0.1 安全补丁] 重置后强制用户下次登录改密
router.post('/reset-password', authenticateToken, checkPermission('system:user:edit'), validate(userResetPasswordSchema), async (req, res, next) => {
  const { id, new_password } = req.body;
  try {
    const result = await userRouteService.resetPassword(pool, id, new_password);
    await logAction({
      module: '用户管理',
      action: '重置密码',
      method: 'POST',
      url: '/api/v1/user/reset-password',
      params: { id },
      ipAddress: getIpAddress(req),
      userId: req.user.userId,
      userName: req.user.real_name || req.user.username,
      description: `重置用户「${result.username}」密码，已要求下次登录修改`,
      status: 1
    });
    res.json({ code: 200, message: `已重置用户「${result.username}」密码，下次登录需修改密码`, data: { id: result.id } });
  } catch (error) {
    await logAction({
      module: '用户管理',
      action: '重置密码',
      method: 'POST',
      url: '/api/v1/user/reset-password',
      params: { id },
      ipAddress: getIpAddress(req),
      userId: req.user.userId,
      userName: req.user.real_name || req.user.username,
      description: `重置用户密码失败：${error.message}`,
      status: 0,
      errorMsg: error.message
    });
    next(error);
  }
});

module.exports = router;

const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { clearPermissionCache, clearAllPermissionCache } = require('../services/permissionService');
const { validate, Joi } = require('../middleware/validate');
const roleService = require('../services/roleRouteService');

const router = express.Router();

const roleAddSchema = Joi.object({
  name: Joi.string().required().max(100),
  code: Joi.string().required().max(50),
  description: Joi.string().allow(null, '').optional()
});

const roleUpdateSchema = Joi.object({
  id: Joi.number().integer().required(),
  name: Joi.string().max(100).optional(),
  code: Joi.string().max(50).optional(),
  description: Joi.string().allow(null, '').optional(),
  status: Joi.number().integer().valid(0, 1).optional().default(1)
});

const roleDeleteSchema = Joi.object({
  id: Joi.number().integer().required()
});

const emptySchema = Joi.object({});

router.post('/list', authenticateToken, checkPermission('system:role'), validate(emptySchema), async (req, res, next) => {
  try {
    const result = await roleService.listRoles(pool);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[角色管理] 查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

const requireAdmin = require('../middleware/admin');
const logger = require('../config/logger');

router.post('/add', authenticateToken, requireAdmin, validate(roleAddSchema), async (req, res, next) => {
  try {
    const id = await roleService.addRole(pool, req.body);
    res.json({ code: 200, message: '新增角色成功', data: { id } });
  } catch (error) {
    logger.error('[角色管理] 新增角色失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.post('/update', authenticateToken, requireAdmin, validate(roleUpdateSchema), async (req, res, next) => {
  try {
    await roleService.updateRole(pool, req.body, clearPermissionCache, clearAllPermissionCache);
    res.json({ code: 200, message: '修改角色成功', data: null });
  } catch (error) {
    logger.error('[角色管理] 修改角色失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.post('/delete', authenticateToken, requireAdmin, validate(roleDeleteSchema), async (req, res, next) => {
  try {
    await roleService.deleteRole(pool, req.body.id, clearPermissionCache, clearAllPermissionCache);
    res.json({ code: 200, message: '删除角色成功', data: null });
  } catch (error) {
    logger.error('[角色管理] 删除角色失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    if (error.message.includes('无法删除')) {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    next(error);
  }
});

module.exports = router;

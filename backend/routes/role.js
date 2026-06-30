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

router.post('/list', authenticateToken, checkPermission('system:role'), async (req, res) => {
  try {
    const result = await roleService.listRoles(pool);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[角色管理] 查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

const requireAdmin = require('../middleware/admin');
const logger = require('../config/logger');

router.post('/add', authenticateToken, requireAdmin, validate(roleAddSchema), async (req, res) => {
  try {
    const id = await roleService.addRole(pool, req.body);
    res.json({ code: 200, message: '新增角色成功', data: { id } });
  } catch (error) {
    logger.error('[角色管理] 新增角色失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '新增角色失败', data: null });
  }
});

router.post('/update', authenticateToken, requireAdmin, validate(roleUpdateSchema), async (req, res) => {
  try {
    await roleService.updateRole(pool, req.body, clearPermissionCache, clearAllPermissionCache);
    res.json({ code: 200, message: '修改角色成功', data: null });
  } catch (error) {
    logger.error('[角色管理] 修改角色失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    res.status(500).json({ code: 500, message: '修改角色失败', data: null });
  }
});

router.post('/delete', authenticateToken, requireAdmin, validate(roleDeleteSchema), async (req, res) => {
  try {
    await roleService.deleteRole(pool, req.body.id, clearPermissionCache, clearAllPermissionCache);
    res.json({ code: 200, message: '删除角色成功', data: null });
  } catch (error) {
    logger.error('[角色管理] 删除角色失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    if (error.message.includes('无法删除')) {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    res.status(500).json({ code: 500, message: '删除角色失败', data: null });
  }
});

module.exports = router;

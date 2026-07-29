const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');
const deptService = require('../services/deptRouteService');

const router = express.Router();

const deptAddSchema = Joi.object({
  name: Joi.string().required().max(100),
  parent_id: Joi.number().integer().min(0).allow(null).optional().default(0),
  sort: Joi.number().integer().min(0).optional().default(0)
});

const deptUpdateSchema = Joi.object({
  id: Joi.number().integer().required(),
  name: Joi.string().max(100).optional(),
  parent_id: Joi.number().integer().min(0).optional().default(0),
  sort: Joi.number().integer().min(0).optional().default(0)
});

const deptDeleteSchema = Joi.object({
  id: Joi.number().integer().required()
});

const deptListSchema = Joi.object({});

const requireAdmin = require('../middleware/admin');
const logger = require('../config/logger');

router.post('/list', authenticateToken, checkPermission('system:dept'), validate(deptListSchema), async (req, res, next) => {
  try {
    const result = await deptService.listDepts(pool);
    res.json({ code: 200, message: '查询成功', data: result });
  } catch (error) {
    logger.error('[部门管理] 查询失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.post('/add', authenticateToken, requireAdmin, validate(deptAddSchema), async (req, res, next) => {
  try {
    const result = await deptService.addDept(pool, req.body);
    res.json({ code: 200, message: '新增部门成功', data: { id: result.id } });
  } catch (error) {
    logger.error('[部门管理] 新增部门失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.post('/update', authenticateToken, requireAdmin, validate(deptUpdateSchema), async (req, res, next) => {
  try {
    await deptService.updateDept(pool, req.body);
    res.json({ code: 200, message: '修改部门成功', data: null });
  } catch (error) {
    logger.error('[部门管理] 修改部门失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

router.post('/delete', authenticateToken, requireAdmin, validate(deptDeleteSchema), async (req, res, next) => {
  try {
    const result = await deptService.deleteDept(pool, req.body);
    if (result.error) {
      return res.status(result.status).json({ code: result.status, message: result.error, data: null });
    }
    res.json({ code: 200, message: '删除部门成功', data: null });
  } catch (error) {
    logger.error('[部门管理] 删除部门失败:', { error: error.stack || error.message, traceId: req.traceId || 'N/A' });
    next(error);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { requireManager } = require('../middleware/admin');
const { success, fail, serverError, notFound } = require('../utils/response');
const { validate, Joi } = require('../middleware/validate');
const contractTemplateService = require('../services/contractTemplateService');

const templateManageSchema = Joi.object({
  action: Joi.string().valid('add', 'update', 'delete').required(),
  id: Joi.number().integer().positive().when('action', { is: Joi.valid('update', 'delete'), then: Joi.required() }),
  name: Joi.string().max(200).when('action', { is: Joi.valid('add', 'update'), then: Joi.required() }),
  amount: Joi.number().precision(2).min(0).allow(null),
  payment_terms: Joi.string().max(500).allow('', null),
  delivery_days: Joi.number().integer().min(1).max(365).allow(null),
  remark: Joi.string().max(1000).allow('', null)
});

// 获取模板列表
router.get('/list', authenticateToken, checkPermission('contract_template'), async (req, res) => {
  try {
    const templates = await contractTemplateService.listTemplates(pool);
    success(res, templates);
  } catch (error) {
    console.error('获取模板列表错误:', error);
    serverError(res, '查询失败');
  }
});

// 获取模板详情
router.get('/:id', authenticateToken, checkPermission('contract_template'), async (req, res) => {
  try {
    const template = await contractTemplateService.getTemplate(pool, req.params.id);
    success(res, template);
  } catch (error) {
    if (error.statusCode === 404) return notFound(res, error.message);
    console.error('获取模板详情错误:', error);
    serverError(res, '查询失败');
  }
});

// 管理模板（仅管理员/经理）
router.post('/manage', authenticateToken, checkPermission('contract_template'), requireManager, validate(templateManageSchema), async (req, res) => {
  try {
    const result = await contractTemplateService.manageTemplate(pool, req.body);
    if (req.body.action === 'add') {
      success(res, result, '模板已添加');
    } else if (req.body.action === 'update') {
      success(res, null, '模板已更新');
    } else if (req.body.action === 'delete') {
      success(res, null, '模板已删除');
    }
  } catch (error) {
    if (error.statusCode === 400) return fail(res, error.message);
    console.error('管理模板错误:', error);
    serverError(res, '操作失败');
  }
});

module.exports = router;

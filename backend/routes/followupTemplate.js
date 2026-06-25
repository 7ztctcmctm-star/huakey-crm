const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { requireAdmin, requireManager } = require('../middleware/admin');
const { validate, Joi } = require('../middleware/validate');
const templateService = require('../services/followupTemplateRouteService');

const templateCreateSchema = Joi.object({
  name: Joi.string().required().max(200).trim(),
  type: Joi.string().valid('first', 'quote', 'deal', 'general').default('general'),
  content: Joi.string().required().max(5000).trim()
});

const templateUpdateSchema = Joi.object({
  name: Joi.string().max(200).trim(),
  type: Joi.string().valid('first', 'quote', 'deal', 'general'),
  content: Joi.string().max(5000).trim()
});

// 获取所有模板
router.get('/', authenticateToken, checkPermission('followup_template'), async (req, res) => {
  try {
    const rows = await templateService.listTemplates(pool);
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[跟进模板] 获取列表失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 创建模板（仅管理员/经理）
router.post('/', authenticateToken, checkPermission('followup_template'), requireManager, validate(templateCreateSchema), async (req, res) => {
  try {
    const id = await templateService.createTemplate(pool, req.body, req.user.userId);
    res.json({ code: 200, message: '创建成功', data: { id } });
  } catch (error) {
    console.error('[跟进模板] 创建失败:', error);
    if (error.message === '模板名称不能为空' || error.message === '模板内容不能为空') {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新模板（仅管理员）
router.put('/:id', authenticateToken, checkPermission('followup_template'), requireAdmin, validate(templateUpdateSchema), async (req, res) => {
  try {
    await templateService.updateTemplate(pool, req.params.id, req.body, req.user.userId);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[跟进模板] 更新失败:', error);
    if (error.message === '模板不存在') {
      return res.status(404).json({ code: 404, message: error.message, data: null });
    }
    if (error.message === '无权修改此模板') {
      return res.status(403).json({ code: 403, message: error.message, data: null });
    }
    if (error.message === '模板名称不能为空' || error.message === '模板内容不能为空') {
      return res.status(400).json({ code: 400, message: error.message, data: null });
    }
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 删除模板（仅管理员）
router.delete('/:id', authenticateToken, checkPermission('followup_template'), requireAdmin, async (req, res) => {
  try {
    await templateService.deleteTemplate(pool, req.params.id, req.user.userId);
    res.json({ code: 200, message: '删除成功', data: null });
  } catch (error) {
    console.error('[跟进模板] 删除失败:', error);
    if (error.message === '模板不存在') {
      return res.status(404).json({ code: 404, message: error.message, data: null });
    }
    if (error.message === '无权删除此模板') {
      return res.status(403).json({ code: 403, message: error.message, data: null });
    }
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

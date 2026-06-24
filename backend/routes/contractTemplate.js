const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { requireManager } = require('../middleware/admin');
const { success, fail, serverError, notFound } = require('../utils/response');
const { validate, Joi } = require('../middleware/validate');

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
    const [templates] = await pool.query('SELECT * FROM crm_contract_template WHERE deleted_at IS NULL ORDER BY sort');
    success(res, templates);
  } catch (error) {
    console.error('获取模板列表错误:', error);
    serverError(res, '查询失败');
  }
});

// 获取模板详情
router.get('/:id', authenticateToken, checkPermission('contract_template'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_contract_template WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!rows.length) return notFound(res, '模板不存在');
    success(res, rows[0]);
  } catch (error) {
    console.error('获取模板详情错误:', error);
    serverError(res, '查询失败');
  }
});

// 管理模板（仅管理员/经理）
router.post('/manage', authenticateToken, checkPermission('contract_template'), requireManager, validate(templateManageSchema), async (req, res) => {
  try {
    const { action, id, name, amount, payment_terms, delivery_days, remark } = req.body;

    if (action === 'add') {
      const [result] = await pool.query(
        'INSERT INTO crm_contract_template (name, amount, payment_terms, delivery_days, remark) VALUES (?, ?, ?, ?, ?)',
        [name, amount || 0, payment_terms || '', delivery_days || 30, remark || '']
      );
      success(res, { id: result.insertId }, '模板已添加');
    } else if (action === 'update') {
      await pool.query(
        'UPDATE crm_contract_template SET name=?, amount=?, payment_terms=?, delivery_days=?, remark=? WHERE id=?',
        [name, amount, payment_terms, delivery_days, remark, id]
      );
      success(res, null, '模板已更新');
    } else if (action === 'delete') {
      await pool.query('UPDATE crm_contract_template SET deleted_at = NOW() WHERE id = ?', [id]);
      success(res, null, '模板已删除');
    } else {
      return fail(res, '无效操作');
    }
  } catch (error) {
    console.error('管理模板错误:', error);
    serverError(res, '操作失败');
  }
});

module.exports = router;

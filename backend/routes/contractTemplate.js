const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireManager } = require('../middleware/admin');
const { success, fail, serverError, notFound } = require('../utils/response');

// 获取模板列表
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const [templates] = await pool.query('SELECT * FROM crm_contract_template WHERE deleted_at IS NULL ORDER BY sort');
    success(res, templates);
  } catch (error) {
    console.error('获取模板列表错误:', error);
    serverError(res, '查询失败');
  }
});

// 获取模板详情
router.get('/:id', authenticateToken, async (req, res) => {
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
router.post('/manage', authenticateToken, requireManager, async (req, res) => {
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

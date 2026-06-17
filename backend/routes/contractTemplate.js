const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireManager } = require('../middleware/admin');

// 获取模板列表
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const [templates] = await pool.query('SELECT * FROM crm_contract_template ORDER BY sort');
    res.json({ code: 200, message: 'success', data: templates });
  } catch (error) {
    console.error('获取模板列表错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 获取模板详情
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_contract_template WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ code: 404, message: '模板不存在', data: null });
    res.json({ code: 200, message: 'success', data: rows[0] });
  } catch (error) {
    console.error('获取模板详情错误:', error);
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

// 管理模板（仅管理员/经理）
router.post('/manage', authenticateToken, requireManager, async (req, res) => {
  try {
  const { action, id, name, amount, payment_terms, delivery_days, remark } = req.body;

  try {
    if (action === 'add') {
      const [result] = await pool.query(
        'INSERT INTO crm_contract_template (name, amount, payment_terms, delivery_days, remark) VALUES (?, ?, ?, ?, ?)',
        [name, amount || 0, payment_terms || '', delivery_days || 30, remark || '']
      );
      res.json({ code: 200, message: '模板已添加', data: { id: result.insertId } });
    } else if (action === 'update') {
      await pool.query(
        'UPDATE crm_contract_template SET name=?, amount=?, payment_terms=?, delivery_days=?, remark=? WHERE id=?',
        [name, amount, payment_terms, delivery_days, remark, id]
      );
      res.json({ code: 200, message: '模板已更新', data: null });
    } else if (action === 'delete') {
      await pool.query('DELETE FROM crm_contract_template WHERE id = ?', [id]);
      res.json({ code: 200, message: '模板已删除', data: null });
    } else {
      return res.status(400).json({ code: 400, message: '无效操作', data: null });
    }
  } catch (error) {
    console.error('管理模板错误:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
  } catch (error) {
    console.error('管理模板错误:', error);
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

module.exports = router;

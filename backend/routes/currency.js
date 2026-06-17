const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const requireAdmin = require('../middleware/admin');

// 货币列表
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM crm_currency WHERE status = 1 ORDER BY is_default DESC, code ASC'
    );
    res.json({ code: 200, message: '查询成功', data: rows });
  } catch (error) {
    console.error('[货币] 列表查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 获取汇率map（前端用）
router.get('/rates', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT code, name, symbol, exchange_rate, is_default FROM crm_currency WHERE status = 1'
    );
    const rates = {};
    rows.forEach(r => {
      rates[r.code] = { name: r.name, symbol: r.symbol, rate: parseFloat(r.exchange_rate), is_default: !!r.is_default };
    });
    res.json({ code: 200, message: '查询成功', data: rates });
  } catch (error) {
    console.error('[货币] 汇率查询失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

// 更新汇率（管理员）
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { exchange_rate, is_default, status } = req.body;
    const fields = [];
    const values = [];

    if (exchange_rate !== undefined) { fields.push('exchange_rate = ?'); values.push(parseFloat(exchange_rate)); }
    if (is_default !== undefined) {
      if (is_default) {
        await pool.query('UPDATE crm_currency SET is_default = 0');
      }
      fields.push('is_default = ?'); values.push(is_default ? 1 : 0);
    }
    if (status !== undefined) { fields.push('status = ?'); values.push(parseInt(status)); }

    if (fields.length === 0) return res.status(400).json({ code: 400, message: '没有要更新的字段', data: null });

    values.push(id);
    await pool.query(`UPDATE crm_currency SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ code: 200, message: '更新成功', data: null });
  } catch (error) {
    console.error('[货币] 更新汇率失败:', error);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
  }
});

module.exports = router;

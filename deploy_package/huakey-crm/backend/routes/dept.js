const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/list', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM sys_dept ORDER BY sort, id');
    res.json({ code: 200, message: '查询成功', data: { list: rows, total: rows.length } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.post('/add', authenticateToken, async (req, res) => {
  try {
    const { name, parent_id, sort } = req.body;
    if (!name) return res.status(400).json({ code: 400, message: '部门名称不能为空', data: null });
    const [result] = await pool.query(
      'INSERT INTO sys_dept (name, parent_id, sort) VALUES (?, ?, ?)',
      [name, parent_id || 0, sort || 0]
    );
    res.json({ code: 200, message: '新增部门成功', data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '新增部门失败', data: null });
  }
});

router.post('/update', authenticateToken, async (req, res) => {
  try {
    const { id, name, parent_id, sort } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '部门ID不能为空', data: null });
    await pool.query(
      'UPDATE sys_dept SET name=?, parent_id=?, sort=? WHERE id=?',
      [name, parent_id || 0, sort || 0, id]
    );
    res.json({ code: 200, message: '修改部门成功', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '修改部门失败', data: null });
  }
});

router.post('/delete', authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query('DELETE FROM sys_dept WHERE id=?', [id]);
    res.json({ code: 200, message: '删除部门成功', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除部门失败', data: null });
  }
});

module.exports = router;

const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/list', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, code, description, status, create_time, update_time FROM sys_role ORDER BY id');
    res.json({ code: 200, message: '查询成功', data: { list: rows, total: rows.length } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

const requireAdmin = (req, res, next) => {
  if (!req.user.manageAll && req.user.roleId !== 1) {
    return res.status(403).json({ code: 403, message: '无权限操作', data: null });
  }
  next();
};

router.post('/add', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, code, description } = req.body;
    if (!name || !code) {
      return res.status(400).json({ code: 400, message: '角色名称和编码不能为空', data: null });
    }
    const [result] = await pool.query(
      'INSERT INTO sys_role (name, code, description) VALUES (?, ?, ?)',
      [name, code, description || null]
    );
    res.json({ code: 200, message: '新增角色成功', data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '新增角色失败', data: null });
  }
});

router.post('/update', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id, name, code, description, status } = req.body;
    if (!id) return res.status(400).json({ code: 400, message: '角色ID不能为空', data: null });
    await pool.query(
      'UPDATE sys_role SET name=?, code=?, description=?, status=? WHERE id=?',
      [name, code, description, status !== undefined ? status : 1, id]
    );
    res.json({ code: 200, message: '修改角色成功', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '修改角色失败', data: null });
  }
});

router.post('/delete', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query('DELETE FROM sys_role WHERE id=?', [id]);
    res.json({ code: 200, message: '删除角色成功', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除角色失败', data: null });
  }
});

module.exports = router;

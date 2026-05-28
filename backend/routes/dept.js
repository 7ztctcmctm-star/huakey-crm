const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validate, Joi } = require('../middleware/validate');

const router = express.Router();

const deptAddSchema = Joi.object({
  name: Joi.string().required().max(100),
  parent_id: Joi.number().integer().min(0).optional().default(0),
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

const requireAdmin = (req, res, next) => {
  if (!req.user.manageAll && req.user.roleId !== 1) {
    return res.status(403).json({ code: 403, message: '无权限操作', data: null });
  }
  next();
};

router.post('/list', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, parent_id, sort, create_time, update_time FROM sys_dept ORDER BY sort, id');
    res.json({ code: 200, message: '查询成功', data: { list: rows, total: rows.length } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

router.post('/add', authenticateToken, requireAdmin, validate(deptAddSchema), async (req, res) => {
  try {
    const { name, parent_id, sort } = req.body;
    const [result] = await pool.query(
      'INSERT INTO sys_dept (name, parent_id, sort) VALUES (?, ?, ?)',
      [name, parent_id || 0, sort || 0]
    );
    res.json({ code: 200, message: '新增部门成功', data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ code: 500, message: '新增部门失败', data: null });
  }
});

router.post('/update', authenticateToken, requireAdmin, validate(deptUpdateSchema), async (req, res) => {
  try {
    const { id, name, parent_id, sort } = req.body;
    await pool.query(
      'UPDATE sys_dept SET name=?, parent_id=?, sort=? WHERE id=?',
      [name, parent_id || 0, sort || 0, id]
    );
    res.json({ code: 200, message: '修改部门成功', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '修改部门失败', data: null });
  }
});

router.post('/delete', authenticateToken, requireAdmin, validate(deptDeleteSchema), async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query('DELETE FROM sys_dept WHERE id=?', [id]);
    res.json({ code: 200, message: '删除部门成功', data: null });
  } catch (error) {
    res.status(500).json({ code: 500, message: '删除部门失败', data: null });
  }
});

module.exports = router;

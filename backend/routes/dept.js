const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validate, Joi } = require('../middleware/validate');

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

const requireAdmin = require('../middleware/admin');

router.post('/list', authenticateToken, checkPermission('system:dept'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, parent_id, sort, create_time, update_time FROM sys_dept ORDER BY sort, id');
    res.json({ code: 200, message: '查询成功', data: { list: rows, total: rows.length } });
  } catch (error) {
    console.error('[部门管理] 查询失败:', error);
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
    console.error('[部门管理] 新增部门失败:', error);
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
    console.error('[部门管理] 修改部门失败:', error);
    res.status(500).json({ code: 500, message: '修改部门失败', data: null });
  }
});

router.post('/delete', authenticateToken, requireAdmin, validate(deptDeleteSchema), async (req, res) => {
  try {
    const { id } = req.body;
    // 检查是否有子部门
    const [children] = await pool.query('SELECT COUNT(*) as cnt FROM sys_dept WHERE parent_id = ?', [id]);
    if (children[0].cnt > 0) {
      return res.status(400).json({ code: 400, message: `该部门下有 ${children[0].cnt} 个子部门，无法删除`, data: null });
    }
    // 检查是否有用户属于该部门
    const [users] = await pool.query('SELECT COUNT(*) as cnt FROM sys_user WHERE dept_id = ?', [id]);
    if (users[0].cnt > 0) {
      return res.status(400).json({ code: 400, message: `该部门下有 ${users[0].cnt} 个用户，无法删除`, data: null });
    }
    await pool.query('DELETE FROM sys_dept WHERE id=?', [id]);
    res.json({ code: 200, message: '删除部门成功', data: null });
  } catch (error) {
    console.error('[部门管理] 删除部门失败:', error);
    res.status(500).json({ code: 500, message: '删除部门失败', data: null });
  }
});

module.exports = router;
